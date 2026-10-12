#!/usr/bin/env bash
# Smoke test: load index.html and log.html in headless Chrome and fail on any uncaught JS error.
# Used by `make check` when Chrome is available (macOS app path or google-chrome on Linux CI).
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="${CHROME:-}"
for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" google-chrome chromium-browser chromium; do
  if [ -z "$CHROME" ] && command -v "$c" >/dev/null 2>&1; then CHROME="$c"; fi
  if [ -z "$CHROME" ] && [ -x "$c" ]; then CHROME="$c"; fi
done
if [ -z "$CHROME" ]; then echo "smoke: no Chrome found, skipped"; exit 0; fi
PORT=$((8900 + RANDOM % 90))
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT
sleep 1
PROFILE=$(mktemp -d)
fail=0
for page in index.html log.html review.html; do
  out=$("$CHROME" --headless=new --disable-gpu --no-sandbox --user-data-dir="$PROFILE" --enable-logging=stderr --v=0 \
        --virtual-time-budget=4000 --window-size=900,800 --screenshot=/dev/null "http://127.0.0.1:$PORT/$page" 2>&1 || true)
  if echo "$out" | grep -E "Uncaught|ReferenceError|TypeError|SyntaxError" | grep -v "favicon" >/dev/null; then
    echo "smoke: JS error on $page:"; echo "$out" | grep -E "Uncaught|ReferenceError|TypeError|SyntaxError" | head -5
    fail=1
  else
    echo "smoke: $page ok"
  fi
done
rm -rf "$PROFILE"
exit $fail
