#!/bin/sh
# Run the clauvid share platform.
#
#   ./run.sh                 start in Docker → http://localhost:4747 (builds the UI first if needed)
#   ./run.sh --auth          start with basic auth from share-platform/.auth
#   ./run.sh --native [port] start without Docker, in the foreground (Ctrl-C stops it)
#   ./run.sh stop            stop it
#   ./run.sh restart         restart the server (after changing server.mjs or lib/)
#   ./run.sh build           rebuild the UI (after changing share-platform/ui)
#   ./run.sh status          is it running?
#   ./run.sh logs            follow the server log
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$SELF")/share-platform" || exit 1
URL="http://localhost:4747"
need_docker() {
  docker info >/dev/null 2>&1 && return
  echo "Docker isn't running. Start Docker Desktop (open -a Docker), or run without it: ./run.sh --native"; exit 1
}

case "${1:-start}" in
  start)          need_docker; exec ./start.sh ;;
  --auth)         need_docker; exec ./start.sh "$@" ;;
  --native)       exec ./start.sh "$@" ;;
  stop)           need_docker; docker compose down ;;
  restart)        need_docker; docker compose restart && echo "share platform: $URL" ;;
  build)          (cd ui && npm install && npm run build) ;;
  status)
    if [ -n "$(docker compose ps -q --status running 2>/dev/null)" ]; then echo "running: $URL"
    else echo "not running (start it with ./run.sh)"; exit 1; fi ;;
  logs)           need_docker; docker compose logs -f ;;
  -h|--help|help) sed -n '2,11p' "$SELF" ;;
  *)              echo "unknown command: $1 (try ./run.sh help)"; exit 2 ;;
esac
