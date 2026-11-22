@echo off
cd /d "%~dp0"
title SchoolChat server
echo Starting SchoolChat. Keep this window open while you use the app.
echo Admin app: http://localhost:8000/admin/
echo Student and Teacher app: http://localhost:8000/
start "" http://localhost:8000/admin/
py -3 server.py --sample || python server.py --sample
pause
