#!/usr/bin/env python3
"""Bring data/*.json into canonical form so diffs stay small and readable.

- shows.json:   shows sorted by date, time, title; one show per line; field order fixed
- artists.json: artists sorted by name (case-insensitive); field order fixed
- runs.json:    newest run first, at most 60 runs
- venues.json:  venues sorted by name; field order fixed

Usage: python3 scripts/format_data.py [--check]
  --check   exit 1 if any file would change (for CI), without writing
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

SHOW_ORDER = ["id", "date", "time", "title", "acts", "venue", "city", "canton", "url", "tickets", "source_url", "lat", "lon", "genres"]
ARTIST_ORDER = ["genres", "source", "checked", "festivals", "tour_checked"]
MAX_RUNS = 60


def ordered(obj, order):
    """Return a dict with known keys first (in `order`), unknown keys after, untouched."""
    out = {k: obj[k] for k in order if k in obj}
    out.update({k: v for k, v in obj.items() if k not in out})
    return out


def dumps(obj):
    return json.dumps(obj, ensure_ascii=False)


def format_shows(data):
    shows = data.get("shows", [])
    if isinstance(shows, list) and all(isinstance(s, dict) for s in shows):
        shows = sorted(shows, key=lambda s: (str(s.get("date", "")), str(s.get("time", "")), str(s.get("title", ""))))
        shows = [ordered(s, SHOW_ORDER) for s in shows]
    head = {k: v for k, v in data.items() if k != "shows"}
    lines = [f"  {dumps(k)}: {dumps(v)}," for k, v in head.items()]
    body = ",\n".join("    " + dumps(s) for s in shows)
    return "{\n" + "\n".join(lines) + "\n  \"shows\": [\n" + body + ("\n" if body else "") + "  ]\n}\n"


def format_artists(data):
    artists = data.get("artists", {})
    if isinstance(artists, dict):
        artists = {k: ordered(v, ARTIST_ORDER) if isinstance(v, dict) else v
                   for k, v in sorted(artists.items(), key=lambda kv: kv[0].casefold())}
    out = {k: v for k, v in data.items() if k != "artists"}
    out["artists"] = artists
    return json.dumps(out, ensure_ascii=False, indent=2) + "\n"


def format_runs(data):
    runs = data.get("runs", [])
    if isinstance(runs, list) and all(isinstance(r, dict) for r in runs):
        runs = sorted(runs, key=lambda r: str(r.get("at", "")), reverse=True)[:MAX_RUNS]
    out = {k: v for k, v in data.items() if k != "runs"}
    out["runs"] = runs
    return json.dumps(out, ensure_ascii=False, indent=2) + "\n"


VENUE_ORDER = ["city", "canton", "lat", "lon", "url", "scrape", "hint"]


def format_venues(data):
    venues = data.get("venues", {})
    if isinstance(venues, dict):
        venues = {k: ordered(v, VENUE_ORDER) if isinstance(v, dict) else v
                  for k, v in sorted(venues.items(), key=lambda kv: kv[0].casefold())}
    out = {k: v for k, v in data.items() if k != "venues"}
    out["venues"] = venues
    return json.dumps(out, ensure_ascii=False, indent=2) + "\n"


FORMATTERS = {"shows.json": format_shows, "artists.json": format_artists, "runs.json": format_runs, "venues.json": format_venues}


def main(argv):
    check = "--check" in argv
    changed = []
    for name, fmt in FORMATTERS.items():
        path = DATA / name
        if not path.exists():
            continue
        before = path.read_text(encoding="utf-8")
        try:
            after = fmt(json.loads(before))
        except (json.JSONDecodeError, AttributeError) as e:
            print(f"ERROR {name}: {e}")
            return 1
        if after != before:
            changed.append(name)
            if not check:
                path.write_text(after, encoding="utf-8")
    if check and changed:
        print("would reformat: " + ", ".join(changed) + "  (run: make fmt-data)")
        return 1
    print("formatted: " + (", ".join(changed) if changed else "nothing to do"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
