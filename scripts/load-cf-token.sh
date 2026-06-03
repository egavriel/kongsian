#!/bin/bash
# Load Cloudflare token from Hermes auth pool into env var.
# Usage: source scripts/load-cf-token.sh
set -e
CF_TOKEN=$(python3 -c "
import json
data = json.load(open('/root/.hermes/auth.json'))
pool = data.get('credential_pool', {}).get('cloudflare', [])
if not pool:
    raise SystemExit('No cloudflare token in auth pool')
print(pool[0]['access_token'])
")
export CLOUDFLARE_API_TOKEN="$CF_TOKEN"
export CLOUDFLARE_ACCOUNT_ID="b01a3f3d1c2b721bd7bc487200439614"
echo "✓ Cloudflare token loaded (length: ${#CF_TOKEN})"
echo "✓ Account: $CLOUDFLARE_ACCOUNT_ID"
echo "---"
echo "Token value NOT echoed to terminal (security)"
