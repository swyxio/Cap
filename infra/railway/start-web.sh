#!/bin/bash
set -euo pipefail
cd /app/apps/web
node node_modules/@workflow/world-postgres/bin/setup.js
HOSTNAME=127.0.0.1 PORT=3000 node server.js &
web_pid=$!
nginx -g 'daemon off;' &
proxy_pid=$!
trap 'kill -TERM "$web_pid" "$proxy_pid" 2>/dev/null || true; wait || true' TERM INT EXIT
wait -n "$web_pid" "$proxy_pid"
exit 1
