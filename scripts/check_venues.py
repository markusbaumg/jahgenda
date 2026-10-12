#!/usr/bin/env python3
"""Check the coordinates in data/venues.json against OpenStreetMap (Nominatim).

For every venue the script asks Nominatim for "<venue>, <city>" (and, if that
finds nothing in the city, "<venue> <city>, <city>" for venues whose OSM name
includes the city, e.g. "Royal Baden"), picks the hit that is most likely the
venue (an amenity/building in the right city rather than a street or a
same-named object elsewhere), computes the distance to the stored point and
prints one line per venue:

    name | stored | nominatim | distance_m | OK/CHECK

OK     the chosen hit lies within --max-distance metres (default 150).
CITY   OSM does not know the venue by name; the stored point was compared with
       the city centre and is within 1500 m of it (also used for venues whose
       hint says "Koordinaten: Stadtmitte"). Fine, but verify once by hand.
CHECK  look at it by hand - Nominatim does not know every club, so a CHECK is
       a hint, not a verdict.

No third-party dependencies. Nominatim's usage policy: at most one request per
second and a User-Agent that names the project - both are built in.

Usage: python3 scripts/check_venues.py [--max-distance M] [--only NAME ...] [--json FILE]
  --max-distance M   OK threshold in metres (default 150)
  --only NAME        check only the venues named (repeatable, case-insensitive)
  --json FILE        also write the raw Nominatim hits (up to 3 per query) to FILE
Exit code 0 = everything OK/CITY, 1 = at least one CHECK or lookup error.
"""
import argparse
import json
import math
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENUES = ROOT / "data" / "venues.json"

NOMINATIM = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "Jahgenda/1.0 (markus.baumgartner@gmail.com)"
MIN_INTERVAL = 1.05  # seconds between requests (Nominatim policy: max 1/s)
COUNTRIES = "ch,de,fr,it,at,li"  # Switzerland plus the neighbours (criteria.md: grenznah)
CITY_CENTRE_MARK = "Koordinaten: Stadtmitte"
CITY_RADIUS_M = 1500

# Nominatim names some cities in another language than venues.json does.
CITY_ALIASES = {
    "st. gallen": {"sankt gallen", "saint-gall"},
    "genève": {"genf", "geneva"},
    "fribourg": {"freiburg"},
    "luzern": {"lucerne"},
    "zürich": {"zurich"},
    "bern": {"berne"},
}

_last_request = 0.0


def haversine_m(lat1, lon1, lat2, lon2):
    """Great-circle distance in metres."""
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def nominatim(query, limit=3):
    """Return the list of hits for a free-text query (rate-limited, polite)."""
    global _last_request
    wait = MIN_INTERVAL - (time.monotonic() - _last_request)
    if wait > 0:
        time.sleep(wait)
    params = {"q": query, "format": "json", "limit": str(limit), "countrycodes": COUNTRIES}
    url = NOMINATIM + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "de,fr,en"})
    for attempt, backoff in enumerate((10, 30, 60), start=1):
        _last_request = time.monotonic()
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code not in (429, 503) or attempt == 3:
                raise
            print(f"  (Nominatim {e.code}, waiting {backoff}s)", file=sys.stderr)
            time.sleep(backoff)


def in_city(hit, city):
    """True when the hit's display_name ("Name, 8, Street, Quarter, City, District, Canton, PLZ, Country")
    has the city as a whole element - so "Baden" does not match "Baden-Württemberg"."""
    parts = {p.strip().casefold() for p in hit.get("display_name", "").split(",")}
    names = {city.casefold()} | CITY_ALIASES.get(city.casefold(), set())
    return bool(names & parts)


def best_hit(hits, city):
    """The hit most likely to be the venue: in the right city, and a place rather than a street or
    an administrative area (Nominatim ranks e.g. a street 'Bierhübeli' in Grossaffoltern above the
    club in Bern, and a barn 'Schüür' in Mauensee above the Konzerthaus in Luzern)."""
    weight = {"amenity": 2, "leisure": 2, "tourism": 2, "club": 2, "building": 1, "shop": 1, "office": 1,
              "highway": -1, "boundary": -1, "place": -1}
    return max(hits, key=lambda h: (3 if in_city(h, city) else 0) + weight.get(h.get("class"), 0))


def lookup(name, city):
    """Venue-specific queries first, then the city alone. Returns (hits, query, is_city_only)."""
    found, query = [], ""
    queries = [f"{name}, {city}", f"{name} {city}, {city}"]
    for prefix in ("Café ", "Cafe ", "Bar ", "Le ", "La ", "L'", "Der ", "Die ", "Das "):
        if name.startswith(prefix) and len(name) > len(prefix) + 2:
            queries.append(f"{name[len(prefix):]}, {city}")  # OSM often drops the article: "Chat noir", "Mokka"
    for query in queries:
        found += [h for h in nominatim(query) if h not in found]
        if any(in_city(h, city) for h in found):
            return found, query, False
    if found:
        return found, query, False
    query = f"{city}, Schweiz"
    return nominatim(query), query, True


def fmt_point(lat, lon):
    return f"{lat:.4f},{lon:.4f}"


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--max-distance", type=float, default=150, metavar="M")
    ap.add_argument("--only", action="append", default=[], metavar="NAME")
    ap.add_argument("--json", metavar="FILE")
    args = ap.parse_args(argv)

    data = json.loads(VENUES.read_text(encoding="utf-8"))
    venues = data["venues"]
    if args.only:
        wanted = {n.casefold() for n in args.only}
        venues = {n: v for n, v in venues.items() if n.casefold() in wanted}
        if not venues:
            print("no venue matches --only", file=sys.stderr)
            return 1

    raw, problems = {}, 0
    width = max(len(n) for n in venues)
    header = f"{'name':{width}} | {'stored':15} | {'nominatim':15} | {'distance_m':>10} | status"
    print(header)
    print("-" * len(header))
    for name, v in venues.items():
        stored = fmt_point(v["lat"], v["lon"])
        city_centre = CITY_CENTRE_MARK in (v.get("hint") or "")
        try:
            if city_centre:
                query = f"{v['city']}, Schweiz"
                hits, city_only = nominatim(query), True
            else:
                hits, query, city_only = lookup(name, v["city"])
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            print(f"{name:{width}} | {stored:15} | {'-':15} | {'-':>10} | ERROR {e}")
            problems += 1
            continue
        raw[name] = {"query": query, "hits": hits}
        if not hits:
            print(f"{name:{width}} | {stored:15} | {'(no hit)':15} | {'-':>10} | CHECK")
            problems += 1
            continue
        h = hits[0] if city_only else best_hit(hits, v["city"])
        lat, lon = float(h["lat"]), float(h["lon"])
        dist = haversine_m(v["lat"], v["lon"], lat, lon)
        if city_only:
            status = "CITY" if dist <= CITY_RADIUS_M else "CHECK"
            if not city_centre:
                status += " (venue unknown to OSM, compared with city centre)"
        else:
            status = "OK" if dist <= args.max_distance else "CHECK"
        if status.startswith("CHECK"):
            problems += 1
        print(f"{name:{width}} | {stored:15} | {fmt_point(lat, lon):15} | {dist:10.0f} | {status}")

    if args.json:
        Path(args.json).write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{len(venues)} venues, {problems} to check")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
