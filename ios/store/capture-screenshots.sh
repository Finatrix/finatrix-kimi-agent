#!/usr/bin/env bash
# Capture the release Simulator UI with fictional local data. Run
# seed-demo-data.py first; this script changes only the installed Simulator
# copy of compat.js to choose each route, then restores it on exit.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP_DIR="$(xcrun simctl get_app_container booted co.finatrix.app app)"
COMPAT="$APP_DIR/public/compat.js"
BACKUP="$(mktemp)"
cp "$COMPAT" "$BACKUP"
restore() {
  cp "$BACKUP" "$COMPAT"
  rm -f "$BACKUP"
}
trap restore EXIT

capture() {
  local route="$1" name="$2"
  xcrun simctl terminate booted co.finatrix.app >/dev/null 2>&1 || true
  cp "$BACKUP" "$COMPAT"
  printf '\nhistory.replaceState(null, "", "/tools/%s");\n' "$route" >> "$COMPAT"
  xcrun simctl launch booted co.finatrix.app >/dev/null
  sleep 3
  local output="$ROOT/ios/store/screenshots/$name.png"
  rm -f "$output"
  xcrun simctl io booted screenshot --mask=black "$output" >/dev/null
}

capture dashboard 1-dashboard
capture expenses 2-expenses
capture budget 3-budget
capture goals 4-goals
capture networth 5-net-worth
capture lifemap 6-lifemap

xcrun simctl terminate booted co.finatrix.app >/dev/null 2>&1 || true
echo "Six opaque screenshots saved in ios/store/screenshots/"
