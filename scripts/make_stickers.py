#!/usr/bin/env python3
"""Generate the Jahgenda sticker print files (design/stickers/). Run: make stickers

Produces, for a 50 mm round and a 50 mm square sticker (3 mm bleed → 56 × 56 mm canvas):

  sticker-round-50.svg / sticker-square-50.svg   master artwork, viewBox in millimetres
  sticker-round-50.pdf / sticker-square-50.pdf   print PDFs (headless Chrome, page = 56 × 56 mm)
  sheet-a4.pdf                                   A4 test sheet, stickers at true size
  preview-round-50.png / preview-square-50.png   screen previews (headless Chrome)
  qr-jahgenda.txt                                QR matrix as text (cache + eyeball check)

Stdlib only. The QR code comes from `segno` (pure Python) when importable – `make stickers`
installs it into .venv-stickers – otherwise the cached matrix in qr-jahgenda.txt is reused.
PDFs and PNGs need Google Chrome (CHROME env var overrides the path); without Chrome only
the SVGs are written.

Usage:
  python3 scripts/make_stickers.py [--slogan TEXT] [--url jahgenda.ch] [--link https://jahgenda.ch]
                                   [--no-cutline] [--no-pdf] [--verify] [--out design/stickers]
"""

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DEFAULT = ROOT / "design" / "stickers"
VENV = ROOT / ".venv-stickers"

# Brand colours (style.css) – the printer converts to CMYK, see README-stickers.md.
BG = "#14110e"
CREAM = "#f3ead8"
MUTED = "#a39682"
RED = "#d8342f"
GOLD = "#f2b632"
GREEN = "#1e8f4e"
QR_DARK = "#000000"  # pure black → K only in CMYK, no registration blur on 0.8 mm modules
QR_LIGHT = "#ffffff"
CUT = "#ff00ff"

FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

TRIM = 50.0  # mm
BLEED = 3.0  # mm on every side (--bleed), Flyerline/Printzessin 3, Onlineprinters 2
CANVAS = TRIM + 2 * BLEED  # 56 mm
C = CANVAS / 2  # centre
QR_MM = 20.0  # size of the QR symbol itself (without quiet zone)
QUIET = 4  # quiet zone in modules

CHROME_CANDIDATES = [
    os.environ.get("CHROME", ""),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "google-chrome",
    "chromium",
    "chromium-browser",
]


# --------------------------------------------------------------------------- QR code


def qr_matrix(link, cache):
    """Return (rows, designator) – rows as lists of 0/1, no border. segno if available, else cache."""
    try:
        import segno
    except ImportError:
        segno = None
    if segno is not None:
        qr = segno.make(link, error="q")  # 25 % error correction; version 2 (25×25) for this URL
        rows = [[1 if v else 0 for v in row] for row in qr.matrix]
        designator = qr.designator
        lines = [f"# {link}  segno {designator}  {len(rows)}x{len(rows)} modules (no quiet zone)"]
        lines += ["".join("#" if v else "." for v in row) for row in rows]
        cache.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return rows, designator
    if not cache.exists():
        sys.exit(
            f"segno is not installed and {cache} does not exist. "
            "Run `make stickers` (creates .venv-stickers) or `pip install segno`."
        )
    head, *body = cache.read_text(encoding="utf-8").splitlines()
    if link not in head.split():
        sys.exit(f"{cache} was generated for a different link ({head!r}); install segno to regenerate.")
    rows = [[1 if ch == "#" else 0 for ch in line] for line in body if line]
    print(f"note: segno not importable, using cached QR matrix from {cache.name}")
    return rows, head.split()[3] if len(head.split()) > 3 else "?"


def qr_svg(rows, x, y):
    """White quiet-zone box + one <path> of dark modules; x,y = top-left of the box in mm."""
    n = len(rows)
    module = QR_MM / n
    box = (n + 2 * QUIET) * module
    d = []
    for r, row in enumerate(rows):
        c = 0
        while c < n:  # merge horizontal runs into one rect each → smaller path
            if row[c]:
                start = c
                while c < n and row[c]:
                    c += 1
                d.append(f"M{start} {r}h{c - start}v1h-{c - start}z")
            else:
                c += 1
    return (
        f'<g id="qr" aria-label="QR code">'
        f'<rect x="{x:.3f}" y="{y:.3f}" width="{box:.3f}" height="{box:.3f}" rx="1.2" fill="{QR_LIGHT}"/>'
        f'<path transform="translate({x + QUIET * module:.4f} {y + QUIET * module:.4f}) scale({module:.5f})" '
        f'fill="{QR_DARK}" shape-rendering="crispEdges" d="{"".join(d)}"/></g>'
    ), box


# --------------------------------------------------------------------------- shapes


def logo_svg(x, y, size, uid):
    """The shapes of img/logo/jahgenda.svg (64-unit grid), scaled to `size` mm at (x, y)."""
    s = size / 64
    return (
        f'<g id="logo-{uid}" transform="translate({x:.3f} {y:.3f}) scale({s:.5f})">'
        f'<defs><clipPath id="clip-{uid}"><rect width="64" height="64" rx="12"/></clipPath></defs>'
        f'<g clip-path="url(#clip-{uid})">'
        f'<rect width="64" height="22" fill="{RED}"/>'
        f'<rect y="21" width="64" height="22" fill="{GOLD}"/>'
        f'<rect y="43" width="64" height="21" fill="{GREEN}"/></g>'
        f'<rect x="26" y="12" width="12" height="40" fill="{CREAM}"/>'
        f'<rect x="12" y="26" width="40" height="12" fill="{CREAM}"/></g>'
    )


def wordmark_svg(x, baseline, size, length, anchor="start"):
    """'Jahgenda' – 'Jah' cream, 'genda' gold – forced to `length` mm so the layout never overflows."""
    return (
        f'<text x="{x:.3f}" y="{baseline:.3f}" font-family="{FONT}" font-weight="900" font-size="{size}" '
        f'text-anchor="{anchor}" textLength="{length}" lengthAdjust="spacingAndGlyphs" '
        f'letter-spacing="-0.02em" fill="{CREAM}">Jah<tspan fill="{GOLD}">genda</tspan></text>'
    )


def text_svg(x, baseline, size, text, fill, weight=700, length=None, anchor="middle", spacing=None):
    extra = f' textLength="{length}" lengthAdjust="spacingAndGlyphs"' if length else ""
    extra += f' letter-spacing="{spacing}"' if spacing else ""
    return (
        f'<text x="{x:.3f}" y="{baseline:.3f}" font-family="{FONT}" font-weight="{weight}" '
        f'font-size="{size}" text-anchor="{anchor}" fill="{fill}"{extra}>{esc(text)}</text>'
    )


def polar(r, deg):
    """Point on a circle around the canvas centre; angle in degrees clockwise from 12 o'clock."""
    a = math.radians(deg)
    return C + r * math.sin(a), C - r * math.cos(a)


def ring_sector(r_in, r_out, a0, a1, fill):
    """Annular sector from angle a0 to a1 (clockwise, degrees from 12 o'clock), span < 180°."""
    x0, y0 = polar(r_out, a0)
    x1, y1 = polar(r_out, a1)
    x2, y2 = polar(r_in, a1)
    x3, y3 = polar(r_in, a0)
    return (
        f'<path fill="{fill}" d="M{x0:.3f} {y0:.3f}A{r_out} {r_out} 0 0 1 {x1:.3f} {y1:.3f}'
        f'L{x2:.3f} {y2:.3f}A{r_in} {r_in} 0 0 0 {x3:.3f} {y3:.3f}Z"/>'
    )


def arc_path(pid, r, a0, a1, clockwise):
    """Circular arc for textPath. Clockwise arcs put the glyphs outside the radius (top text),
    counter-clockwise arcs put them inside (bottom text), so both read left to right, upright."""
    x0, y0 = polar(r, a0)
    x1, y1 = polar(r, a1)
    span = (a1 - a0) % 360 if clockwise else (a0 - a1) % 360
    large = 1 if span > 180 else 0
    sweep = 1 if clockwise else 0
    return (
        f'<path id="{pid}" fill="none" d="M{x0:.3f} {y0:.3f}A{r} {r} 0 {large} {sweep} {x1:.3f} {y1:.3f}"/>'
    )


def arc_text(pid, size, text, fill, weight=700, spacing=None):
    sp = f' letter-spacing="{spacing}"' if spacing else ""
    return (
        f'<text font-family="{FONT}" font-weight="{weight}" font-size="{size}" fill="{fill}"{sp}>'
        f'<textPath href="#{pid}" startOffset="50%" text-anchor="middle">{esc(text)}</textPath></text>'
    )


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def svg_doc(title, body, cutline, cut_shape):
    cut = (
        f'<g id="cutline" fill="none" stroke="{CUT}" stroke-width="0.25" stroke-dasharray="1 0.75">'
        f"<title>Cut line – 50 mm trim, 3 mm bleed outside</title>{cut_shape}</g>"
        if cutline
        else ""
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{CANVAS}mm" height="{CANVAS}mm" '
        f'viewBox="0 0 {CANVAS} {CANVAS}">\n'
        f"<title>{esc(title)}</title>\n"
        f"<desc>Jahgenda sticker, 50 mm trim + 3 mm bleed; units are millimetres. "
        f"Generated by scripts/make_stickers.py – edit the script, not this file.</desc>\n"
        f'<g id="artwork">\n{body}\n</g>\n{cut}\n</svg>\n'
    )


# --------------------------------------------------------------------------- the two layouts


def round_sticker(rows, slogan, url, cutline):
    r_bleed = CANVAS / 2  # 28
    r_trim = TRIM / 2  # 25
    r_ring = 23.8  # ring inner edge → 1.2 mm ring visible after the cut
    parts = [f'<circle cx="{C}" cy="{C}" r="{r_bleed}" fill="{BG}"/>']
    # Tricolour ring: red on top, gold lower right, green lower left (logo order, clockwise).
    parts += [
        ring_sector(r_ring, r_bleed, -60, 60, RED),
        ring_sector(r_ring, r_bleed, 60, 180, GOLD),
        ring_sector(r_ring, r_bleed, 180, 300, GREEN),
    ]
    # Slogan on the top arc, logo, wordmark, QR, URL on the bottom arc.
    parts.append(arc_path("arc-top", 21.9, -110, 110, clockwise=True))
    parts.append(arc_text("arc-top", 2.2, slogan, CREAM, weight=700, spacing="0.08"))
    logo = 4.8
    parts.append(logo_svg(C - logo / 2, 7.0, logo, "r"))
    parts.append(wordmark_svg(C, 17.3, 4.8, 24.5, anchor="middle"))
    qr, box = qr_svg(rows, C - 13.2, 18.8)
    parts.append(qr)
    parts.append(arc_path("arc-bottom", 22.0, 230, 130, clockwise=False))
    parts.append(arc_text("arc-bottom", 3.1, url, GOLD, weight=900, spacing="0.02"))
    cut = f'<circle cx="{C}" cy="{C}" r="{r_trim}"/>'
    return svg_doc("Jahgenda sticker, round 50 mm", "\n".join(parts), cutline, cut), box


def square_sticker(rows, slogan, url, cutline):
    parts = [f'<rect width="{CANVAS}" height="{CANVAS}" fill="{BG}"/>']
    # Tricolour stripe along the bottom (like the site: red | gold | green side by side), into the bleed;
    # 2.5 mm of it remain after the cut.
    y_stripe = BLEED + TRIM - 2.5
    third = CANVAS / 3
    for i, col in enumerate((RED, GOLD, GREEN)):
        parts.append(
            f'<rect x="{i * third:.3f}" y="{y_stripe:.3f}" width="{third:.3f}" '
            f'height="{CANVAS - y_stripe:.3f}" fill="{col}"/>'
        )
    # Everything else is positioned relative to the trim box (values below = mm on the 3 mm-bleed canvas).
    inner = []
    logo, wm_len, gap = 5.5, 27.0, 1.6
    x0 = 28 - (logo + gap + wm_len) / 2
    inner.append(logo_svg(x0, 6.0, logo, "s"))
    inner.append(wordmark_svg(x0 + logo + gap, 11.2, 5.2, wm_len))
    inner.append(text_svg(28, 15.5, 2.4, slogan, CREAM, weight=700, spacing="0.06"))
    qr, box = qr_svg(rows, 28 - 13.2, 17.8)
    inner.append(qr)
    inner.append(text_svg(28, 48.5, 3.6, url, GOLD, weight=900, length=24.0))
    shift = BLEED - 3.0
    parts.append(f'<g transform="translate({shift:.3f} {shift:.3f})">{"".join(inner)}</g>')
    cut = f'<rect x="{BLEED}" y="{BLEED}" width="{TRIM}" height="{TRIM}" rx="2"/>'
    return svg_doc("Jahgenda sticker, square 50 mm", "\n".join(parts), cutline, cut), box


# --------------------------------------------------------------------------- Chrome


def find_chrome():
    for cand in CHROME_CANDIDATES:
        if not cand:
            continue
        if os.path.isfile(cand) and os.access(cand, os.X_OK):
            return cand
        found = shutil.which(cand)
        if found:
            return found
    return None


def chrome(chrome_bin, args, tmp, output, timeout=90):
    """Run headless Chrome until `output` is completely written, then stop it.

    Chrome on macOS sometimes keeps running after --screenshot/--print-to-pdf has finished
    (updater/crash-handler children), so instead of waiting for the exit code we wait for a
    complete file (PNG IEND / PDF %%EOF trailer) and terminate the process ourselves.
    """
    cmd = [
        chrome_bin,
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-component-update",
        f"--user-data-dir={tmp / 'chrome-profile'}",
        *args,
    ]
    output = Path(output)
    if output.exists():
        output.unlink()
    trailer = b"IEND\xaeB`\x82" if output.suffix == ".png" else b"%%EOF"
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if output.exists() and output.stat().st_size > 0:
                with output.open("rb") as fh:
                    fh.seek(-64, os.SEEK_END) if output.stat().st_size > 64 else None
                    tail = fh.read()
                if trailer in tail:
                    time.sleep(0.3)  # let Chrome close the file handle
                    return
            if proc.poll() is not None:
                break
            time.sleep(0.2)
        if not (output.exists() and output.stat().st_size > 0):
            sys.exit(f"Chrome did not produce {output.name} (exit code {proc.poll()})")
    finally:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


def wrap_sticker_html(svg):
    """One sticker per PDF page. Chrome rounds page sizes to 1/60 inch (56 mm → 56.13 mm), so the
    56 mm artwork is centred on the page: the 0.07 mm on each side disappears in the bleed."""
    return (
        "<!doctype html><html><head><meta charset='utf-8'><style>"
        f"@page{{size:{CANVAS}mm {CANVAS}mm;margin:0}}html,body{{margin:0;padding:0;background:#fff}}"
        "body{width:100vw;height:100vh;display:grid;place-items:center;overflow:hidden}"
        f"svg{{display:block;width:{CANVAS}mm;height:{CANVAS}mm}}"
        f"</style></head><body>{svg}</body></html>"
    )


def wrap_preview_html(svg, px):
    return (
        "<!doctype html><html><head><meta charset='utf-8'><style>"
        f"html,body{{margin:0;padding:0;background:#e8e2d6;width:{px}px;height:{px}px;overflow:hidden}}"
        f"svg{{display:block;width:{px}px;height:{px}px}}"
        f"</style></head><body>{svg}</body></html>"
    )


def sheet_html(svg_round, svg_square, slogan):
    """A4 portrait test sheet: 3 × 5 stickers at true size (8 round, 7 square), each shown with the
    cut line and 1 mm of bleed, plus a 100 mm scale bar. 24 stickers would not fit on A4 at 50 mm."""
    cols, rows_n, gap = 3, 5, 3.0
    cell = TRIM + 2  # 1 mm of bleed visible around the cut line
    crop = (CANVAS - cell) / 2
    grid_w = cols * cell + (cols - 1) * gap
    grid_h = rows_n * cell + (rows_n - 1) * gap
    left = (210 - grid_w) / 2
    top = 12.0
    cells = []
    for i in range(cols * rows_n):
        r, c = divmod(i, cols)
        svg = svg_round if i % 2 == 0 else svg_square
        cells.append(
            f'<div class="cell" style="left:{left + c * (cell + gap):.2f}mm;'
            f'top:{top + r * (cell + gap):.2f}mm">{svg}</div>'
        )
    foot_y = top + grid_h + 3
    return (
        "<!doctype html><html><head><meta charset='utf-8'><style>"
        "@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0;background:#fff;"
        f"font-family:{FONT};color:#333;overflow:hidden}}"
        ".page{position:relative;width:210mm;height:296mm;overflow:hidden}"
        f".cell{{position:absolute;width:{cell}mm;height:{cell}mm;overflow:hidden}}"
        f".cell svg{{position:absolute;left:-{crop}mm;top:-{crop}mm;width:{CANVAS}mm;height:{CANVAS}mm}}"
        ".cap{position:absolute;left:0;right:0;text-align:center;font-size:8pt}"
        ".ruler{position:absolute;height:3mm;width:100mm;border:0.3mm solid #333;border-top:0;"
        "background:repeating-linear-gradient(to right,#333 0,#333 0.3mm,transparent 0.3mm,transparent 10mm)}"
        "</style></head><body><div class='page'>"
        "<div class='cap' style='top:5mm'><b>Jahgenda sticker test sheet</b> – 50 mm round / square "
        f"at true size, dashed line = cut. Print at 100 % (no “fit to page”). Slogan: {esc(slogan)}</div>"
        f"{''.join(cells)}"
        f"<div class='ruler' style='left:{left:.2f}mm;top:{foot_y:.2f}mm'></div>"
        f"<div class='cap' style='top:{foot_y + 0.5:.2f}mm;left:{left + 103:.2f}mm;"
        "right:auto;text-align:left'>"
        "← 100 mm scale bar (10 mm ticks): measure it to check that the printer did not scale the page</div>"
        "</div></body></html>"
    )


# --------------------------------------------------------------------------- verification


def verify(out, tmp):
    """Decode the preview PNGs with a tiny Swift/Vision tool (macOS only, compiled into .venv-stickers)."""
    src = ROOT / "scripts" / "qr_decode.swift"
    binary = VENV / "qrdecode"
    if sys.platform != "darwin" or not shutil.which("swiftc"):
        print(
            "verify: needs macOS with swiftc (Xcode command line tools); "
            "skipped – scan the printed sheet with a phone"
        )
        return None
    if not binary.exists() or binary.stat().st_mtime < src.stat().st_mtime:
        VENV.mkdir(exist_ok=True)
        print("verify: compiling scripts/qr_decode.swift (first time takes a minute) …")
        subprocess.run(["swiftc", "-O", "-o", str(binary), str(src)], check=True, timeout=600)
    ok = True
    for name in ("preview-round-50.png", "preview-square-50.png"):
        res = subprocess.run([str(binary), str(out / name)], capture_output=True, text=True, timeout=60)
        line = (res.stdout or res.stderr).strip()
        print(f"verify: {name}: {line}")
        ok = ok and res.returncode == 0
    return ok


# --------------------------------------------------------------------------- main


def main():
    global BLEED, CANVAS, C
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--slogan", default="Alli Reggae-Shows. Ei Site.", help="one line from data/slogans.json")
    ap.add_argument("--url", default="jahgenda.ch", help="the URL printed in gold")
    ap.add_argument("--link", default="https://jahgenda.ch", help="what the QR code encodes")
    ap.add_argument("--bleed", type=float, default=3.0, help="bleed in mm on every side (default 3)")
    ap.add_argument(
        "--no-cutline", action="store_true", help="omit the magenta cut line (for printers that want none)"
    )
    ap.add_argument("--no-pdf", action="store_true", help="SVGs only, do not run Chrome")
    ap.add_argument(
        "--verify", action="store_true", help="decode the QR in the PNG previews (macOS, Swift/Vision)"
    )
    ap.add_argument("--out", type=Path, default=OUT_DEFAULT)
    args = ap.parse_args()
    BLEED = args.bleed
    CANVAS = TRIM + 2 * BLEED
    C = CANVAS / 2

    slogans = json.loads((ROOT / "data" / "slogans.json").read_text(encoding="utf-8"))["slogans"]
    if args.slogan not in slogans:
        print(f"warning: slogan {args.slogan!r} is not in data/slogans.json", file=sys.stderr)

    out = args.out
    out.mkdir(parents=True, exist_ok=True)
    rows, designator = qr_matrix(args.link, out / "qr-jahgenda.txt")
    module = QR_MM / len(rows)
    print(
        f"QR {designator}: {len(rows)}×{len(rows)} modules, {module:.2f} mm/module, symbol {QR_MM} mm, "
        f"box {(len(rows) + 2 * QUIET) * module:.1f} mm incl. {QUIET}-module quiet zone"
    )
    if module < 0.5:
        sys.exit("QR modules would be smaller than 0.5 mm – shorten the link")

    cutline = not args.no_cutline
    svg_round, _ = round_sticker(rows, args.slogan, args.url, cutline)
    svg_square, _ = square_sticker(rows, args.slogan, args.url, cutline)
    (out / "sticker-round-50.svg").write_text(svg_round, encoding="utf-8")
    (out / "sticker-square-50.svg").write_text(svg_square, encoding="utf-8")
    written = ["sticker-round-50.svg", "sticker-square-50.svg", "qr-jahgenda.txt"]

    if args.no_pdf:
        print("written:", ", ".join(written))
        return
    chrome_bin = find_chrome()
    if not chrome_bin:
        print(
            "Chrome not found (set CHROME=/path/to/chrome) – SVGs written, PDFs/PNGs skipped", file=sys.stderr
        )
        return

    with tempfile.TemporaryDirectory(prefix="jahgenda-stickers-") as td:
        tmp = Path(td)
        inline_round = svg_round.split("?>\n", 1)[1]  # drop the XML prolog for inline use
        inline_square = svg_square.split("?>\n", 1)[1]
        jobs = {
            "sticker-round-50.pdf": wrap_sticker_html(inline_round),
            "sticker-square-50.pdf": wrap_sticker_html(inline_square),
            "sheet-a4.pdf": sheet_html(inline_round, inline_square, args.slogan),
        }
        for name, html in jobs.items():
            page = tmp / (name + ".html")
            page.write_text(html, encoding="utf-8")
            chrome(
                chrome_bin,
                ["--no-pdf-header-footer", f"--print-to-pdf={out / name}", page.as_uri()],
                tmp,
                out / name,
            )
            written.append(name)
        px = 600
        for name, svg in (("preview-round-50.png", inline_round), ("preview-square-50.png", inline_square)):
            page = tmp / (name + ".html")
            page.write_text(wrap_preview_html(svg, px), encoding="utf-8")
            chrome(
                chrome_bin,
                [f"--window-size={px},{px}", f"--screenshot={out / name}", page.as_uri()],
                tmp,
                out / name,
            )
            written.append(name)
        print("written:", ", ".join(written))
        if args.verify and verify(out, tmp) is False:
            sys.exit("QR verification failed")


if __name__ == "__main__":
    main()
