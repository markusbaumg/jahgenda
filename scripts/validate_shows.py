#!/usr/bin/env python3
"""Validate data/shows.json, data/venues.json, data/artists.json, data/runs.json and data/status.json.

Runs in CI before every deploy and at the end of every scraper run, so a bad
scraper result can never reach the live page. No third-party dependencies.

Usage: python3 scripts/validate_shows.py [--allow-past]
  --allow-past   accept shows whose date is already over (CI uses this; the
                 scraper itself runs strict so it never commits past shows)
Exit code 0 = valid, 1 = problems found (printed one per line).

The list of allowed genre slugs is read from data/genres.json.
"""

import json
import re
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHOWS = ROOT / "data" / "shows.json"
ARTISTS = ROOT / "data" / "artists.json"
RUNS = ROOT / "data" / "runs.json"
STATUS = ROOT / "data" / "status.json"
VENUES = ROOT / "data" / "venues.json"
GENRES = ROOT / "data" / "genres.json"
SLOGANS = ROOT / "data" / "slogans.json"

CANTONS = {
    "AG",
    "AI",
    "AR",
    "BE",
    "BL",
    "BS",
    "FR",
    "GE",
    "GL",
    "GR",
    "JU",
    "LU",
    "NE",
    "NW",
    "OW",
    "SG",
    "SH",
    "SO",
    "SZ",
    "TG",
    "TI",
    "UR",
    "VD",
    "VS",
    "ZG",
    "ZH",
}
# Neighbouring countries for shows just across the border (vehicle codes, no clash with cantons).
ABROAD = {"D", "F", "I", "A", "FL"}
REGIONS = CANTONS | ABROAD

ID_RE = re.compile(r"^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
URL_RE = re.compile(r"^https?://")
# Switzerland plus a border strip into the neighbouring countries.
LAT = (45.4, 48.3)
LON = (5.4, 11.0)
MAX_GENRES = 3

SHOW_REQUIRED = {"id": str, "date": str, "title": str, "venue": str, "city": str, "canton": str}
SHOW_OPTIONAL = {
    "time": str,
    "url": str,
    "tickets": str,
    "source_url": str,
    "lat": (int, float),
    "lon": (int, float),
    "genres": list,
    "acts": list,
}
ARTIST_FIELDS = {"genres", "source", "checked", "festivals", "tour_checked"}
VENUE_REQUIRED = {"city": str, "canton": str, "lat": (int, float), "lon": (int, float)}
VENUE_OPTIONAL = {"url": str, "scrape": bool, "hint": str}
SKILLS = ("scrape-shows", "harvest-bands")
STATUS_FIELDS = {"ok", "skill", "at", "runner", "counts", "failed_sources", "error"}
COUNT_KEYS = {"added", "updated", "removed", "total"}
GENRE_FIELDS = {"slug", "label", "maps"}


def load(path):
    try:
        return json.loads(path.read_text(encoding="utf-8")), []
    except FileNotFoundError:
        return None, [f"{path.name}: file missing"]
    except json.JSONDecodeError as e:
        return None, [f"{path.name}: invalid JSON ({e})"]


def allowed_genres():
    """Slugs from data/genres.json in display order. Empty = file missing or malformed."""
    try:
        data = json.loads(GENRES.read_text(encoding="utf-8"))
        return {g["slug"] for g in data["genres"] if SLUG_RE.match(str(g.get("slug", "")))}
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return set()


def check_genres_file(data):
    """data/genres.json: the single source for slugs, labels and chip order - so every entry needs a
    unique slug and a label, and nothing else goes unnoticed (allowed_genres() only skims the slugs)."""
    if not isinstance(data, dict) or not isinstance(data.get("genres"), list):
        return ["genres.json: must be an object with a 'genres' list"]
    errs, seen = [], set()
    for i, g in enumerate(data["genres"]):
        where = f"genres[{i}]"
        if not isinstance(g, dict):
            errs.append(f"{where}: not an object")
            continue
        slug = g.get("slug")
        if not isinstance(slug, str) or not SLUG_RE.match(slug):
            errs.append(f"{where}: 'slug' must be a lowercase slug like 'roots' or 'ska-punk'")
        elif slug in seen:
            errs.append(f"{where}: duplicate slug '{slug}'")
        else:
            seen.add(slug)
        if not isinstance(g.get("label"), str) or not g["label"].strip():
            errs.append(f"{where}: 'label' must be a non-empty string")
        if "maps" in g and not isinstance(g["maps"], str):
            errs.append(f"{where}: 'maps' must be a string")
        for key in g:
            if key not in GENRE_FIELDS:
                errs.append(f"{where}: unknown field '{key}'")
    for key in data:
        if key not in ("note", "genres"):
            errs.append(f"genres.json: unknown field '{key}'")
    return errs


def check_slogans(data):
    """data/slogans.json: {"slogans": [non-empty strings]} - anything else makes the page silently
    keep its static tagline."""
    if not isinstance(data, dict) or not isinstance(data.get("slogans"), list):
        return ["slogans.json: must be an object with a 'slogans' list"]
    errs, seen = [], set()
    for i, line in enumerate(data["slogans"]):
        if not isinstance(line, str) or not line.strip():
            errs.append(f"slogans[{i}]: must be a non-empty string")
        elif line.strip() in seen:
            errs.append(f"slogans[{i}]: duplicate '{line}'")
        else:
            seen.add(line.strip())
    if not data["slogans"]:
        errs.append("slogans.json: 'slogans' is empty")
    for key in data:
        if key not in ("note", "slogans"):
            errs.append(f"slogans.json: unknown field '{key}'")
    return errs


def check_genres(where, genres, allowed):
    if not isinstance(genres, list):
        return [f"{where}: 'genres' must be a list"]
    errs = []
    for g in genres:
        if not isinstance(g, str) or not SLUG_RE.match(g):
            errs.append(f"{where}: genre '{g}' must be a lowercase slug like 'roots' or 'lovers-rock'")
        elif allowed and g not in allowed:
            errs.append(f"{where}: genre '{g}' is not in data/genres.json")
    if len(genres) > MAX_GENRES:
        errs.append(f"{where}: at most {MAX_GENRES} genres")
    if len(set(map(str, genres))) != len(genres):
        errs.append(f"{where}: duplicate genre")
    return errs


def check_show(s, i, allow_past, today, allowed):
    where = f"shows[{i}]" + (f" ({s.get('id')})" if isinstance(s, dict) and s.get("id") else "")
    if not isinstance(s, dict):
        return [f"{where}: not an object"]
    errs = []

    for key, typ in SHOW_REQUIRED.items():
        if key not in s:
            errs.append(f"{where}: missing '{key}'")
        elif not isinstance(s[key], typ) or not s[key].strip():
            errs.append(f"{where}: '{key}' must be a non-empty string")
    for key, typ in SHOW_OPTIONAL.items():
        if key in s and (not isinstance(s[key], typ) or isinstance(s[key], bool)):
            errs.append(f"{where}: '{key}' has wrong type")
    for key in s:
        if key not in SHOW_REQUIRED and key not in SHOW_OPTIONAL:
            errs.append(f"{where}: unknown field '{key}'")
    if errs:
        return errs

    if not ID_RE.match(s["id"]):
        errs.append(f"{where}: id must look like 'YYYY-MM-DD-slug'")
    try:
        d = datetime.strptime(s["date"], "%Y-%m-%d").date()
    except ValueError:
        errs.append(f"{where}: date must be YYYY-MM-DD")
    else:
        if not s["id"].startswith(s["date"]):
            errs.append(f"{where}: id must start with the show's date")
        if not allow_past and d < today:
            errs.append(f"{where}: date {s['date']} is in the past")
        if d > today + timedelta(days=2 * 366):
            errs.append(f"{where}: date {s['date']} is more than two years ahead")

    if s.get("time") and not TIME_RE.match(s["time"]):
        errs.append(f"{where}: time must be HH:MM")
    if s["canton"] not in REGIONS:
        errs.append(
            f"{where}: unknown canton '{s['canton']}' "
            "(cantons, or D/F/I/A/FL for shows just across the border)"
        )
    for key in ("url", "tickets", "source_url"):
        if s.get(key) and not URL_RE.match(s[key]):
            errs.append(f"{where}: {key} must start with http(s)://")
    if ("lat" in s) != ("lon" in s):
        errs.append(f"{where}: lat and lon must both be set or both be absent")
    if "lat" in s and "lon" in s:
        if not (LAT[0] <= s["lat"] <= LAT[1] and LON[0] <= s["lon"] <= LON[1]):
            errs.append(f"{where}: coordinates are outside Switzerland and its border region")
    if "genres" in s:
        errs += check_genres(where, s["genres"], allowed)
    for a in s.get("acts", []):
        if not isinstance(a, str) or not a.strip():
            errs.append(f"{where}: every entry in 'acts' must be a non-empty string")
    return errs


def norm_key(name):
    """Normalised form for near-duplicate detection (venues, artists, same-slot shows):
    lowercase ASCII letters and digits only. app.js venueKey applies the same rule."""
    return re.sub(r"[^a-z0-9]+", "", str(name).lower())


venue_key = artist_key = norm_key


def check_venues(data):
    """data/venues.json: every venue has city, canton and coordinates inside the region."""
    if data is None:
        return [], {}
    if not isinstance(data, dict) or not isinstance(data.get("venues"), dict):
        return ["venues.json: must be an object with a 'venues' object"], {}
    errs, keys = [], {}
    for name, v in data["venues"].items():
        where = f"venues[{name}]"
        k = venue_key(name)
        if k in keys:
            errs.append(f"{where}: near-duplicate of '{keys[k]}' — keep one spelling")
        keys[k] = name
        if not isinstance(v, dict):
            errs.append(f"{where}: not an object")
            continue
        for key, typ in VENUE_REQUIRED.items():
            if key not in v:
                errs.append(f"{where}: missing '{key}'")
            elif (
                not isinstance(v[key], typ) or isinstance(v[key], bool) or (typ is str and not v[key].strip())
            ):
                errs.append(f"{where}: '{key}' has wrong type")
        for key, typ in VENUE_OPTIONAL.items():
            if key in v and not isinstance(v[key], typ):
                errs.append(f"{where}: '{key}' has wrong type")
        for key in v:
            if key not in VENUE_REQUIRED and key not in VENUE_OPTIONAL:
                errs.append(f"{where}: unknown field '{key}'")
        if isinstance(v.get("canton"), str) and v["canton"] not in REGIONS:
            errs.append(f"{where}: unknown canton '{v['canton']}'")
        if isinstance(v.get("lat"), (int, float)) and isinstance(v.get("lon"), (int, float)):
            if not (LAT[0] <= v["lat"] <= LAT[1] and LON[0] <= v["lon"] <= LON[1]):
                errs.append(f"{where}: coordinates are outside Switzerland and its border region")
        if v.get("url") and not URL_RE.match(v["url"]):
            errs.append(f"{where}: url must start with http(s)://")
    return errs, keys


# A show's coordinates may differ from its venue's by this much (≈ 2 km) before it counts as a different place.
VENUE_DRIFT = 0.03


def check_shows(data, allow_past, allowed, venue_keys=None, venues=None):
    """venue_keys: {norm_key: name} of data/venues.json (scraped shows must use a known venue);
    venues: the venue records by name – scraped shows must then sit in their venue's canton and place."""
    if not isinstance(data, dict):
        return ["shows.json: top level must be an object"]
    errs = []
    source = data.get("source")
    if source not in ("mock", "scraper"):
        errs.append("shows.json: 'source' must be 'mock' or 'scraper'")
    try:
        datetime.fromisoformat(str(data.get("updated")))
    except ValueError:
        errs.append("shows.json: 'updated' must be an ISO 8601 timestamp")
    shows = data.get("shows")
    if not isinstance(shows, list):
        return errs + ["shows.json: 'shows' must be a list"]

    today = date.today()
    allow_past = allow_past or source == "mock"  # mock data may age
    seen_ids, seen_slots = {}, {}
    for i, s in enumerate(shows):
        errs += check_show(s, i, allow_past, today, allowed)
        if not isinstance(s, dict):
            continue
        sid = s.get("id")
        if isinstance(sid, str):
            if sid in seen_ids:
                errs.append(f"shows[{i}]: duplicate id '{sid}' (also shows[{seen_ids[sid]}])")
            seen_ids[sid] = i
        if isinstance(s.get("date"), str) and isinstance(s.get("venue"), str):
            # Same night, same venue, same (or no) start time: almost certainly the same show twice.
            slot = (s["date"], venue_key(s["venue"]), s.get("time") or "")
            if slot in seen_slots:
                errs.append(
                    f"shows[{i}] ({sid}): same date, venue and time as {seen_slots[slot]} — merge them"
                )
            else:
                seen_slots[slot] = sid
        if source == "scraper" and not s.get("source_url"):
            errs.append(
                f"shows[{i}] ({sid}): scraped shows need a 'source_url' pointing to where it was found"
            )
        if (
            source == "scraper"
            and venue_keys is not None
            and isinstance(s.get("venue"), str)
            and venue_key(s["venue"]) not in venue_keys
        ):
            errs.append(
                f"shows[{i}] ({sid}): venue '{s['venue']}' is not in data/venues.json — "
                "add it with coordinates"
            )
        elif source == "scraper" and venues is not None and isinstance(s.get("venue"), str):
            errs += check_show_venue(s, i, venues.get(venue_keys.get(venue_key(s["venue"]), s["venue"])))
    return errs


def check_show_venue(s, i, v):
    """Scraped show vs its venue record: same canton, coordinates at the venue (catches a show filed
    under a venue of the same name in another town, or stale coordinates)."""
    if not isinstance(v, dict):
        return []
    sid = s.get("id")
    errs = []
    if isinstance(s.get("canton"), str) and isinstance(v.get("canton"), str) and s["canton"] != v["canton"]:
        errs.append(
            f"shows[{i}] ({sid}): canton '{s['canton']}' but venue '{s['venue']}' is in {v['canton']} — "
            "wrong venue or wrong canton"
        )
    if all(
        isinstance(x, (int, float)) and not isinstance(x, bool)
        for x in (s.get("lat"), s.get("lon"), v.get("lat"), v.get("lon"))
    ):
        if abs(s["lat"] - v["lat"]) + abs(s["lon"] - v["lon"]) > VENUE_DRIFT:
            errs.append(
                f"shows[{i}] ({sid}): coordinates are not at venue '{s['venue']}' ({v.get('city')}) — "
                "another place with the same name? add it as its own venue"
            )
    return errs


def check_artists(data, allowed):
    if data is None:
        return []
    if not isinstance(data, dict) or not isinstance(data.get("artists"), dict):
        return ["artists.json: must be an object with an 'artists' object"]
    errs = []
    seen = {}
    for name, a in data["artists"].items():
        where = f"artists[{name}]"
        key = artist_key(name)
        if key in seen:
            errs.append(f"{where}: near-duplicate of '{seen[key]}' — keep one spelling")
        seen[key] = name
        if not isinstance(a, dict):
            errs.append(f"{where}: not an object")
            continue
        for k in a:
            if k not in ARTIST_FIELDS:
                errs.append(f"{where}: unknown field '{k}'")
        errs += check_genres(where, a.get("genres"), allowed)
        src = a.get("source", "")
        if src and src != "manual" and not URL_RE.match(str(src)):
            errs.append(f"{where}: source must be a URL or 'manual'")
        if "festivals" in a and not (
            isinstance(a["festivals"], list) and all(isinstance(f, str) for f in a["festivals"])
        ):
            errs.append(f"{where}: 'festivals' must be a list of names")
        for k in ("checked", "tour_checked"):
            if k in a:
                try:
                    datetime.strptime(str(a[k]), "%Y-%m-%d")
                except ValueError:
                    errs.append(f"{where}: '{k}' must be YYYY-MM-DD")
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
            if not isinstance(r.get(key, 0), int) or isinstance(r.get(key, 0), bool):
                errs.append(f"{where}: '{key}' must be an integer")
        for key in ("failed_sources", "dropped", "notes"):
            if key in r and not isinstance(r[key], list):
                errs.append(f"{where}: '{key}' must be a list")
        for j, d in enumerate(r.get("dropped") or []):
            if not (
                isinstance(d, dict) and isinstance(d.get("title"), str) and isinstance(d.get("why"), str)
            ):
                errs.append(f"{where}.dropped[{j}]: needs 'title' and 'why'")
            elif d.get("url") and not URL_RE.match(str(d["url"])):
                errs.append(f"{where}.dropped[{j}]: url must start with http(s)://")
        if "sources" in r and not isinstance(r["sources"], list):
            errs.append(f"{where}: 'sources' must be a list")
        for j, src in enumerate(r.get("sources") or []):
            if not isinstance(src, dict) or not isinstance(src.get("name"), str):
                errs.append(f"{where}.sources[{j}]: needs a 'name'")
            elif src.get("status") not in ("ok", "empty", "failed", "skipped"):
                errs.append(
                    f"{where}.sources[{j}] ({src['name']}): status must be ok, empty, failed or skipped"
                )
    return errs


def check_status(data):
    """data/status.json, the heartbeat every skill run overwrites and the watchdog reads
    (scripts/check_freshness.py). None = file absent, which is fine until the first run."""
    if data is None:
        return []
    if not isinstance(data, dict):
        return ["status.json: must be an object"]
    errs = []
    if not isinstance(data.get("ok"), bool):
        errs.append("status.json: 'ok' must be true or false")
    if data.get("skill") not in SKILLS:
        errs.append("status.json: 'skill' must be scrape-shows or harvest-bands")
    try:
        if datetime.fromisoformat(str(data.get("at")).replace("Z", "+00:00")).tzinfo is None:
            errs.append("status.json: 'at' needs a UTC offset (TZ=Europe/Zurich date -Iseconds)")
    except ValueError:
        errs.append("status.json: 'at' must be an ISO 8601 timestamp")
    if "runner" in data and not isinstance(data["runner"], str):
        errs.append("status.json: 'runner' must be a string")
    counts = data.get("counts", {})
    if not isinstance(counts, dict):
        errs.append("status.json: 'counts' must be an object of integers")
    else:
        for key, value in counts.items():
            if key not in COUNT_KEYS:
                errs.append(f"status.json: unknown count '{key}'")
            elif not isinstance(value, int) or isinstance(value, bool):
                errs.append(f"status.json: count '{key}' must be an integer")
    fs = data.get("failed_sources", 0)
    if not isinstance(fs, int) or isinstance(fs, bool):
        errs.append("status.json: 'failed_sources' must be an integer")
    if data.get("error") is not None and not isinstance(data["error"], str):
        errs.append("status.json: 'error' must be a string or null")
    for key in data:
        if key not in STATUS_FIELDS:
            errs.append(f"status.json: unknown field '{key}'")
    return errs


def main(argv):
    allow_past = "--allow-past" in argv
    allowed = allowed_genres()
    errs = []
    if not allowed:
        errs.append("data/genres.json: missing or malformed (no genre slugs)")
    else:
        genres, e = load(GENRES)
        errs += e or check_genres_file(genres)
    if SLOGANS.exists():  # optional: without it the page keeps its static tagline
        slogans, e = load(SLOGANS)
        errs += e or check_slogans(slogans)

    venues, e = load(VENUES)
    errs += e
    v_errs, venue_keys = check_venues(venues)
    errs += v_errs

    shows, e = load(SHOWS)
    errs += e
    if shows is not None:
        errs += check_shows(
            shows,
            allow_past,
            allowed,
            venue_keys if venues is not None else None,
            venues["venues"] if isinstance(venues, dict) and isinstance(venues.get("venues"), dict) else None,
        )
    artists, e = load(ARTISTS)
    errs += e
    errs += check_artists(artists, allowed)
    runs, e = load(RUNS)
    errs += e
    errs += check_runs(runs)
    status, e = load(STATUS) if STATUS.exists() else (None, [])  # absent until the first run
    errs += e
    errs += check_status(status)

    for msg in errs:
        print(f"ERROR {msg}")
    if errs:
        print(f"{len(errs)} problem(s) found")
        return 1
    print(
        f"ok: {len(shows['shows'])} shows, {len(venues['venues'])} venues, "
        f"{len(artists['artists'])} artists, {len(runs['runs'])} runs, {len(allowed)} genre slugs, "
        f"status.json {'ok' if status else 'absent'}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
