#!/usr/bin/env python3
"""
SchoolChat server (Python standard library only, no installs needed).

  * One SQLite database (schoolchat.db) shared by BOTH apps.
  * portal/  -> Student & Teacher app   at  http://localhost:8000/
  * admin/   -> Admin app               at  http://localhost:8000/admin/
  * Every request is checked here on the server, so hiding a button is not the only protection.

Run:   python server.py            (then open /admin/ and register the administrator)
       python server.py --sample   (also adds a demo teacher, students and classes after that)
"""
import argparse, hashlib, json, mimetypes, os, secrets, sqlite3, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
LOCK = threading.RLock()
db = sqlite3.connect(os.path.join(ROOT, 'schoolchat.db'), check_same_thread=False)
db.execute('create table if not exists docs(col text, id text, body text, primary key(col, id))')
COLS = ['users', 'groups', 'members', 'messages', 'tasks', 'subs', 'anns']
TOKENS = {}      # session token -> user id
SAMPLE = [False]   # --sample: add demo data when the admin registers
VERSION = [1]    # bumps on every change so apps only download when something changed


# ---------------------------------------------------------------- database helpers
def rows(col):
    return [json.loads(b) for (b,) in db.execute('select body from docs where col=?', (col,))]

def get(col, id_):
    r = db.execute('select body from docs where col=? and id=?', (col, id_)).fetchone()
    return json.loads(r[0]) if r else None

def save(col, doc):
    db.execute('insert or replace into docs values(?,?,?)', (col, doc['id'], json.dumps(doc)))
    db.commit(); VERSION[0] += 1

def remove(col, id_):
    db.execute('delete from docs where col=? and id=?', (col, id_))
    db.commit(); VERSION[0] += 1

def hash_pw(pw, salt):
    return hashlib.pbkdf2_hmac('sha256', pw.encode(), salt.encode(), 100_000).hex()

def make_user(sid, name, email, role, pw, sec=''):
    salt = secrets.token_hex(8)
    u = dict(id=secrets.token_hex(6), sid=sid, name=name, email=email, role=role, sec=sec,
             status='Active', salt=salt, pw=hash_pw(pw, salt))
    save('users', u)
    return u['id']


# ---------------------------------------------------------------- who can see what
def joined_groups(u):
    return {m['g'] for m in rows('members') if m['u'] == u['id'] and m.get('j') is not False}

def snapshot(u):
    """Only the data this user is allowed to see (the server does the filtering)."""
    admin = u['role'] == 'Admin'
    members = rows('members')
    mine = {m['g'] for m in members if m['u'] == u['id']}
    joined = joined_groups(u)
    groups = [g for g in rows('groups') if admin or g['id'] in mine]
    gids = {g['id'] for g in groups}
    users = rows('users')
    if admin:
        shown = users
    else:
        near = {m['u'] for m in members if m['g'] in gids} | {g['teacher'] for g in groups} | {u['id']}
        shown = [x for x in users if x['id'] in near]
    shown = [{k: v for k, v in x.items() if k not in ('pw', 'salt') and (admin or k not in ('email',))} for x in shown]
    tasks = [] if admin else [t for t in rows('tasks') if t['g'] in joined]
    tids = {t['id'] for t in tasks}
    subs = [] if admin else [s for s in rows('subs') if s['t'] in tids and
                             (u['role'] == 'Teacher' or s['u'] == u['id'])]
    return dict(
        users=shown, groups=groups,
        members=[m for m in members if admin or m['g'] in gids],
        messages=[m for m in rows('messages') if m['g'] in (gids if admin else joined)],
        tasks=tasks, subs=subs,
        anns=[a for a in rows('anns') if a['g'] == 'all' or (not admin and a['g'] in joined)])

def can_write(u, col, d, old):
    role = u['role']
    if col in ('users', 'groups'):
        return role == 'Admin'
    if col == 'members':
        if role == 'Admin':
            return True
        return bool(old) and old['u'] == u['id'] and d['u'] == old['u'] and d['g'] == old['g']  # student taps "Join"
    if col == 'anns':
        if role == 'Admin':
            return d.get('g') == 'all' and d.get('by') == u['id']
        g = get('groups', d.get('g'))
        return role == 'Teacher' and d.get('by') == u['id'] and bool(g) and g['teacher'] == u['id']
    if role == 'Admin':
        return False                          # admin never chats and never sees tasks
    if col == 'messages':
        if d.get('g') not in joined_groups(u):
            return False
        if old is None:
            return d.get('u') == u['id']
        same = lambda x: {k: v for k, v in x.items() if k != 'r'}
        return same(d) == same(old)           # only reactions may change
    g = get('groups', d.get('g')) if col == 'tasks' else None
    if col == 'tasks':
        return role == 'Teacher' and bool(g) and g['teacher'] == u['id'] and d.get('by') == u['id']
    if col == 'subs':
        t = get('tasks', d.get('t'))
        if not t:
            return False
        if role == 'Student':
            return old is None and d.get('u') == u['id'] and t['g'] in joined_groups(u)
        return role == 'Teacher' and t['by'] == u['id'] and bool(old) and \
            {k: v for k, v in d.items() if k != 'score'} == {k: v for k, v in old.items() if k != 'score'}
    return False


# ---------------------------------------------------------------- HTTP
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def send(self, code, body, ctype='application/json'):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store'); self.end_headers(); self.wfile.write(data)

    def user(self, token):
        return get('users', TOKENS.get(token, ''))

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == '/api/sync':
            q = parse_qs(url.query)
            with LOCK:
                u = self.user(q.get('token', [''])[0])
                if not u or u['status'] != 'Active':
                    return self.send(401, {'error': 'session ended'})
                if q.get('v', ['0'])[0] == str(VERSION[0]):
                    return self.send(200, {'same': True})
                return self.send(200, {'v': VERSION[0], 'me': u['id'], 'data': snapshot(u)})
        if url.path == '/api/status':
            return self.send(200, {'needsAdmin': not any(u['role'] == 'Admin' for u in rows('users'))})
        path = url.path
        if path == '/admin':
            self.send_response(301); self.send_header('Location', '/admin/'); self.end_headers(); return
        folder, rel = ('admin', path[len('/admin/'):]) if path.startswith('/admin/') else ('portal', path.lstrip('/'))
        full = os.path.realpath(os.path.join(ROOT, folder, rel or 'index.html'))
        if not full.startswith(os.path.join(ROOT, folder)) or not os.path.isfile(full):
            return self.send(404, b'Not found', 'text/plain')
        self.send(200, open(full, 'rb').read(), mimetypes.guess_type(full)[0] or 'application/octet-stream')

    def do_POST(self):
        try:
            b = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))) or b'{}')
        except ValueError:
            return self.send(400, {'error': 'bad request'})
        with LOCK:
            route = urlparse(self.path).path
            if route == '/api/login':
                return self.login(b)
            if route == '/api/register':
                return self.register(b)
            u = self.user(b.get('token', ''))
            if not u or u['status'] != 'Active':
                return self.send(401, {'error': 'session ended'})
            if route == '/api/logout':
                TOKENS.pop(b['token'], None); return self.send(200, {})
            if route == '/api/passwd':
                if hash_pw(b.get('old', ''), u['salt']) != u['pw']:
                    return self.send(200, {'error': 'Current password is incorrect.'})
                u['salt'] = secrets.token_hex(8); u['pw'] = hash_pw(b.get('new', ''), u['salt'])
                save('users', u); return self.send(200, {})
            col, d = b.get('col'), b.get('doc') or {}
            if col not in COLS or not isinstance(d.get('id'), str):
                return self.send(400, {'error': 'bad request'})
            old = get(col, d['id'])
            if route == '/api/put':
                if not can_write(u, col, d, old):
                    return self.send(200, {'error': 'You are not allowed to do that.'})
                if col == 'users':
                    err = self.prepare_user(u, d, old)
                    if err:
                        return self.send(200, {'error': err})
                save(col, d); return self.send(200, {})
            if route == '/api/del':
                if col == 'members' and u['role'] == 'Admin':
                    remove(col, d['id']); return self.send(200, {})
                return self.send(200, {'error': 'You are not allowed to do that.'})
            self.send(404, {'error': 'unknown'})

    def prepare_user(self, admin, d, old):
        if 'pw' in d:
            d['salt'] = secrets.token_hex(8); d['pw'] = hash_pw(d['pw'], d['salt'])
        elif old:
            d['pw'], d['salt'] = old['pw'], old['salt']
        else:
            return 'A password is required.'
        if d['id'] == admin['id'] and d.get('status') != 'Active':
            return 'You cannot ban your own account.'
        for x in rows('users'):
            same_id = d.get('sid') and x.get('sid', '').lower() == d['sid'].lower()
            same_mail = d.get('email') and x.get('email', '').lower() == d['email'].lower()
            if x['id'] != d['id'] and (same_id or same_mail):
                return 'That ID or email already exists.'
        if d.get('status') != 'Active':       # banned: end their sessions right away
            for t in [t for t, uid in TOKENS.items() if uid == d['id']]:
                del TOKENS[t]

    def register(self, b):
        """First-time setup: creates the one administrator (name, email, password). Closed afterwards."""
        if any(u['role'] == 'Admin' for u in rows('users')):
            return self.send(200, {'error': 'An administrator is already registered. Please log in.'})
        name, email, pw = str(b.get('name', '')).strip(), str(b.get('email', '')).strip(), str(b.get('pw', ''))
        if not name or '@' not in email or len(pw) < 6:
            return self.send(200, {'error': 'Enter your name, a valid email and a password of 6+ characters.'})
        aid = make_user('', name, email, 'Admin', pw)
        if SAMPLE[0]:
            seed_sample(aid)
        token = secrets.token_hex(16); TOKENS[token] = aid
        self.send(200, {'token': token})

    def login(self, b):
        """Admin app: email + password.  Portal: Student ID or Faculty ID + password, with the matching role button."""
        ident, pw, app, role = str(b.get('id', '')).strip().lower(), str(b.get('pw', '')), b.get('app'), b.get('role')
        time.sleep(0.4)                                  # slows down password guessing
        if app == 'admin':
            found = [u for u in rows('users') if u['role'] == 'Admin' and u['email'].lower() == ident]
        else:
            found = [u for u in rows('users') if u['role'] != 'Admin' and u['sid'].lower() == ident]
        for u in found:
            if secrets.compare_digest(hash_pw(pw, u['salt']), u['pw']):
                if app != 'admin' and role != u['role']:
                    return self.send(200, {'error': f"This ID belongs to a {u['role']} account. Use the {u['role']} login button."})
                if u['status'] != 'Active':
                    return self.send(200, {'error': 'This account has been banned. Contact the administrator.'})
                token = secrets.token_hex(16); TOKENS[token] = u['id']
                return self.send(200, {'token': token})
        self.send(200, {'error': 'Invalid email or password.' if app == 'admin' else 'Invalid ID or password.'})


def seed_sample(admin_id):
    t = make_user('T-001', 'Ma’am Reyes', 'teacher@school.edu', 'Teacher', 'sample123')
    s = [make_user('2022-0001', 'Juan Dela Cruz', 'juan@school.edu', 'Student', 'sample123', 'BSIT 3-6'),
         make_user('2022-0002', 'Maria Santos', 'maria@school.edu', 'Student', 'sample123', 'BSIT 3-6')]
    now = int(time.time() * 1000)
    for name in ('BSIT 3-6_INSY 55', 'BSIT 3-6_ITEC 90'):
        g = secrets.token_hex(6)
        save('groups', dict(id=g, name=name, section='BSIT 3-6', type='Class', subject=name.split('_')[1],
                            time='MWF 1:00–2:30 PM', teacher=t, by=admin_id, at=now))
        for u in [t] + s:
            save('members', dict(id=g + '_' + u, g=g, u=u, j=u == t, at=now))
        save('tasks', dict(id=secrets.token_hex(6), g=g, title='Activity 2', ins='Submit your design document.',
                           due=now + 6048e5, by=t, at=now))
    save('anns', dict(id=secrets.token_hex(6), g='all', title='No classes on Friday',
                      body='Midterm schedule will be posted soon.', by=admin_id, at=now))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8000)
    ap.add_argument('--reset-admin', action='store_true', help='delete the admin account so a new admin can register')
    ap.add_argument('--sample', action='store_true', help='add a demo teacher, students and classes when the admin registers')
    a = ap.parse_args()
    SAMPLE[0] = a.sample
    if a.reset_admin:
        for u in [u for u in rows('users') if u['role'] == 'Admin']:
            remove('users', u['id'])
        print('Admin account removed. Open /admin/ to register a new administrator.')
    if not any(u['role'] == 'Admin' for u in rows('users')):
        print(f'No admin yet: open http://localhost:{a.port}/admin/ and register the administrator first.')
    print(f'Student/Teacher app: http://localhost:{a.port}/\nAdmin app:           http://localhost:{a.port}/admin/')
    ThreadingHTTPServer(('0.0.0.0', a.port), Handler).serve_forever()
