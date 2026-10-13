#!/usr/bin/env python3
"""Dead-link check for the links visitors click: shows[].url, shows[].tickets (data/shows.json) and
venues[].url (data/venues.json). Run weekly by quality_review.py (the result goes into the review issue)
and by hand with `python3 scripts/check_links.py`.

Only a clear answer counts as broken: HTTP 404 or 410, or a host that does not resolve. Bot walls and
rate limits (401, 403, 429, 5xx), timeouts and TLS hiccups are ignored – ticket shops answer bots that
way, and the link still works for a person. Stdlib only. Exit 1 when a link is broken.
"""

import json
import socket
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
BROKEN_STATUS = {404, 410}
TIMEOUT = 15
AGENT = "Mozilla/5.0 (compatible; jahgenda-linkcheck; +https://markusbaumg.github.io/jahgenda/)"


def collect(shows_doc, venues_doc):
    """[(url, where)] – one line per link; the same url used by several records is listed once, with
    every place it occurs in `where`."""
    seen = {}
    for s in shows_doc.get("shows") or []:
        if not isinstance(s, dict):
            continue
        for field in ("url", "tickets"):
            u = s.get(field)
            if isinstance(u, str) and u.startswith(("http://", "https://")):
                seen.setdefault(u, []).append(f"show {s.get('id', '?')} ({field})")
    venues = venues_doc.get("venues") or {}
    if isinstance(venues, dict):
        for name, v in venues.items():
            u = v.get("url") if isinstance(v, dict) else None
            if isinstance(u, str) and u.startswith(("http://", "https://")):
                seen.setdefault(u, []).append(f"venue {name}")
    return [(u, ", ".join(where)) for u, where in seen.items()]


def classify(url, opener=urllib.request.urlopen):
    """None when the link is fine (or the answer says nothing, see the module doc), else the reason."""
    # The #fragment never reaches the server: what is checked is what the browser requests.
    target = url.split("#", 1)[0]
    for method in ("HEAD", "GET"):
        req = urllib.request.Request(target, method=method, headers={"User-Agent": AGENT})
        try:
            with opener(req, timeout=TIMEOUT):
                return None
        except urllib.error.HTTPError as e:
            if e.code in BROKEN_STATUS:
                if method == "HEAD":
                    continue  # some servers answer HEAD with 404 – GET decides
                return f"HTTP {e.code}"
            if method == "HEAD" and e.code in (400, 403, 405, 501):
                continue  # HEAD not allowed / bot wall on HEAD – try GET
            return None
        except urllib.error.URLError as e:
            if isinstance(e.reason, socket.gaierror):
                return "DNS: host not found"
            return None
        except (OSError, ValueError):
            return None
    return None


def check(links, opener=urllib.request.urlopen, workers=8):
    """[(url, where, reason)] for the broken links, in the order of `links`."""
    with ThreadPoolExecutor(max_workers=workers) as pool:
        reasons = list(pool.map(lambda link: classify(link[0], opener), links))
    return [(u, where, r) for (u, where), r in zip(links, reasons) if r]


def load():
    def read(name):
        try:
            return json.loads((DATA / name).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    return collect(read("shows.json"), read("venues.json"))


def main():
    links = load()
    broken = check(links)
    for u, where, reason in broken:
        print(f"BROKEN {reason}: {u}  ← {where}")
    print(f"{len(links)} links checked, {len(broken)} broken")
    return 1 if broken else 0


if __name__ == "__main__":
    sys.exit(main())
