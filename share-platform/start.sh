#!/bin/sh
# Start the share platform in Docker (bind mounts only). --auth turns on basic auth from .auth.
# --native runs it straight on this Mac instead: start.sh --native [port]
cd "$(dirname "$0")" || exit 1
if [ "$1" = "--native" ]; then shift; exec node server.mjs "${1:-4747}"; fi
if [ "$1" = "--auth" ]; then set -a; . ./.auth; set +a; fi
[ -f dist/index.html ] || (cd ui && npm install && npm run build) || exit 1
mkdir -p ../projects ../.cache/share-platform
docker compose up -d --build && echo "share platform: http://localhost:4747"
