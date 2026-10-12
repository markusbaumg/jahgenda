#!/usr/bin/env bash
# Smoke test: load index.html, log.html and review.html in headless Chrome and fail on any uncaught
# JS error. Used by `make check` when Chrome is available (macOS app path or google-chrome on Linux CI).
#
# How it works: Chrome only prints page console messages to stderr with --vmodule='*console*=1'
# (at --v=0 a thrown TypeError leaves no trace at all), and with that logging on it does not exit by
# itself after --dump-dom. So each page runs in the background, we wait until the DOM has been
# dumped (the page is settled: --virtual-time-budget has run out), then stop Chrome and grep its
# stderr. A self-check with a page that throws on purpose makes sure the grep can still see errors,
# so a future Chrome change cannot silently blind this test again.
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
PROFILE=$(mktemp -d)
trap 'kill $SRV 2>/dev/null || true; rm -rf "$PROFILE"' EXIT
ready=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if python3 -c "import urllib.request,sys; urllib.request.urlopen('http://127.0.0.1:$PORT/index.html', timeout=2)" 2>/dev/null; then
    ready=1
    break
  fi
  sleep 0.5
done
if [ "$ready" != 1 ]; then echo "smoke: test server on port $PORT not reachable"; exit 1; fi

ERR_RE='Uncaught|ReferenceError|TypeError|SyntaxError'
MAX_WAIT=60 # × 0.25 s = 15 s hard cap per page

# load <url> <name>: run Chrome until the DOM is dumped (or the cap hits), leave stderr in $PROFILE/<name>.err
load() {
  local url=$1 name=$2 dom="$PROFILE/$2.dom" err="$PROFILE/$2.err" pid i
  "$CHROME" --headless=new --disable-gpu --no-sandbox --user-data-dir="$PROFILE/$name" \
    --enable-logging=stderr --vmodule='*console*=1' --virtual-time-budget=4000 --window-size=900,800 \
    --dump-dom "$url" >"$dom" 2>"$err" &
  pid=$!
  for ((i = 0; i < MAX_WAIT; i++)); do
    if grep -q '</html>' "$dom" 2>/dev/null; then
      sleep 0.5 # let late console lines reach stderr
      break
    fi
    sleep 0.25
  done
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}

# errors <name>: the console lines of that run that look like a JS error (favicon 404s are not)
errors() {
  grep 'INFO:CONSOLE' "$PROFILE/$1.err" 2>/dev/null | grep -E "$ERR_RE" | grep -v favicon || true
}

# Self-check first: a page that throws must be caught, otherwise this whole script is blind.
load 'data:text/html,<script>throw new TypeError("smoke self-check")</script>' selfcheck
if [ -z "$(errors selfcheck)" ]; then
  echo "smoke: self-check failed - Chrome reported no console error for a page that throws; the check is blind"
  exit 1
fi

fail=0
for page in index.html log.html review.html admin.html; do
  load "http://127.0.0.1:$PORT/$page" "$page"
  if ! grep -q '</html>' "$PROFILE/$page.dom"; then
    echo "smoke: $page did not finish loading within the time limit"
    fail=1
    continue
  fi
  found=$(errors "$page")
  if [ -n "$found" ]; then
    echo "smoke: JS error on $page:"
    echo "$found" | head -5
    fail=1
  else
    echo "smoke: $page ok"
  fi
done
exit $fail
