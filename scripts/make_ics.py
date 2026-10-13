#!/usr/bin/env python3
"""Build subscribable iCalendar feeds from data/shows.json.

Output (into the given directory, default the repo root):
  jahgenda.ics          all upcoming shows
  jahgenda-<CANTON>.ics one feed per canton/region that has shows (e.g. jahgenda-ZH.ics)

Subscribe with webcal://markusbaumg.github.io/jahgenda/jahgenda.ics (Apple/Google/Outlook refresh it
themselves). Generated in CI before every deploy (see .github/workflows/pages.yml), so the feed follows
the scraper. Stdlib only.

Usage: python3 scripts/make_ics.py [outdir]
"""

import json
import re
import sys
import unicodedata
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHOWS = ROOT / "data" / "shows.json"
SITE = "https://markusbaumg.github.io/jahgenda/"
TZID = "Europe/Zurich"
DEFAULT_HOURS = 3  # shows without an end: a 3-hour block


def esc(text):
    return (
        str(text)
        .replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
    )


def fold(line):
    """RFC 5545: lines longer than 75 octets are folded with CRLF + space."""
    out, raw = [], line.encode("utf-8")
    while len(raw) > 75:
        cut = 75
        while cut > 0 and (raw[cut] & 0xC0) == 0x80:  # do not split a UTF-8 sequence
            cut -= 1
        out.append(raw[:cut].decode("utf-8"))
        raw = b" " + raw[cut:]
    out.append(raw.decode("utf-8"))
    return "\r\n".join(out)


DOW = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]


def act_key(name):
    """Same rule as validate_shows.artist_key: «DUB INC.» in days is «Dub Inc» in acts."""
    return re.sub(r"[^a-z0-9]+", "", unicodedata.normalize("NFKD", str(name)).lower())


def lineup(s):
    """The line-up as text lines: one per day from `days` («Fr 13.11.: A, B»), then the acts without a
    day («Tag offen: …»), or the flat list when there are no days. Empty without acts."""
    acts = s.get("acts") or []
    days = s.get("days") or {}
    if not acts and not days:
        return []
    if not days:
        return [", ".join(acts)]
    out, placed = [], set()
    for key in sorted(days):
        day = datetime.strptime(key, "%Y-%m-%d")
        out.append(f"{DOW[day.weekday()]} {day.day}.{day.month}.: {', '.join(days[key])}")
        placed |= {act_key(a) for a in days[key]}
    rest = [a for a in acts if act_key(a) not in placed]
    if rest:
        out.append("Tag offen: " + ", ".join(rest))
    return out


def vevent(s, stamp):
    uid = f"{s['id']}@jahgenda"
    d = s["date"].replace("-", "")
    lines = ["BEGIN:VEVENT", f"UID:{uid}", f"DTSTAMP:{stamp}"]
    if s.get("end_date"):
        # A festival (design/festival-spec.md): all-day over the whole range, DTEND exclusive = last day + 1.
        last = datetime.strptime(s["end_date"], "%Y-%m-%d") + timedelta(days=1)
        lines.append(f"DTSTART;VALUE=DATE:{d}")
        lines.append(f"DTEND;VALUE=DATE:{last.strftime('%Y%m%d')}")
    elif s.get("time"):
        h, m = (int(x) for x in s["time"].split(":"))
        start = datetime.strptime(s["date"], "%Y-%m-%d").replace(hour=h, minute=m)
        end = start + timedelta(hours=DEFAULT_HOURS)
        lines.append(f"DTSTART;TZID={TZID}:{start.strftime('%Y%m%dT%H%M%S')}")
        lines.append(f"DTEND;TZID={TZID}:{end.strftime('%Y%m%dT%H%M%S')}")
    else:
        nxt = datetime.strptime(s["date"], "%Y-%m-%d") + timedelta(days=1)
        lines.append(f"DTSTART;VALUE=DATE:{d}")
        lines.append(f"DTEND;VALUE=DATE:{nxt.strftime('%Y%m%d')}")
    acts = " · ".join(s.get("acts") or [])
    summary = s["title"] if s.get("end_date") or not acts or acts == s["title"] else f"{s['title']} ({acts})"
    lines.append(f"SUMMARY:{esc(summary)}")
    lines.append(f"LOCATION:{esc(s['venue'] + ', ' + s['city'])}")
    desc = [", ".join(g for g in s.get("genres") or [])]
    if s.get("end_date"):
        desc += lineup(s)
    if s.get("url"):
        desc.append(s["url"])
    if s.get("tickets"):
        desc.append("Tickets: " + s["tickets"])
    desc.append(SITE + "#" + s["id"])
    lines.append(f"DESCRIPTION:{esc(chr(10).join(x for x in desc if x))}")
    lines.append(f"URL:{s.get('url') or SITE}")
    if isinstance(s.get("lat"), (int, float)) and isinstance(s.get("lon"), (int, float)):
        lines.append(f"GEO:{s['lat']};{s['lon']}")
    lines.append("CATEGORIES:" + esc(",".join(s.get("genres") or ["reggae"])))
    lines.append("END:VEVENT")
    return lines


def calendar(name, shows, stamp):
    head = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Jahgenda//Reggae-Agenda Schweiz//DE",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{esc(name)}",
        f"X-WR-TIMEZONE:{TZID}",
        "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
        "X-PUBLISHED-TTL:PT12H",
        "BEGIN:VTIMEZONE",
        f"TZID:{TZID}",
        "BEGIN:STANDARD",
        "DTSTART:19701025T030000",
        "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
        "TZOFFSETFROM:+0200",
        "TZOFFSETTO:+0100",
        "END:STANDARD",
        "BEGIN:DAYLIGHT",
        "DTSTART:19700329T020000",
        "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
        "TZOFFSETFROM:+0100",
        "TZOFFSETTO:+0200",
        "END:DAYLIGHT",
        "END:VTIMEZONE",
    ]
    body = []
    for s in shows:
        body += vevent(s, stamp)
    return "\r\n".join(fold(x) for x in head + body + ["END:VCALENDAR"]) + "\r\n"


def main(argv):
    outdir = Path(argv[0]) if argv else ROOT
    data = json.loads(SHOWS.read_text(encoding="utf-8"))
    today = date.today().isoformat()
    shows = sorted(
        (s for s in data.get("shows", []) if (s.get("end_date") or s.get("date", "")) >= today),
        key=lambda s: (s["date"], s.get("time", "")),
    )
    stamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    (outdir / "jahgenda.ics").write_text(
        calendar("Jahgenda – Reggae, Dub & Ska in der Schweiz", shows, stamp), encoding="utf-8"
    )
    regions = sorted({s["canton"] for s in shows})
    for c in regions:
        (outdir / f"jahgenda-{c}.ics").write_text(
            calendar(f"Jahgenda – {c}", [s for s in shows if s["canton"] == c], stamp), encoding="utf-8"
        )
    print(f"ics: {len(shows)} shows → jahgenda.ics + {len(regions)} regional feeds in {outdir}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
