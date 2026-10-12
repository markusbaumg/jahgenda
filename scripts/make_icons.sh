#!/usr/bin/env bash
# Render the PNG app icons from img/logo/jahgenda.svg with headless Chrome. Run: make icons
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
tmp=$(mktemp -d)
render() { # size, padding(0-1), bg, out
  cat > "$tmp/i.html" <<HTML
<!doctype html><html><body style="margin:0;background:$3;width:$1px;height:$1px;display:grid;place-items:center">
<img src="file://$PWD/img/logo/jahgenda.svg" style="width:$(python3 -c "print(int($1*(1-2*$2)))")px;height:auto"></body></html>
HTML
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size="$1,$1" --screenshot="$4" "file://$tmp/i.html" 2>/dev/null
  echo "$4"
}
render 192 0    "#14110e" img/icons/icon-192.png
render 512 0    "#14110e" img/icons/icon-512.png
render 512 0.1  "#14110e" img/icons/maskable-512.png   # safe zone for Android adaptive icons
render 180 0.06 "#14110e" img/icons/apple-touch-icon.png
rm -rf "$tmp"
