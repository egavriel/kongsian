#!/bin/bash
# Wrapper to start wa-relay with secret loaded from the file.
# Run: bash /root/kongsian/scripts/start-wa-relay.sh
set -euo pipefail
cd /root/kongsian
SECRET_FILE=/root/kongsian/.wa-relay-secret
if [ ! -f "$SECRET_FILE" ]; then
  echo "FATAL: secret file $SECRET_FILE not found" >&2
  exit 1
fi
export WA_RELAY_SECRET=$(tr -d '[:space:]' < "$SECRET_FILE")
export WA_RELAY_PORT="${WA_RELAY_PORT:-3031}"
export WA_BRIDGE_URL="${WA_BRIDGE_URL:-http://127.0.0.1:3000}"
exec /root/kongsian/packages/db/node_modules/.bin/tsx /root/kongsian/scripts/wa-relay.ts
