#!/bin/sh
cd "$(dirname "$0")"
echo "Starting SchoolChat. Keep this window open while you use the app."
(sleep 1; (open http://localhost:8000/admin/ || xdg-open http://localhost:8000/admin/) >/dev/null 2>&1) &
python3 server.py --sample
