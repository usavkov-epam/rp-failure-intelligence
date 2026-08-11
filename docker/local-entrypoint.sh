#!/bin/sh
set -eu

local_data_dir="${LOCAL_DATA_DIR:-/data}"
local_secret_file="$local_data_dir/local-secret"
umask 077
mkdir -p "$local_data_dir"

if [ ! -s "$local_secret_file" ]; then
  node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))" > "$local_secret_file"
fi

LOCAL_ENCRYPTION_KEY="$(sed -n '1p' "$local_secret_file")"
export LOCAL_ENCRYPTION_KEY
AUTH_SECRET="${AUTH_SECRET:-$LOCAL_ENCRYPTION_KEY}"
export AUTH_SECRET

exec "$@"
