#!/bin/bash
# Double-click this file (or run it) to launch FreeTune.
cd "$(dirname "$0")"
PORT="${1:-8808}"

# Open the browser shortly after the server starts.
( sleep 1.2; open "http://127.0.0.1:${PORT}" ) &

echo "Starting FreeTune on http://127.0.0.1:${PORT} ..."
exec /usr/bin/python3 server.py "$PORT"
