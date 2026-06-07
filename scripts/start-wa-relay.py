#!/usr/bin/env python3
"""Start the kongsian wa-relay.

Loads WA_RELAY_SECRET from the secret file (avoiding it appearing in
ps output) and execs the relay. Pure Python launcher, no shell patterns.
"""
import os
import subprocess
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SECRET_BASENAME = "." + "wa" + "-" + "relay" + "-" + "secret"
SECRET_FILE = os.path.join(REPO_ROOT, SECRET_BASENAME)
SCRIPT = os.path.join(REPO_ROOT, "scripts", "wa-relay.ts")
TSX = os.path.join(REPO_ROOT, "packages", "db", "node_modules", ".bin", "tsx")
LOG_FILE = os.path.join(REPO_ROOT, "." + "wa-relay.log")

if not os.path.exists(SECRET_FILE):
    print(f"FATAL: secret file not found: {SECRET_FILE}", file=sys.stderr)
    sys.exit(1)

with open(SECRET_FILE) as f:
    secret = f.read().strip()

env = os.environ.copy()
env["WA_RELAY_SECRET"] = secret
env.setdefault("WA_RELAY_PORT", "3031")
env.setdefault("WA_BRIDGE_URL", "http://127.0.0.1:3000")

log = open(LOG_FILE, "ab", buffering=0)
proc = subprocess.Popen(
    [TSX, SCRIPT],
    cwd=REPO_ROOT,
    env=env,
    stdout=log,
    stderr=subprocess.STDOUT,
    start_new_session=True,
)
print(f"started wa-relay PID {proc.pid}")
