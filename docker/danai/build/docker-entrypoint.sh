#!/bin/sh
# DAN.AI NocoBase container entrypoint — rewritten from docker/nocobase/docker-entrypoint.sh
# for this source-build fork. Differences from upstream:
#   - `yarn nocobase db:auth` is dropped: that command is only registered in the new `nb` CLI,
#     not in this fork's nocobase-v1, and commander would exit the container on it. Replaced
#     with an explicit wait-for-db loop below.
#   - The NOCOBASE_EXTRACT_CLIENT_ASSETS / CDN branches are dropped: this fork serves the SPA
#     from the image-baked dist/client, not from extracted storage assets.
set -e

echo "DAN.AI NocoBase, COMMIT_HASH: $(cat /app/commit_hash.txt 2>/dev/null || echo unknown)"

if [ ! -f "/app/nocobase/package.json" ]; then
  echo "Missing /app/nocobase/package.json; the image is broken." >&2
  exit 1
fi

cd /app/nocobase

# yarn workspaces normally symlinks node_modules/@nocobase/app -> packages/core/app, and the
# generated nginx conf's docroot depends on it. Some image transports drop symlinks, so recreate
# it manually when it is missing.
if [ ! -L "node_modules/@nocobase/app" ]; then
  echo "node_modules/@nocobase/app is not a symlink; recreating it."
  rm -rf node_modules/@nocobase/app
  mkdir -p node_modules/@nocobase
  ln -s ../../packages/core/app node_modules/@nocobase/app
fi

yarn nocobase postinstall

# Wait for the database before starting the app. If the app boots before the DB accepts
# connections it falls into an exponential reconnect backoff (up to ~4 minutes) and stays
# unresponsive even after the DB comes up, so gate the start here instead.
DB_DIALECT="${DB_DIALECT:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

wait_for_db() {
  i=0
  while true; do
    if "$@"; then
      echo "database at ${DB_HOST}:${DB_PORT} is ready"
      return 0
    fi
    i=$((i + 1))
    if [ "$i" -ge 60 ]; then
      echo "database at ${DB_HOST}:${DB_PORT} still not ready after 120s" >&2
      return 1
    fi
    sleep 2
  done
}

if [ "$DB_DIALECT" = "postgres" ] && command -v pg_isready >/dev/null 2>&1; then
  wait_for_db pg_isready -h "$DB_HOST" -p "$DB_PORT" -q
else
  wait_for_db node -e "const net=require('net');const s=net.connect({host:process.argv[1],port:Number(process.argv[2])},()=>{s.destroy();process.exit(0)});s.on('error',()=>process.exit(1));setTimeout(()=>process.exit(1),2000)" "$DB_HOST" "$DB_PORT"
fi

yarn nocobase generate-instance-id
yarn nocobase create-nginx-conf

if command -v nginx >/dev/null 2>&1; then
  rm -f /etc/nginx/conf.d/nocobase.conf
  ln -s /app/nocobase/storage/nocobase.conf /etc/nginx/conf.d/nocobase.conf
  nginx
  echo 'nginx started'
else
  echo 'nginx is not installed; serving API only on APP_PORT.'
fi

# user-provided boot hooks shipped on the storage volume
if [ -d "/app/nocobase/storage/scripts" ]; then
  for f in /app/nocobase/storage/scripts/*.sh; do
    [ -e "$f" ] || continue
    echo "Running $f"
    sh "$f"
  done
fi

# --quickstart on a fresh database installs the schema and seed data, and on an existing
# database performs the version upgrade sync.
exec yarn start --quickstart
