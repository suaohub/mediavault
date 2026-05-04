#!/bin/bash
# MediaVault — macOS launcher
# Usage: bash start.sh  or  double-click after: chmod +x start.sh

PORT=8765
DIR="$(cd "$(dirname "$0")" && pwd)"

# Kill any previous instance on this port
lsof -ti tcp:$PORT | xargs kill -9 2>/dev/null

# Pick an available HTTP server
if command -v python3 &>/dev/null; then
  python3 -m http.server $PORT --directory "$DIR" &>/dev/null &
elif command -v python &>/dev/null; then
  cd "$DIR" && python -m SimpleHTTPServer $PORT &>/dev/null &
elif command -v npx &>/dev/null; then
  npx --yes serve "$DIR" -p $PORT &>/dev/null &
else
  echo "Error: python3 / python / npx not found. Please install one of them."
  exit 1
fi

SERVER_PID=$!

# Wait for the server to be ready (max 5 s)
for i in $(seq 1 10); do
  curl -s http://localhost:$PORT >/dev/null && break
  sleep 0.5
done

# Open browser
open "http://localhost:$PORT"

echo "MediaVault running at http://localhost:$PORT"
echo "Press Ctrl+C to stop."

# Keep script alive so Ctrl+C kills the server
trap "kill $SERVER_PID 2>/dev/null; exit" INT TERM
wait $SERVER_PID
