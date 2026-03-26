#!/bin/bash

# ─── Combat Terminal Launcher ──────────────────────────────────────────────────
# Double-click to start. Serves everything from a single Python server.

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Kill anything already on port 8000
lsof -ti:8000 | xargs kill -9 2>/dev/null

echo "Starting Combat Terminal..."
PYTHON="$(which python3)"
osascript -e "tell application \"Terminal\" to do script \"cd '$DIR' && '$PYTHON' main.py\""

echo "Waiting for server..."
for i in $(seq 1 30); do
  if curl -s http://127.0.0.1:8000 > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "Opening browser..."
open http://127.0.0.1:8000
