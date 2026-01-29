#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

LOG_DIR="$ROOT_DIR/.run-logs"
mkdir -p "$LOG_DIR"

say() { printf "%s\n" "$*"; }
need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    say "Missing dependency: '$1' is not installed or not on PATH."
    exit 1
  fi
}

# --- Choose Python interpreter (prefer the repo venv if present) ---
PYTHON=""
if [[ -x "$ROOT_DIR/BOT/Scripts/python.exe" ]]; then
  PYTHON="$ROOT_DIR/BOT/Scripts/python.exe"
elif [[ -x "$ROOT_DIR/.venv/Scripts/python.exe" ]]; then
  PYTHON="$ROOT_DIR/.venv/Scripts/python.exe"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON="$(command -v python3)"
elif command -v python >/dev/null 2>&1; then
  PYTHON="$(command -v python)"
else
  say "Missing dependency: python is not installed (or not on PATH)."
  exit 1
fi

say "Using Python: $PYTHON"

# --- Ensure .env exists (do not overwrite) ---
if [[ ! -f "$ROOT_DIR/.env" && -f "$ROOT_DIR/.env.example" ]]; then
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  say "Created .env from .env.example (edit if needed)."
fi

# --- Python deps ---
"$PYTHON" -m pip install --upgrade pip >/dev/null
say "Installing Python dependencies (requirements.txt)…"
"$PYTHON" -m pip install -r "$ROOT_DIR/requirements.txt" >"$LOG_DIR/pip-install.log" 2>&1 || {
  say "Python dependency install failed. See $LOG_DIR/pip-install.log"
  exit 1
}

# --- Runtime prerequisite checks (fail fast with clear guidance) ---
say "Checking MongoDB on 127.0.0.1:27017…"
if ! "$PYTHON" - <<'PY'
import socket
s = socket.socket()
s.settimeout(1.0)
try:
  s.connect(("127.0.0.1", 27017))
except Exception:
  raise SystemExit(1)
finally:
  try:
    s.close()
  except Exception:
    pass
PY
then
  say "MongoDB does not seem to be running on 127.0.0.1:27017."
  say "Start MongoDB (Docker example):"
  say "  docker run --name intranet-mongo -p 27017:27017 -d mongo:7"
  exit 1
fi

say "Checking Ollama on http://localhost:11434…"
if ! "$PYTHON" - <<'PY'
import urllib.request
try:
  urllib.request.urlopen("http://localhost:11434/api/tags", timeout=2).read()
except Exception:
  raise SystemExit(1)
PY
then
  say "Ollama is not reachable at http://localhost:11434."
  say "Start Ollama, then pull models (example):"
  say "  ollama pull llama3.2"
  say "  ollama pull nomic-embed-text"
  exit 1
fi

# --- Optional: ensure vector DB exists (ingest if missing) ---
if [[ ! -d "$ROOT_DIR/vectordb" || -z "$(ls -A "$ROOT_DIR/vectordb" 2>/dev/null || true)" ]]; then
  say "Vector DB not found; running ingestion (backend.ingest)…"
  "$PYTHON" -m backend.ingest >"$LOG_DIR/ingest.log" 2>&1 || {
    say "Ingestion failed. See $LOG_DIR/ingest.log"
    exit 1
  }
fi

# --- Node deps (frontend + ticket backend) ---
need_cmd node
need_cmd npm

if [[ ! -d "$ROOT_DIR/frontend/node_modules" ]]; then
  say "Installing frontend dependencies (npm install)…"
  (cd "$ROOT_DIR/frontend" && npm install) >"$LOG_DIR/npm-frontend-install.log" 2>&1 || {
    say "Frontend npm install failed. See $LOG_DIR/npm-frontend-install.log"
    exit 1
  }
fi

if [[ -d "$ROOT_DIR/Ticket/Backend" && ! -d "$ROOT_DIR/Ticket/Backend/node_modules" ]]; then
  say "Installing ticket-backend dependencies (npm install)…"
  (cd "$ROOT_DIR/Ticket/Backend" && npm install) >"$LOG_DIR/npm-ticket-install.log" 2>&1 || {
    say "Ticket backend npm install failed. See $LOG_DIR/npm-ticket-install.log"
    exit 1
  }
fi

# --- Start processes ---
BACKEND_PID=""
FRONTEND_PID=""
TICKET_PID=""

cleanup() {
  say "\nStopping services…"
  [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  [[ -n "$BACKEND_PID" ]] && kill "$BACKEND_PID" >/dev/null 2>&1 || true
  [[ -n "$TICKET_PID" ]] && kill "$TICKET_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

say "Starting FastAPI backend on http://127.0.0.1:8000 …"
"$PYTHON" -m uvicorn backend.api:app --reload --port 8000 >"$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

if [[ -f "$ROOT_DIR/Ticket/Backend/index.js" ]]; then
  say "Starting Ticket API on http://127.0.0.1:5000 …"
  (cd "$ROOT_DIR/Ticket/Backend" && node index.js) >"$LOG_DIR/ticket.log" 2>&1 &
  TICKET_PID=$!
fi

say "Starting Vite frontend on http://127.0.0.1:5173 …"
(cd "$ROOT_DIR/frontend" && npm run dev -- --host 127.0.0.1 --port 5173) >"$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!

say "\nAll services launched."
say "- Frontend: http://127.0.0.1:5173"
say "- Backend:  http://127.0.0.1:8000/docs"
say "- Ticket:   http://127.0.0.1:5000 (if enabled)"
say "\nLogs: $LOG_DIR (backend.log, frontend.log, ticket.log)"
say "Press Ctrl+C to stop."

# Keep this script alive while services run
wait "$FRONTEND_PID"
