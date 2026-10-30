#!/usr/bin/env bash
# Run/stop backend and frontend together or individually.
#   ./dev.sh start [backend|frontend]     (default: both)
#   ./dev.sh stop [backend|frontend]
#   ./dev.sh restart [backend|frontend]
#   ./dev.sh status
#   ./dev.sh logs [backend|frontend]      (tail -f)
#   ./dev.sh tunnel [start|stop|status]   (open the app to your phone / the internet over ngrok)
ROOT="$(cd "$(dirname "$0")" && pwd)"
RUN="$ROOT/.dev"
mkdir -p "$RUN"

cmd_for() { # name -> dir
  case "$1" in
    backend)  echo "$ROOT/backend" ;;
    frontend) echo "$ROOT/frontend" ;;
  esac
}

targets() { [ -n "$1" ] && echo "$1" || echo "backend frontend"; }

validate() {
  case "$1" in backend|frontend|"") ;; *) echo "Unknown target '$1' (use backend or frontend)"; exit 1 ;; esac
}

port_for() { # name -> port (backend: backend/.env PORT, default 4000; frontend: port Next reports, default 3000)
  if [ "$1" = backend ]; then
    local p; p="$(grep -E '^PORT=' "$ROOT/backend/.env" 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '"\r ')"
    echo "${p:-4000}"
  else
    local p; p="$(grep -oE 'localhost:[0-9]+' "$RUN/frontend.log" 2>/dev/null | head -1 | cut -d: -f2)"
    echo "${p:-3000}"
  fi
}

is_running() { [ -f "$RUN/$1.pid" ] && kill -0 "$(cat "$RUN/$1.pid")" 2>/dev/null; }

kill_tree() { # pid
  local child
  for child in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$child"; done
  kill "$1" 2>/dev/null
}

start_one() {
  local name="$1" dir; dir="$(cmd_for "$name")"
  if is_running "$name"; then echo "$name already running (pid $(cat "$RUN/$name.pid"))"; return; fi
  # $RUN/<name>.env holds KEY=VALUE overrides (written by `tunnel`), applied on top of the .env files.
  (cd "$dir" && nohup env $(cat "$RUN/$name.env" 2>/dev/null) npm run dev >"$RUN/$name.log" 2>&1 & echo $! >"$RUN/$name.pid")
  [ "$name" = frontend ] && sleep 3 # let Next report its actual port
  echo "$name started on http://localhost:$(port_for "$name") (pid $(cat "$RUN/$name.pid")), log: .dev/$name.log"
}

stop_one() {
  local name="$1"
  if ! is_running "$name"; then echo "$name not running"; rm -f "$RUN/$name.pid"; return; fi
  kill_tree "$(cat "$RUN/$name.pid")"
  rm -f "$RUN/$name.pid"
  echo "$name stopped"
}

# ---- tunnel: reach the app from a phone (or anywhere) over ngrok -------------------------------------
# Needs two tunnels - the frontend (the page) and the backend (the API + live socket) - because the page talks to the
# API straight from the browser. Existing ngrok tunnels to those ports are reused, never closed by us.
ngrok_url_for() { # local port -> public https URL of a running ngrok tunnel pointed at it
  local p url
  for p in 4040 4041 4042 4043 4044 4045 4046; do
    url="$(curl -s -m 2 "localhost:$p/api/tunnels" 2>/dev/null | python3 -c "
import sys, json
try: d = json.load(sys.stdin)
except Exception: sys.exit()
for t in d.get('tunnels', []):
    if t['config']['addr'].rstrip('/').endswith(':$1') and t['public_url'].startswith('https'): print(t['public_url']); break
" 2>/dev/null)"
    [ -n "$url" ] && { echo "$url"; return; }
  done
}

ensure_tunnel() { # name port -> prints the URL, starting ngrok if nothing is tunnelling that port yet
  local name="$1" port="$2" url i
  url="$(ngrok_url_for "$port")"
  if [ -z "$url" ]; then
    nohup ngrok http "$port" --log=stdout >"$RUN/ngrok-$name.log" 2>&1 &
    echo $! >"$RUN/ngrok-$name.pid"
    for i in $(seq 1 20); do sleep 1; url="$(ngrok_url_for "$port")"; [ -n "$url" ] && break; done
  fi
  echo "$url"
}

tunnel() {
  case "${1:-start}" in
    start)
      command -v ngrok >/dev/null || { echo "ngrok isn't installed (brew install ngrok, then ngrok config add-authtoken <token>)"; exit 1; }
      is_running frontend && is_running backend || { echo "Start the app first: ./dev.sh start"; exit 1; }
      local fe_port be_port fe_url be_url
      fe_port="$(port_for frontend)"; be_port="$(port_for backend)"
      be_url="$(ensure_tunnel backend "$be_port")"; fe_url="$(ensure_tunnel frontend "$fe_port")"
      [ -n "$be_url" ] && [ -n "$fe_url" ] || { echo "Couldn't open the tunnels - see .dev/ngrok-*.log"; exit 1; }
      # Point the page at the public API, and let the API accept the page's public address.
      echo "CORS_ORIGINS=$fe_url" >"$RUN/backend.env"
      echo "NEXT_PUBLIC_API_URL=$be_url NEXT_PUBLIC_SOCKET_URL=$be_url PORT=$fe_port" >"$RUN/frontend.env"
      stop_one backend; stop_one frontend; sleep 1; start_one backend; start_one frontend
      echo; echo "Open this on your phone:  $fe_url"
      echo "(first visit shows ngrok's \"Visit Site\" button - tap it once. API: $be_url)"
      echo "Stop with: ./dev.sh tunnel stop" ;;
    stop)
      for n in frontend backend; do
        [ -f "$RUN/ngrok-$n.pid" ] && kill "$(cat "$RUN/ngrok-$n.pid")" 2>/dev/null && echo "closed the $n tunnel"
        rm -f "$RUN/ngrok-$n.pid" "$RUN/$n.env"
      done
      stop_one backend; stop_one frontend; sleep 1; start_one backend; start_one frontend ;;
    status)
      echo "frontend tunnel: $(ngrok_url_for "$(port_for frontend)" | head -1)"
      echo "backend tunnel:  $(ngrok_url_for "$(port_for backend)" | head -1)"
      [ -f "$RUN/frontend.env" ] && echo "(the app is currently pointed at the tunnel)" || echo "(the app is using localhost)" ;;
    *) echo "Usage: ./dev.sh tunnel [start|stop|status]"; exit 1 ;;
  esac
}

[ "$1" = tunnel ] && { tunnel "$2"; exit 0; }

validate "$2"
case "$1" in
  start)   for t in $(targets "$2"); do start_one "$t"; done ;;
  stop)    for t in $(targets "$2"); do stop_one "$t"; done ;;
  restart) for t in $(targets "$2"); do stop_one "$t"; done; sleep 1; for t in $(targets "$2"); do start_one "$t"; done ;;
  status)  for t in backend frontend; do is_running "$t" && echo "$t: running on http://localhost:$(port_for "$t") (pid $(cat "$RUN/$t.pid"))" || echo "$t: stopped"; done ;;
  logs)    if [ -n "$2" ]; then tail -f "$RUN/$2.log"; else tail -f "$RUN"/backend.log "$RUN"/frontend.log; fi ;;
  *) sed -n '2,7p' "$0"; exit 1 ;;
esac
