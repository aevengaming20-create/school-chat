SchoolChat: An Institutionally-Managed Group Communication and Academic Task System
BSIT 3-6, Cavite State University Bacoor Campus

TWO APPS, ONE SERVER, ONE DATABASE
  portal/   Student & Teacher app   -> http://localhost:8000/
  admin/    Admin app               -> http://localhost:8000/admin/
  server.py The shared backend. Everything is saved in one database file (schoolchat.db)
            and the server checks the user's role on EVERY request.

  Admin app  --\
                >--> server.py (checks who you are and your role) --> schoolchat.db
  Portal app --/

QUICK START
  1. Install Python 3 from python.org (Windows: tick "Add Python to PATH"). Nothing else to install.
  2. EXTRACT the whole zip, then start the server:
        Windows:     double-click  start-windows.bat
        Mac/Linux:   run  ./start.sh      (or:  python3 server.py --sample)
     Keep that window open while you use the app.
  3. DO NOT double-click index.html. Always open the addresses above in your browser.
  4. FIRST TIME ONLY: on /admin/ you see "Register Admin" (full name, email, password).
     Registration closes after the first admin. Later the admin logs in with EMAIL + PASSWORD.
  5. The admin creates Student and Teacher accounts (Accounts tab) and gives each person an ID:
        Students -> Student ID + password   (Student button on the portal login)
        Teachers -> Faculty ID + password   (Teacher button on the portal login)
  6. With --sample (the launchers use it), demo accounts appear when the admin registers
     (password sample123):  Teacher T-001   Students 2022-0001, 2022-0002
  7. Phones on the same Wi-Fi: open http://<your-computer-IP>:8000/

TROUBLESHOOTING
  - "Server is not running" screen: the server is not started yet (step 2), or the page was opened
    as a file. It re-checks every 2 seconds and switches to the right screen by itself.
  - Admin page shows a LOGIN but no Register: an admin already exists in schoolchat.db
    (for example from an earlier run). Either log in with that admin's email, or stop the server
    (Ctrl+C) and run:   python server.py --reset-admin    (removes only the admin account),
    then open /admin/ and register again. Deleting schoolchat.db starts completely fresh.
  - Earlier test version: its admin was  admin@school.edu  with password  admin123.

WHAT THE SERVER ENFORCES (not just hidden buttons)
  - The admin app only accepts the admin (email). The portal only accepts Student and Teacher IDs,
    and the ID must match the button used (a teacher ID on the Student button is refused).
  - Only the admin creates accounts, schedules and groups.
  - The admin can read class chats but cannot send messages, and never receives tasks or submissions.
  - The admin can ban a student (button on the student's message, or in Accounts). A banned user is
    logged out within about 2 seconds and cannot log in until unbanned.
  - Students only get the groups they belong to; chat needs a tap on Join Group Chat first.
  - Teachers only post tasks and announcements in their own classes. Passwords are salted hashes.

CODE MAP
  server.py        database, login, permissions, file serving
  */index.html     the page      */style.css  the design      */app.js  the app logic
  (portal/ and admin/ share most of their code; the difference is which login each accepts.)

LIMITS OF THIS PROTOTYPE
  Run it on a school or home network. For the internet it needs HTTPS, a stronger database and
  rate limiting. Files shared in chat are limited to 150 KB.
