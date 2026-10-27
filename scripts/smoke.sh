#!/bin/sh
# Smoke check after installing: builds, starts Kuna once with a throwaway
# profile (your real projects are untouched), reports whether the window and
# this Mac's helper came up and whether a second window opens and closes,
# saves a screenshot, and quits. No agents start.
# Usage: sh scripts/smoke.sh   (from the repository root)
set -e
cd "$(dirname "$0")/.."
base=${TMPDIR:-/tmp}
tmp=$(mktemp -d "${base%/}/kuna-smoke.XXXXXX")
mkdir -p "$tmp/profile" "$tmp/shots"
cat > "$tmp/profile/kuna-state.json" <<'JSON'
{"version":1,"projects":[{"id":"smoke","name":"Smoke test","host":"local","color":"#4d8dff","agentCommand":"claude","folders":[]}],"settings":{"theme":"cherenkov","inspector":false,"sidebarWidth":300,"notify":false},"lastSeen":{}}
JSON
echo "building…"
npx electron-vite build > "$tmp/build.log" 2>&1 || { echo "build FAILED, see $tmp/build.log"; exit 1; }
echo "starting Kuna (windows open and close by themselves)…"
KUNA_USER_DATA="$tmp/profile" KUNA_SHOT_DIR="$tmp/shots" KUNA_AUTOMATION="$PWD/scripts/smoke.js" \
  ./node_modules/.bin/electron . > "$tmp/run.log" 2>&1 || true
grep '\[smoke\]' "$tmp/run.log" | sed 's/^\[renderer\] //' || echo "no result, see $tmp/run.log"
[ -f "$tmp/shots/smoke.png" ] && echo "screenshot: $tmp/shots/smoke.png"
