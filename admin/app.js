/*
 * SchoolChat: An Institutionally-Managed Group Communication and Academic Task System
 * BSIT 3-6, Cavite State University Bacoor Campus
 *
 * One file for the whole app: data, login, dashboards, chat, tasks and admin screens.
 * Screens are built as HTML strings by small functions and drawn by render().
 */
// ==============================================================
// DATA: collections, app state and the shared database
// ==============================================================
const COLS = ['users', 'groups', 'members', 'messages', 'tasks', 'subs', 'anns'],
  D = {};
COLS.forEach(c => D[c] = []);
let db = null,
  ready = false,
  me = '',
  view = {p: 'home'},
  q = '',
  nOpen = false,
  openT = '',
  pend = null,
  err = '';
const APP = 'admin';
let TOKEN = '',
  VER = 0,
  lr = 'Student',
  NEED = false,
  DOWN = false;
const LBL = {Student: 'Student ID', Teacher: 'Faculty ID'};
try {
  TOKEN = localStorage.getItem('sc_tok_'+APP) || ''
} catch (_) {}

// ==============================================================
// HELPERS: lookups, role checks, formatting and password hashing
// ==============================================================
const $ = i => document.getElementById(i),
  app = $('app'),
  uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2, 7);
const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const fd = t => new Date(t).toLocaleString([], {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'});
const U = id => D.users.find(u => u.id == id),
  G = id => D.groups.find(g => g.id == id),
  nm = id => (U(id) || {name: 'Unknown'}).name,
  gn = id => id == 'all' ? 'Whole school' : (G(id) || {name: '?'}).name;
const cu = () => D.users.find(u => u.id == me && u.status == 'Active'),
  isA = () => cu().role == 'Admin',
  isT = () => cu().role == 'Teacher',
  isS = () => cu().role == 'Student';
const act = g => !g.arch,
  memIds = () => D.members.filter(m => m.u == me && m.j !== false).map(m => m.g),
  mine = () => (isA() ? D.groups : D.groups.filter(g => memIds().includes(g.id))).filter(act),
  ids = () => mine().map(g => g.id);
const mt = s => !q || String(s).toLowerCase().includes(q.toLowerCase()),
  clr = (...a) => a.forEach(i => $(i) && ($(i).value = ''));
const stat = t => {
  const s = D.subs.find(s => s.t == t.id && s.u == me);
  return s ? s.status : 'pending'
},
  badge = t => `<span class="s-${stat(t)}">${stat(t)}</span>`;
const H = async(p, s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s+p)))].map(b => b.toString(16).padStart(2, '0')).join('');

// ==============================================================
// NAVIGATION AND RENDERING: toast, go, render
// ==============================================================
function toast(t) {
  const d = document.createElement('div');
  d.className = 'toast';
  d.textContent = t;
  document.body.append(d);
  setTimeout(() => d.remove(), 4500)
}

// ==============================================================
// SERVER CONNECTION: api calls, put / delete, create user
// ==============================================================
async function api(path, body) {
  try {
    const r = await fetch('/api/'+path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...body, token: TOKEN})});
    if (r.status == 401) {
      endSession('Your session ended. If your account was banned, contact the administrator.');
      return null
    }
    return await r.json()
  } catch (e) {
    return{error: 'Cannot reach the server. Is it running?'}
  }
}

async function put(c, o) {
  const i = D[c].findIndex(x => x.id == o.id),
    v = {...o};
  delete v.pw;
  i < 0 ? D[c].push(v) : D[c][i] = v;
  render();
  const r = await api('put', {col: c, doc: o});
  if (r && r.error) toast(r.error);
  VER = 0;
  sync()
}

async function del(c, id) {
  D[c] = D[c].filter(x => x.id != id);
  render();
  const r = await api('del', {col: c, doc: {id}});
  if (r && r.error) toast(r.error);
  VER = 0;
  sync()
}

async function mk(sid, name, email, role, pw, sec = '') {
  const id = uid();
  await put('users', {id, sid, name, email, role, sec, status: 'Active', pw});
  return id
}

function go(p, g, tab) {
  view = {p, g, tab: tab || 'chat'};
  nOpen = false;
  render();
  scrollTo({top: 0, behavior: 'smooth'})
}

function render() {
  if (!ready) {
    app.innerHTML = '<p class="mu" style="padding:20px">Loading…</p>';
    return
  }
  const vals = {};
  document.querySelectorAll('#app [id]').forEach(e => {
    if ('value'in e && e.type != 'file' && e.tagName != 'BUTTON') vals[e.id] = e.value
  });
  const a = document.activeElement,
    af = a && a.id,
    ss = a && a.selectionStart,
    c0 = $('chat'),
    stick = !c0 || c0.scrollHeight-c0.scrollTop-c0.clientHeight < 80;
  app.innerHTML = !cu() ? (DOWN ? downView() : APP == 'admin' && NEED ? regView() : login3()) : shell();
  for (const k in vals) {
    const e = $(k);
    if (e) e.value = vals[k]
  }
  if (af && $(af)) {
    $(af).focus();
    try {
      $(af).setSelectionRange(ss, ss)
    } catch (_) {}
  }
  const c = $('chat');
  if (c && stick) c.scrollTop = c.scrollHeight
}

// ==============================================================
// LOGIN, LOGOUT AND SESSION
// ==============================================================
const login3 = () => {
  const ad = APP == 'admin';
  return `<div class=lg>
    <div class=lh>
    <img class=lgo src=logo.png alt=""><h1>SchoolChat</h1>
    <div>${ad?'Administrator Portal':'The official class chat of your school.'}</div>
    <ul>${ad?'<li>Create accounts and build schedules</li><li>Read class chats and ban rule-breakers</li><li>Post school-wide announcements</li>':'<li>Chat, announcements and tasks in one place</li><li>Accounts managed by the school admin</li><li>Works on phone and computer</li>'}</ul></div>
    <div class=lr>
    <div class=card>${ad?'':`<div class=rt>${['Student','Teacher'].map(r=>`<button id=tab${r} class="tab ${lr==r?'on':''}" onclick="setRole('${r}')">${r=='Student'?'🎓':'👩‍🏫'} ${r}</button>`).join('')}</div>`}
    <h2 id=lt>${ad?'🛡️ Admin Login':lr+' Login'}</h2>${NEED&&!ad?'<p class=err>The school admin has not set up SchoolChat yet.</p>':''}<label id=ll>${ad?'Email':LBL[lr]}</label><input id=li autocomplete=username placeholder="${ad?'admin@school.edu':LBL[lr]}" value="${E(ss('sc_li'))}"><label>Password</label><input id=lp type=password autocomplete=current-password onkeydown="if(event.key=='Enter')doLogin()">
    <div id=le class=err>${E(err)}</div><button id=lb class=pr onclick=doLogin()>${ad?'LOGIN':'LOGIN AS '+lr.toUpperCase()}</button>
    <p class=mu>${ad?'Forgot the admin password, or no register screen? Run <b>python server.py --reset-admin</b> on the server computer.':'Accounts are created by the school administrator.'}</p></div></div></div>`
};
const ss = k => {
  try {
    return sessionStorage.getItem(k) || ''
  } catch (_) {
    return ''
  }
};
const downView = () => `<div class=lg>
  <div class=lh>
  <img class=lgo src=logo.png alt=""><h1>SchoolChat</h1>
  <div>${APP=='admin'?'Administrator Portal':'The official class chat of your school.'}</div></div>
  <div class=lr>
  <div class=card>
  <h2>⚠️ Server is not running</h2>
  <p class=mu>${location.protocol=='file:'?'You opened this page as a file. SchoolChat must be opened through its server.':'This page cannot reach the SchoolChat server.'}</p><ol>
  <li>Install Python 3 from python.org (tick “Add Python to PATH”).</li>
  <li>Open the SchoolChat folder and double-click <b>start-windows.bat</b> (Mac/Linux: <b>start.sh</b>), or run <b>python server.py</b>.</li>
  <li>Open <b>http://localhost:8000/</b> for students and teachers, or <b>http://localhost:8000/admin/</b> for the admin.</li></ol>
  <p class=mu>This screen checks again by itself every 2 seconds.</p></div></div></div>`;

function setRole(r) {
  lr = r;
  err = '';
  ['Student', 'Teacher'].forEach(x => $('tab'+x).classList.toggle('on', x == r));
  $('lt').textContent = r+' Login';
  $('ll').textContent = LBL[r];
  $('li').placeholder = LBL[r];
  $('lb').textContent = 'LOGIN AS '+r.toUpperCase();
  $('le').textContent = '';
  $('li').focus()
}
const regView = () => `<div class=lg>
  <div class=lh>
  <img class=lgo src=logo.png alt=""><h1>SchoolChat</h1>
  <div>Administrator Portal</div>
  <ul>
  <li>First-time setup</li>
  <li>Register the school administrator</li>
  <li>Then create accounts and schedules</li></ul></div>
  <div class=lr>
  <div class=card>
  <h2>🛡️ Register Admin</h2>
  <p class=mu>Create the administrator account. This is only available until the first admin is registered.</p><label>Full name</label><input id=rn autocomplete=name><label>Email</label><input id=re type=email autocomplete=email><label>Password</label><input id=rp type=password autocomplete=new-password placeholder="6+ characters" onkeydown="if(event.key=='Enter')doReg()">
  <div class=err>${E(err)}</div><button class=pr onclick=doReg()>REGISTER</button></div></div></div>`;

async function post(path, body) {
  try {
    return await (await fetch('/api/'+path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})).json()
  } catch (e) {
    return{error: 'Cannot reach the server. Is it running?'}
  }
}

function signedIn(r) {
  if (r.error) {
    err = r.error;
    return render()
  }
  TOKEN = r.token;
  try {
    localStorage.setItem('sc_tok_'+APP, TOKEN);
    sessionStorage.removeItem('sc_li')
  } catch (_) {}
  err = '';
  NEED = false;
  view = {p: 'home'};
  VER = 0;
  sync()
}

async function doLogin() {
  const ad = APP == 'admin',
    i = $('li').value.trim(),
    p = $('lp').value;
  if (!i || !p) {
    err = ad ? 'Enter your email and password.' : 'Enter your '+LBL[lr]+' and password.';
    return render()
  }
  signedIn(await post('login', {id: i, pw: p, app: APP, role: lr}))
}

async function doReg() {
  const n = $('rn').value.trim(),
    e = $('re').value.trim(),
    p = $('rp').value;
  if (!n || !/^\S+@\S+\.\S+$/.test(e) || p.length < 6) {
    err = 'Enter your name, a valid email and a password of 6+ characters.';
    return render()
  }
  const r = await post('register', {name: n, email: e, pw: p});
  if (r.error) NEED = false;
  signedIn(r)
}

function endSession(msg) {
  TOKEN = '';
  me = '';
  try {
    localStorage.removeItem('sc_tok_'+APP)
  } catch (_) {}
  COLS.forEach(c => D[c] = []);
  view = {p: 'home'};
  err = msg;
  render()
}

function logout() {
  api('logout', {});
  endSession('')
}

function ban(x) {
  const w = U(x.u) || {};
  return isA() && w.role == 'Student' && w.status == 'Active' ? `<button class=ban onclick="tog('${x.u}')">🚫 Ban</button>` : ''
}

// ==============================================================
// NOTIFICATIONS
// ==============================================================
function seen() {
  try {
    return+localStorage.getItem('sc_seen_'+me) || 0
  } catch (_) {
    return 0
  }
}

function markRead() {
  try {
    localStorage.setItem('sc_seen_'+me, Date.now())
  } catch (_) {}
  render()
}

function notes() {
  const m = memIds(),
    s = seen(),
    o = [],
    n = Date.now();
  D.messages.filter(x => m.includes(x.g) && x.u != me && x.at > s).forEach(x => o.push({at: x.at, g: x.g, t: `New message in ${gn(x.g)} from ${nm(x.u)}`}));
  D.tasks.filter(x => m.includes(x.g) && x.by != me && x.at > s).forEach(x => o.push({at: x.at, g: x.g, t: `New task in ${gn(x.g)}: ${x.title}`}));
  D.anns.filter(x => (x.g == 'all' || m.includes(x.g)) && x.by != me && x.at > s).forEach(x => o.push({at: x.at, g: x.g, t: `New announcement in ${gn(x.g)}: ${x.title}`}));
  if (isS()) D.tasks.filter(x => m.includes(x.g) && x.due > n && x.due-n < 1728e5 && !D.subs.some(y => y.t == x.id && y.u == me)).forEach(x => o.push({at: x.due, g: x.g, t: `Deadline approaching: ${x.title} (${fd(x.due)})`}));
  return o.sort((a, b) => b.at-a.at).slice(0, 30)
}

// ==============================================================
// APP LAYOUT AND DASHBOARD (home)
// ==============================================================
function shell() {
  const n = notes();
  return `<div class=top><b><img class=brand-logo src=logo.png alt="">SchoolChat</b><span class=chip>${cu().role} Dashboard</span><input id=sq placeholder="Search..." value="${E(q)}" oninput="q=this.value;render()"><span class=tl onclick="nOpen=!nOpen;render()">🔔<span class=nt> Notification</span>${n.length?` <i>${n.length}</i>`:''}</span></div>

    <div class=body>
    <aside>${isA()?'':'<b>MY GROUPS</b>'}${(isA()?[]:mine()).filter(g=>mt(g.name)).map(g=>`<div class="lk ${view.p=='group'&&view.g==g.id?'on':''}" onclick="go('group','${g.id}')">💬 ${E(g.name)}</div>`).join('')||(isA()?'':'<div class=mu>None yet.</div>')}<br>${nv('home','🏠 Dashboard')}${isA()?'':nv('tasks','📝 Tasks')}${nv('anns','📢 Announcements')}${isA()?nv('admin','⚙️ Manage'):''}${nv('profile','👤 Profile')}<button onclick="logout()">🚪 Log Out</button></aside>

    <main>${nOpen?`<div class=box><b>Notifications</b> <button onclick=markRead()>Mark all read</button>${n.map(x=>`<p class=lk onclick="go('${x.g=='all'?'anns':'group'}','${x.g}','chat')">• ${E(x.t)} <small>${fd(x.at)}</small></p>`).join('')||'<p class=mu>You’re all caught up.</p>'}</div>`:''}${({home,group,tasks:tasksPage,anns:annsPage,admin:adminV,profile})[view.p]()}</main></div>`
}

function home() {
  const i = ids(),
    an = D.anns.filter(a => vis(a) && mt(a.title+a.body)).sort((a, b) => b.at-a.at).slice(0, 4),
    tk = D.tasks.filter(t => !isA() && i.includes(t.g) && (!isT() || t.by == me) && mt(t.title) && (!isS() || stat(t) == 'pending')).sort((a, b) => a.due-b.due).slice(0, 5),
    ms = D.messages.filter(m => i.includes(m.g) && mt(m.text)).sort((a, b) => b.at-a.at).slice(0, 5);
  return `${hero()}${dash()}<b>ANNOUNCEMENT</b>
    <div class=box>${an.map(a=>`<p>${a.g=='all'?'📣':'-'} <b>${E(a.title)}</b> <small>${E(gn(a.g))}</small><br>${E(a.body)}</p>`).join('')||'<p class=mu>None yet.</p>'}</div>
${isA()?'':'<b>UPCOMING TASKS</b>'}
    <div class=box${isA()?' hidden':''}>${tk.map(t=>`<p class=lk onclick="go('group','${t.g}','tasks')">- ${E(t.title)} · ${E(gn(t.g))} · Due: ${fd(t.due)} ${isS()?badge(t):''}</p>`).join('')||'<p class=mu>No upcoming tasks.</p>'}</div>
<b>RECENT MESSAGES</b>
    <div class=box>${ms.map(m=>`<p class=lk onclick="go('group','${m.g}','chat')">- ${E(gn(m.g))}: ${E(nm(m.u))}: ${E(m.text||m.fn)}</p>`).join('')||'<p class=mu>No messages yet.</p>'}</div>`
}

// ==============================================================
// CLASS PAGE: chat, tasks and members
// ==============================================================
function group() {
  const g = G(view.g);
  if (!g || !ids().includes(g.id)) return '<p>You don’t have access to this group.</p>';
  const tabs = ['chat', ...(isA() ? [] : ['tasks']), 'members'].map(t => `<button class="tab ${view.tab==t?'on':''}" onclick="view.tab='${t}';render()">${t[0].toUpperCase()+t.slice(1)}</button>`).join(' ');
  return `<div class=gh><b class=lk onclick="go('home')">&lt; ${E(g.name)}</b><span>${tabs}</span></div>
    <p class=mu>${E(g.subject)} · ${E(g.time)} · Teacher: ${E(nm(g.teacher))}</p>`+({chat: g => isA() ? vMon(g) : vChat(g), tasks: vTasks, members: vMembers}[view.tab])(g)
}

function vChat(g) {
  const it = [...D.messages.filter(m => m.g == g.id).map(m => ({...m, k: 'm'})), ...D.tasks.filter(t => t.g == g.id && !isA()).map(t => ({...t, k: 't'}))].sort((a, b) => a.at-b.at);
  return `<div id=chat class=chat>${it.map(x=>x.k=='t'?`<div class="bub task"><b>TASK: ${E(x.title)}</b> | Due: ${fd(x.due)}<br><a class=lk onclick="go('group','${g.id}','tasks')">[ View ]</a>${isS()?` <a class=lk onclick="openT='${x.id}';go('group','${g.id}','tasks')">[ Submit ]</a>`:''}</div>`
  :`<div class="bub ${x.u==me?'me':''}"><b><i class=av>${E(nm(x.u)[0])}</i> ${E(nm(x.u))}</b> <small>(${(U(x.u)||{}).role||''}) ${fd(x.at)}</small>${ban(x)}<br>${E(x.text)}${x.file?`<br><a href="${x.file}" download="${E(x.fn)}">📎 ${E(x.fn)}</a>`:''}${rx(x)}</div>`).join('')||'<p class=mu>No messages yet.</p>'}</div>

    <div class=send><label class=btn style="margin:0">File<input type=file hidden onchange="pick(this)"></label><input id=ci placeholder="Type a message..." onkeydown="if(event.key=='Enter')sendMsg()"><button class=pr onclick=sendMsg()>SEND</button></div><small>${pend?'Attached: '+E(pend.name):''}</small>`
}

function pick(i) {
  const f = i.files[0];
  if (!f) return;
  if (f.size > 15e4) return toast('File too large (max 150 KB in this prototype).');
  const r = new FileReader();
  r.onload = () => {
    pend = {name: f.name, data: r.result};
    render()
  };
  r.readAsDataURL(f)
}

async function sendMsg() {
  const t = $('ci').value.trim();
  if (!t && !pend) return;
  await put('messages', {id: uid(), g: view.g, u: me, text: t, file: pend ? pend.data : '', fn: pend ? pend.name : '', at: Date.now()});
  pend = null;
  clr('ci');
  render()
}

function vTasks(g) {
  const ts = D.tasks.filter(t => t.g == g.id && (!isT() || t.by == me)).sort((a, b) => a.due-b.due),
    can = isT() && g.teacher == me;
  const form = can ? `<div class=box><b>Post a task</b><input id=tt placeholder="Title"><textarea id=ti placeholder="Instructions"></textarea><label>Deadline</label><input id=td type=datetime-local> <button class=pr onclick="postTask('${g.id}')">Post task</button></div>` : '';
  return form+(ts.map(t => card(t, can)).join('') || '<p class=mu>No tasks yet.</p>')
}

function card(t, can) {
  const subs = D.subs.filter(s => s.t == t.id);
  let b = '';
  if (can) b = `<div class=ov>
    <table>
    <tr><th>Student<th>Submitted<th>Status<th>Work<th>Score</tr>${subs.map(s=>`<tr><td>${E(nm(s.u))}<td>${fd(s.at)}<td class="s-${s.status}">${s.status}<td>${s.file?`<a href="${s.file}" download="${E(s.fn)}">${E(s.fn)}</a> `:''}${E(s.text)}<td><input class=sc id="sc${s.id}" value="${E(s.score)}" onchange="score('${s.id}',this.value)"></tr>`).join('')}
    </table></div>${subs.length?'':'<p class=mu>No submissions yet.</p>'}`;
  else if (isS()) {
    const s = subs.find(s => s.u == me);
    b = s ? `<p>Your submission: ${E(s.text)} ${s.fn?'📎 '+E(s.fn):''}<br>Score: ${E(s.score)||'—'}</p>` : openT == t.id ? `<textarea id=sa placeholder="Your answer"></textarea><label class=btn>File<input type=file hidden onchange="pick(this)"></label> <small>${pend?E(pend.name):''}</small> <button class=pr onclick="submitTask('${t.id}')">Submit</button>` : `<button onclick="openT='${t.id}';render()">Submit</button>`
  }
  return `<div class=box><b>${E(t.title)}</b> — Due: ${fd(t.due)} ${isS()?badge(t):''}
    <p>${E(t.ins)}</p>${b}</div>`
}

async function postTask(g) {
  const t = $('tt').value.trim(),
    d = new Date($('td').value).getTime();
  if (!t || isNaN(d)) return toast('Add a title and a deadline.');
  await put('tasks', {id: uid(), g, title: t, ins: $('ti').value.trim(), due: d, by: me, at: Date.now()});
  clr('tt', 'ti', 'td');
  toast('Task posted.')
}

async function submitTask(id) {
  const t = D.tasks.find(x => x.id == id),
    x = $('sa').value.trim();
  if (!x && !pend) return toast('Type an answer or attach a file.');
  const now = Date.now();
  await put('subs', {id: id+'_'+me, t: id, u: me, text: x, file: pend ? pend.data : '', fn: pend ? pend.name : '', at: now, status: now > t.due ? 'late' : 'submitted', score: ''});
  pend = null;
  openT = '';
  render()
}

function score(id, v) {
  put('subs', {...D.subs.find(s => s.id == id), score: v})
}

function vMembers(g) {
  const ms = D.members.filter(m => m.g == g.id),
    add = D.users.filter(u => u.role != 'Admin' && u.status == 'Active' && !ms.some(m => m.u == u.id));
  return `<div class=ov>
    <table>
    <tr><th>Name<th>Role<th>ID<th></tr>${ms.map(m=>`<tr><td>${E(nm(m.u))}<td>${(U(m.u)||{}).role}<td>${E((U(m.u)||{}).sid)}<td>${isA()&&m.u!=g.teacher?`<button onclick="del('members','${m.id}')">Remove</button>`:''}</tr>`).join('')}
    </table></div>`+(isA() ? `<p><select id=ms>${add.map(u=>`<option value="${u.id}">${E(u.name)} (${u.role})`).join('')}</select> <button class=pr onclick="addMem('${g.id}')">Add member</button></p>` : '')
}

function addMem(g) {
  const u = $('ms').value;
  if (u) put('members', {id: g+'_'+u, g, u, j: U(u).role != 'Student', at: Date.now()})
}

// ==============================================================
// TASKS AND ANNOUNCEMENTS PAGES
// ==============================================================
function tasksPage() {
  const ts = D.tasks.filter(t => !isA() && ids().includes(t.g) && (!isT() || t.by == me) && mt(t.title)).sort((a, b) => a.due-b.due);
  return `<h3>Tasks</h3>
    <div class=ov>
    <table>
    <tr><th>Task<th>Group<th>Deadline<th>${isS()?'Status':'Submissions'}</tr>${ts.map(t=>`<tr class=lk onclick="go('group','${t.g}','tasks')"><td>${E(t.title)}<td>${E(gn(t.g))}<td>${fd(t.due)}<td>${isS()?badge(t):D.subs.filter(s=>s.t==t.id).length}</tr>`).join('')}
    </table></div>`
}

function annsPage() {
  const as = D.anns.filter(a => vis(a) && mt(a.title+a.body)).sort((a, b) => b.at-a.at);
  return `<h3>Announcements</h3>${isA()||isT()?`<div class=box><b>${isA()?'📣 Announce to the whole school':'Post to your students'}</b><select id=ag${isA()?' hidden':''}><option value="*">All my groups${mine().map(g=>`<option value="${g.id}">${E(g.name)}`).join('')}</select><input id=an_t placeholder="Title"><textarea id=an_b placeholder="Message"></textarea><button class=pr onclick=postAnn()>Post</button></div>`:''}${as.map(a=>`<div class=box${a.g=='all'?' style="border:2px solid var(--g)"':''}><b>${a.g=='all'?'📣 ':''}${E(a.title)}</b> <small>${E(gn(a.g))} · ${E(nm(a.by))} · ${fd(a.at)}</small>
      <p>${E(a.body)}</p></div>`).join('')||'<p class=mu>No announcements.</p>'}`
}

async function postAnn() {
  const t = $('an_t').value.trim(),
    b = $('an_b').value.trim(),
    s = isA() ? 'all' : $('ag').value;
  if (!t || !b) return toast('Add a title and a message.');
  for (const g of s == 'all' ? [{id: 'all'}] : s == '*' ? mine() : [G(s)]) await put('anns', {id: uid(), g: g.id, title: t, body: b, by: me, at: Date.now()});
  clr('an_t', 'an_b');
  toast('Announcement posted.')
}

// ==============================================================
// ADMIN ACTIONS AND PROFILE
// ==============================================================
async function addUser() {
  const v = k => $(k).value.trim(),
    sid = v('nu'),
    n = v('nn'),
    e = v('ne'),
    pw = $('npw').value;
  if (!sid || !n || pw.length < 6) return toast('Enter the ID, full name and a temporary password (6+ characters).');
  if (D.users.some(u => (u.sid || '').toLowerCase() == sid.toLowerCase() || (e && (u.email || '').toLowerCase() == e.toLowerCase()))) return toast('That ID or email already exists.');
  await mk(sid, n, e, $('nr').value, pw, ($('nsc') || {value: ''}).value.trim());
  clr('nu', 'nn', 'ne', 'npw', 'nsc');
  toast('Account created.')
}

function tog(id) {
  if (id == me) return toast('You can’t ban your own account.');
  const u = U(id);
  put('users', {...u, status: u.status == 'Active' ? 'Banned' : 'Active'})
}

async function rst(id) {
  const u = U(id);
  await put('users', {...u, pw: u.sid});
  toast('Password reset to the user’s School ID.')
}

function profile() {
  const u = cu();
  return `<h3>Profile</h3>
    <p>${E(u.name)}<br>${u.role=='Admin'?'':`${LBL[u.role]}: ${E(u.sid)}<br>`}Email: ${E(u.email)||'—'}<br>Role: ${u.role}</p><b>CHANGE PASSWORD</b>
    <div class=box><input id=op type=password placeholder="Current password"> <input id=np2 type=password placeholder="New password (6+ characters)"> <button class=pr onclick=chpw()>Update</button></div>`
}

async function chpw() {
  const n = $('np2').value;
  if (n.length < 6) return toast('New password must be 6+ characters.');
  const r = await api('passwd', {old: $('op').value, new: n});
  if (!r || r.error) return toast((r && r.error) || 'Could not update the password.');
  clr('op', 'np2');
  toast('Password updated.')
}

// ==============================================================
// ROLE DASHBOARDS: tiles, class cards and the admin screens
// ==============================================================
const tile = (n, l, k) => `<div class="tile${k?' lk':''}${k&&view.l==k?' sel':''}"${k?` onclick="showL('${k}')"`:''}><i>${ic[l]||''}</i><b>${n}</b><span>${l}</span></div>`;
const cdG = (g, m) => `<div class=cd style="border-top:5px solid hsl(${hh(g.subject)},55%,45%)"><b>${E(g.subject)}</b><small>${E(g.name)}</small><span>${E(g.time)}</span><span class=mu>${E(nm(g.teacher))}</span>${m&&m.j===false?`<button class=pr onclick="joinG('${m.id}')">Join Group Chat</button>`:`<button onclick="go('group','${g.id}')">Open chat</button>`}</div>`;
const joinG = id => {
  put('members', {...D.members.find(x => x.id == id), j: true});
  toast('You joined the class chat.')
};

function dash() {
  const r = cu().role,
    i = ids(),
    u = D.users;
  if (r == 'Admin') return `<div class=tiles>${tile(u.filter(x=>x.role=='Student').length,'Students','Students')}${tile(u.filter(x=>x.role=='Teacher').length,'Teachers','Teachers')}${tile(D.groups.filter(act).length,'Active schedules','Active schedules')}${tile(D.groups.filter(g=>!act(g)).length,'Archived','Archived')}</div>${lp()}
    <p><button class=pr onclick="go('admin');view.at='sched';render()">Build schedule</button> <button onclick="go('admin');view.at='users';render()">Add accounts</button></p>`;
  if (r == 'Teacher') {
    const my = D.tasks.filter(t => t.by == me).map(t => t.id);
    return `<div class=tiles>${tile(i.length,'My classes')}${tile(my.length,'Tasks posted')}${tile(D.subs.filter(s=>my.includes(s.t)&&!s.score).length,'To grade')}</div><b>MY CLASSES</b>
      <div class=cds>${mine().map(g=>cdG(g)).join('')||'<p class=mu>No classes assigned yet.</p>'}</div>`
  }
  const ms = D.members.filter(m => m.u == me && G(m.g) && act(G(m.g))),
    todo = D.tasks.filter(t => i.includes(t.g) && stat(t) == 'pending').length;
  return `<div class=tiles>${tile(i.length,'Subjects joined')}${tile(todo,'Tasks to do')}</div>${prog()}<b>MY SUBJECTS</b>
    <div class=cds>${ms.map(m=>cdG(G(m.g),m)).join('')||'<p class=mu>No subjects yet. The admin enrolls you when your section’s schedule is built.</p>'}</div>`
}

function adminV() {
  const T = view.at || 'ov',
    tc = D.users.filter(u => u.role == 'Teacher'),
    tb = [['ov', 'Overview'], ['users', 'Accounts'], ['sched', 'Schedules']].map(([k, l]) => `<button class="tab ${T==k?'on':''}" onclick="view.at='${k}';render()">${l}</button>`).join(' '),
    b = T == 'ov' ? dash()+`<p class=mu>Flow: 1) create accounts → 2) build a schedule (section, subject, teacher, time) → the class chat is created and every student of that section is enrolled → 3) students tap “Join Group Chat” → 4) archive the schedules at year end.</p>` : T == 'users' ? `<div class=box><b>Add one account</b><select id=nr><option>Student<option>Teacher</select> <input id=nu placeholder="Student ID / Faculty ID"> <input id=nn placeholder="Full name"> <input id=ne placeholder="Email (optional)"> <input id=nsc placeholder="Section (students)"> <input id=npw placeholder="Temporary password"> <button class=pr onclick=addUser()>Create</button></div>
    <div class=box><b>Add many students</b> <small>One per line: Student ID, Full name, Email (optional), Section (password = Student ID)</small><textarea id=bk placeholder="2022-0100, Ana Cruz, ana@school.edu, BSIT 3-6"></textarea><button class=pr onclick=bulk()>Create all</button></div>
    <div class=ov>
    <table>
    <tr><th>ID<th>Name<th>Role<th>Section<th>Status<th></tr>${D.users.map(u=>`<tr><td>${E(u.sid)||'—'}<td>${E(u.name)}<br><small>${E(u.email)}</small><td>${u.role}<td>${E(u.sec)}<td>${u.status}<td>${u.role=='Admin'?'':`<button onclick="tog('${u.id}')">${u.status=='Active'?'🚫 Ban':'Unban'}</button> <button onclick="rst('${u.id}')">Reset password</button>`}</tr>`).join('')}
    </table></div>` : `<div class=box><b>Build a schedule</b> <small>Creates the class chat and enrolls the section</small><input id=gsc placeholder="Section (e.g. BSIT 3-6)"> <input id=gsb placeholder="Subject (e.g. INSY 55)"> <select id=gtc>${tc.map(t=>`<option value="${t.id}">${E(t.name)}`).join('')}</select> <input id=gd placeholder="Days (e.g. MWF)"> <input id=g1 type=time> <input id=g2 type=time> <button class=pr onclick=addSched()>Create schedule</button></div>
    <p><button onclick=archAll()>Archive all (year end)</button></p>
    <div class=ov>
    <table>
    <tr><th>Section<th>Subject<th>Time<th>Teacher<th>Students<th></tr>${D.groups.map(g=>`<tr class="${g.arch?'mu':''}"><td>${E(g.section||g.name)}<td>${E(g.subject)}<td>${E(g.time)}<td>${E(nm(g.teacher))}<td>${D.members.filter(m=>m.g==g.id&&(U(m.u)||{}).role=='Student').length}<td>${g.arch?'':`<button onclick="go('group','${g.id}','members')">Manage</button> <button onclick="go('group','${g.id}')">View chat</button> `}<button onclick="arch('${g.id}')">${g.arch?'Restore':'Archive'}</button></tr>`).join('')}
    </table></div>`;
  return `<h3>Administrator</h3>
    <div class=gh><span>${tb}</span></div>${b}`
}

async function addSched() {
  const sc = $('gsc').value.trim(),
    sb = $('gsb').value.trim(),
    t = $('gtc').value,
    d = $('gd').value.trim(),
    a = $('g1').value,
    e = $('g2').value;
  if (!sc || !sb || !t || !d || !a || !e) return toast('Fill in section, subject, teacher, days and time.');
  if (e <= a) return toast('End time must be after start time.');
  const tm = `${d} ${a}–${e}`;
  if (D.groups.some(g => !g.arch && g.teacher == t && g.time == tm)) return toast('That teacher already has a class at this time.');
  const g = uid(),
    now = Date.now();
  let n = 0;
  await put('groups', {id: g, name: sc+'_'+sb, section: sc, type: 'Class', subject: sb, time: tm, teacher: t, by: me, at: now});
  await put('members', {id: g+'_'+t, g, u: t, j: true, at: now});
  for (const s of D.users.filter(u => u.role == 'Student' && u.status == 'Active' && (u.sec || '').toLowerCase() == sc.toLowerCase())) {
    await put('members', {id: g+'_'+s.id, g, u: s.id, j: false, at: now});
    n++
  }
  clr('gsc', 'gsb', 'gd', 'g1', 'g2');
  toast(`Schedule created. Class chat is ready; ${n} student(s) enrolled.`)
}

function arch(id) {
  const g = G(id);
  put('groups', {...g, arch: !g.arch})
}

function archAll() {
  if (!view.cf) {
    view.cf = 1;
    toast('Tap again to archive every active schedule.');
    return
  }
  view.cf = 0;
  D.groups.filter(act).forEach(g => put('groups', {...g, arch: true}))
}

async function bulk() {
  const L = $('bk').value.split('\n').map(l => l.split(',').map(x => x.trim())).filter(r => r[0]);
  let n = 0,
    k = 0;
  for (const[sid, name, email, sec] of L) {
    if (!name || D.users.some(u => (u.sid || '').toLowerCase() == sid.toLowerCase() || (email && (u.email || '').toLowerCase() == email.toLowerCase()))) {
      k++;
      continue
    }
    await mk(sid, name, email, 'Student', sid, sec || '');
    n++
  }
  clr('bk');
  toast(`${n} account(s) created, ${k} skipped.`)
}

// ==============================================================
// HERO BANNER AND ICONS
// ==============================================================
const ic = {Students: '🎓', Teachers: '👩‍🏫', 'Active schedules': '📅', Archived: '🗄️', 'My classes': '🏫', 'Tasks posted': '📝', 'To grade': '✅', 'Subjects joined': '📚', 'Tasks to do': '⏳'},
  RI = {Admin: ['🛡️', 'Manage accounts, schedules and class chats.'], Teacher: ['👩‍🏫', 'Your classes, tasks and announcements in one place.'], Student: ['🎓', 'Your subjects, tasks and class chats in one place.']};
const hero = () => {
  const r = cu().role;
  return `<div class=hero>
    <div class=hi>${RI[r][0]}</div>
    <div>
    <h2>${r} Dashboard</h2>
    <div>${gr()}, ${E(cu().name)}!</div><small>${RI[r][1]}</small></div></div>`
};

// ==============================================================
// ADMIN: tappable tiles and read-only chat monitor
// ==============================================================
const showL = k => {
  view.l = view.l == k ? '' : k;
  render()
};
const vMon = g => vChat(g).replace(/<div class=send>[\s\S]*$/, '<p class=mon>👁️ Monitoring mode: admins can read class chats to keep them safe, but can’t send messages. Use 🚫 Ban on a student’s message if they break the rules.</p>');
const lp = () => {
  const k = view.l;
  if (!k) return '';
  let h;
  if (k == 'Students' || k == 'Teachers') {
    const r = k.slice(0, -1);
    h = `<div class=ov>
      <table>
      <tr><th>Name<th>School ID<th>Email<th>${r=='Student'?'Section':'Classes'}<th>Status</tr>${D.users.filter(u=>u.role==r).map(u=>`<tr><td>${E(u.name)}<td>${E(u.sid)}<td>${E(u.email)}<td>${r=='Student'?E(u.sec):D.groups.filter(g=>g.teacher==u.id&&act(g)).map(g=>E(g.name)).join(', ')}<td>${u.status}</tr>`).join('')||'<tr><td colspan=5>None yet.'}
      </table></div>`
  } else {
    const a = k == 'Active schedules';
    h = `<div class=ov>
      <table>
      <tr><th>Section<th>Subject<th>Time<th>Teacher<th>Students<th></tr>${D.groups.filter(g=>act(g)==a).map(g=>`<tr><td>${E(g.section||g.name)}<td>${E(g.subject)}<td>${E(g.time)}<td>${E(nm(g.teacher))}<td>${D.members.filter(m=>m.g==g.id&&(U(m.u)||{}).role=='Student').length}<td>${a?`<button onclick="go('group','${g.id}')">View chat</button>`:`<button onclick="arch('${g.id}')">Restore</button>`}</tr>`).join('')||'<tr><td colspan=6>None.'}
      </table></div>`
  }
  return `<div class=box><b>${k}</b> <small>(tap the tile again to close)</small>${h}</div>`
};

// ==============================================================
// INTERACTIVE EXTRAS: nav buttons, greeting, reactions and progress card
// ==============================================================
const nv = (p, l) => `<button class="nv ${view.p==p?'on':''}" onclick="go('${p}')">${l}</button>`;
const gr = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
},
  hh = s => [...String(s)].reduce((a, c) => a+c.charCodeAt(0) * 7, 0) % 360;
const rx = x => isA() ? '' : `<div class=rx>${['👍','❤️','😂'].map(e=>{const a=(x.r||{})[e]||[];return `<span class="rc ${a.includes(me)?'on':''}" onclick="react('${x.id}','${e}')">${e}${a.length?' '+a.length:''}</span>`}).join('')}</div>`;

function react(id, e) {
  const m = D.messages.find(y => y.id == id),
    r = {...(m.r || {})},
    a = [...(r[e] || [])],
    i = a.indexOf(me);
  i < 0 ? a.push(me) : a.splice(i, 1);
  r[e] = a;
  put('messages', {...m, r})
}
const left = t => {
  const m = Math.max(0, Math.round((t-Date.now()) / 6e4));
  return m < 60 ? m+' min' : m < 1440 ? Math.floor(m / 60)+' h' : Math.floor(m / 1440)+' d '+Math.floor(m % 1440 / 60)+' h'
};
const prog = () => {
  const i = ids(),
    ts = D.tasks.filter(t => i.includes(t.g)),
    d = ts.filter(t => stat(t) != 'pending').length,
    p = ts.length ? Math.round(d / ts.length * 100) : 0,
    nx = ts.filter(t => stat(t) == 'pending' && t.due > Date.now()).sort((a, b) => a.due-b.due)[0];
  return `<div class=box><b>Your progress: ${p}%</b> <small>${d} of ${ts.length} tasks submitted</small>
    <div class=pb>
    <div style="width:${p}%"></div></div>${nx?`<p class=lk onclick="go('group','${nx.g}','tasks')">⏰ Next: <b>${E(nx.title)}</b> · ${E(gn(nx.g))} · due in ${left(nx.due)} →</p>`:'<p class=mu>🎉 Nothing due. You’re all caught up!</p>'}</div>`
};

// ==============================================================
// ANNOUNCEMENT VISIBILITY
// ==============================================================
const vis = a => a.g == 'all' || (isA() ? false : isT() ? a.by == me : ids().includes(a.g));

async function checkSetup() {
  const was = [DOWN, NEED, ready];
  try {
    NEED = (await (await fetch('/api/status')).json()).needsAdmin;
    DOWN = false
  } catch (e) {
    DOWN = true
  }
  ready = true;
  if (was[0] != DOWN || was[1] != NEED || !was[2]) render()
}

// ==============================================================
// SYNC LOOP AND START-UP: ask the server for changes every 2 seconds
// ==============================================================
async function sync() {
  if (!TOKEN) {
    if (!ready || DOWN) await checkSetup();
    return
  }
  try {
    const r = await fetch('/api/sync?token='+TOKEN+'&v='+VER);
    if (r.status == 401) return endSession('Your session ended. If your account was banned, contact the administrator.');
    const j = await r.json();
    ready = true;
    if (!j.same) {
      VER = j.v;
      me = j.me;
      COLS.forEach(c => D[c] = j.data[c] || []);
      render()
    }
  } catch (e) {
    ready = true;
    if (!me) render()
  }
}
setInterval(sync, 2000);
sync();
document.addEventListener('input', e => {
  if (e.target.id == 'li') try {
    sessionStorage.setItem('sc_li', e.target.value)
  } catch (_) {}
});
render();
