#!/usr/bin/env python3
"""Validate data/shows.json and data/artists.json.

Runs in CI before every deploy and at the end of every scraper run, so a bad
scraper result can never reach the live page. No third-party dependencies.

Usage: python3 scripts/validate_shows.py [--allow-past]
Exit code 0 = valid, 1 = problems found (printed one per line).
"""
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHOWS = ROOT / "data" / "shows.json"
ARTISTS = ROOT / "data" / "artists.json"
RUNS = ROOT / "data" / "runs.json"

CANTONS = {
    "AG", "AI", "AR", "BE", "BL", "BS", "FR", "GE", "GL", "GR", "JU", "LU", "NE",
    "NW", "OW", "SG", "SH", "SO", "SZ", "TG", "TI", "UR", "VD", "VS", "ZG", "ZH",
}
ID_RE = re.compile(r"^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
GENRE_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
# Switzerland's bounding box, with a little slack.
LAT = (45.7, 47.9)
LON = (5.8, 10.6)

REQUIRED = {"id": str, "date": str, "title": str, "venue": str, "city": str, "canton": str}
OPTIONAL = {"time": str, "url": str, "lat": (int, float), "lon": (int, float), "genres": list, "source_url": str}


def load(path):
    try:
        return json.loads(path.read_text(encoding="utf-8")), []
    except FileNotFoundError:
        return None, [f"{path.name}: file missing"]
    except json.JSONDecodeError as e:
        return None, [f"{path.name}: invalid JSON ({e})"]


def check_show(s, i, allow_past, today):
    where = f"shows[{i}]" + (f" ({s.get('id')})" if isinstance(s, dict) and s.get("id") else "")
    errs = []
    if not isinstance(s, dict):
        return [f"{where}: not an object"]

    for key, typ in REQUIRED.items():
        if key not in s:
            errs.append(f"{where}: missing '{key}'")
        elif not isinstance(s[key], typ) or (typ is str and not s[key].strip()):
            errs.append(f"{where}: '{key}' must be a non-empty string")
    for key, typ in OPTIONAL.items():
        if key in s and not isinstance(s[key], typ):
            errs.append(f"{where}: '{key}' has wrong type")
    for key in s:
        if key not in REQUIRED and key not in OPTIONAL:
            errs.append(f"{where}: unknown field '{key}'")
    if errs:
        return errs

    if not ID_RE.match(s["id"]):
        errs.append(f"{where}: id must look like 'YYYY-MM-DD-slug'")
    try:
        d = datetime.strptime(s["date"], "%Y-%m-%d").date()
        if not s["id"].startswith(s["date"]):
            errs.append(f"{where}: id must start with the show's date")
        if not allow_past and d < today:
            errs.append(f"{where}: date {s['date']} is in the past")
        if d > today.replace(year=today.year + 2):
            errs.append(f"{where}: date {s['date']} is more than two years ahead")
    except ValueError:
        errs.append(f"{where}: date must be YYYY-MM-DD")

    if s.get("time") and not TIME_RE.match(s["time"]):
        errs.append(f"{where}: time must be HH:MM")
    if s["canton"] not in CANTONS:
        errs.append(f"{where}: unknown canton '{s['canton']}'")
    for key in ("url", "source_url"):
        if s.get(key) and not re.match(r"^https?://", s[key]):
            errs.append(f"{where}: {key} must start with http(s)://")
    if ("lat" in s) != ("lon" in s):
        errs.append(f"{where}: lat and lon must both be set or both be absent")
    if "lat" in s and "lon" in s:
        if not (LAT[0] <= s["lat"] <= LAT[1] and LON[0] <= s["lon"] <= LON[1]):
            errs.append(f"{where}: coordinates are outside Switzerland")
    for g in s.get("genres", []):
        if not isinstance(g, str) or not GENRE_RE.match(g):
            errs.append(f"{where}: genre '{g}' must be a lowercase slug like 'roots' or 'lovers-rock'")
    return errs


def check_shows(data, allow_past):
    errs = []
    if not isinstance(data, dict):
        return ["shows.json: top level must be an object"]
    if data.get("source") not in ("mock", "scraper"):
        errs.append("shows.json: 'source' must be 'mock' or 'scraper'")
    try:
        datetime.fromisoformat(str(data.get("updated")))
    except ValueError:
        errs.append("shows.json: 'updated' must be an ISO 8601 timestamp")
    shows = data.get("shows")
    if not isinstance(shows, list):
        return errs + ["shows.json: 'shows' must be a list"]

    today = date.today()
    # Mock data is allowed to age; scraped data must never contain past shows.
    allow_past = allow_past or data.get("source") == "mock"
    seen = set()
    for i, s in enumerate(shows):
        errs += check_show(s, i, allow_past, today)
        sid = s.get("id") if isinstance(s, dict) else None
        if sid in seen:
            errs.append(f"shows[{i}]: duplicate id '{sid}'")
        seen.add(sid)
    if data.get("source") == "scraper":
        missing = [s["id"] for s in shows if isinstance(s, dict) and not s.get("source_url")]
        for sid in missing:
            errs.append(f"{sid}: scraped shows need a 'source_url' pointing to where it was found")
    return errs


def check_artists(data):
    if data is None:
        return []
    errs = []
    if not isinstance(data, dict) or not isinstance(data.get("artists"), dict):
        return ["artists.json: must be an object with an 'artists' object"]
    for name, a in data["artists"].items():
        if not isinstance(a, dict):
            errs.append(f"artists[{name}]: not an object")
            continue
        for g in a.get("genres", []):
            if not isinstance(g, str) or not GENRE_RE.match(g):
                errs.append(f"artists[{name}]: genre '{g}' must be a lowercase slug")
        if a.get("source") and not re.match(r"^https?://", str(a["source"])):
            errs.append(f"artists[{name}]: source must be a URL")
        if "festivals" in a and not (isinstance(a["festivals"], list) and all(isinstance(f, str) for f in a["festivals"])):
            errs.append(f"artists[{name}]: 'festivals' must be a list of names")
        if a.get("tour_checked"):
            try:
                datetime.strptime(str(a["tour_checked"]), "%Y-%m-%d")
            except ValueError:
                errs.append(f"artists[{name}]: 'tour_checked' must be YYYY-MM-DD")
        try:
            datetime.strptime(str(a.get("checked")), "%Y-%m-%d")
        except ValueError:
            errs.append(f"artists[{name}]: 'checked' must be YYYY-MM-DD")
    return errs


def check_runs(data):
    if data is None:
        return []
    if not isinstance(data, dict) or not isinstance(data.get("runs"), list):
        return ["runs.json: must be an object with a 'runs' list"]
    errs = []
    if len(data["runs"]) > 60:
        errs.append("runs.json: keep at most 60 runs (drop the oldest)")
    for i, r in enumerate(data["runs"]):
        where = f"runs[{i}]"
        if not isinstance(r, dict):
            errs.append(f"{where}: not an object")
            continue
        if r.get("skill") not in ("scrape-shows", "harvest-bands"):
            errs.append(f"{where}: 'skill' must be scrape-shows or harvest-bands")
        try:
            datetime.fromisoformat(str(r.get("at")))
        except ValueError:
            errs.append(f"{where}: 'at' must be an ISO 8601 timestamp")
        for key in ("added", "updated", "removed", "total"):
            if not isinstance(r.get(key, 0), int):
                errs.append(f"{where}: '{key}' must be an integer")
        for key in ("failed_sources", "dropped", "notes"):
            if key in r and not isinstance(r[key], list):
                errs.append(f"{where}: '{key}' must be a list")
        for j, d in enumerate(r.get("dropped", [])):
            if not (isinstance(d, dict) and isinstance(d.get("title"), str) and isinstance(d.get("why"), str)):
                errs.append(f"{where}.dropped[{j}]: needs 'title' and 'why'")
    return errs


def main(argv):
    allow_past = "--allow-past" in argv
    shows, errs = load(SHOWS)
    if shows is not None:
        errs += check_shows(shows, allow_past)
    artists, a_errs = load(ARTISTS)
    errs += a_errs if ARTISTS.exists() else []
    errs += check_artists(artists)
    runs, r_errs = load(RUNS)
    errs += r_errs if RUNS.exists() else []
    errs += check_runs(runs)

    for e in errs:
        print(f"ERROR {e}")
    if errs:
        print(f"{len(errs)} problem(s) found")
        return 1
    n = len(shows["shows"]) if shows else 0
    print(f"ok: {n} shows, {len((artists or {}).get('artists', {}))} cached artists")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
