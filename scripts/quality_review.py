#!/usr/bin/env python3
"""Weekly quality review: open one GitHub issue listing what the scraper dropped in the last 7 days.

Gives the owners a notification (GitHub issue → mail/app) to check false negatives on review.html.
Stdlib only. Needs GITHUB_TOKEN (issues: write) and GITHUB_REPOSITORY. DRY_RUN=1 prints instead.

Usage: python3 scripts/quality_review.py [--days 7]
"""

import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNS = ROOT / "data" / "runs.json"
REPO = os.environ.get("GITHUB_REPOSITORY", "markusbaumg/jahgenda")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
DRY_RUN = os.environ.get("DRY_RUN") == "1"
SITE = "https://markusbaumg.github.io/jahgenda/"


def parse_ts(value):
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def collect(days):
    try:
        runs = json.loads(RUNS.read_text(encoding="utf-8")).get("runs", [])
    except (OSError, ValueError):
        return []
    since = datetime.now(timezone.utc) - timedelta(days=days)
    out = []
    for r in runs:
        at = parse_ts(r.get("at"))
        if not at or at < since:
            continue
        for d in r.get("dropped") or []:
            if isinstance(d, dict):
                out.append((at, d, r))
    return out


def body_for(items, days):
    lines = [
        f"The scraper dropped **{len(items)} candidate(s)** in the last {days} days. Please skim them for",
        f"false negatives on [review.html]({SITE}review.html) — each row has a «Gehört rein» button that opens",
        "a prefilled issue. Rules live in `scraper/criteria.md` and `scraper/bands.md`.",
        "",
    ]
    for at, d, r in sorted(items, key=lambda x: x[0], reverse=True):
        where = ", ".join(x for x in (d.get("venue"), d.get("city")) if x)
        link = f" ([Quelle]({d['url']}))" if d.get("url") else ""
        lines.append(
            f"- **{d.get('title', '?')}** · {d.get('date', '?')} · {where}{link} — {d.get('why', '')}"
        )
    sources = {}
    for _, _, r in items:
        for s in r.get("sources") or []:
            if s.get("status") == "failed":
                sources[s.get("name")] = s.get("error", "")
    if sources:
        lines += ["", "**Sources that failed in these runs:**"] + [f"- {n}: {e}" for n, e in sources.items()]
    lines += ["", f"Full logs: {SITE}log.html"]
    return "\n".join(lines)


def gh(method, path, body=None):
    req = urllib.request.Request(
        "https://api.github.com" + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "jahgenda-quality-review",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode() or "{}")


def main(argv):
    days = 7
    if "--days" in argv:
        days = int(argv[argv.index("--days") + 1])
    items = collect(days)
    if not items:
        print("nothing dropped in the period – no issue")
        return 0
    title = f"Quality review: {len(items)} dropped candidate(s) in the last {days} days"
    body = body_for(items, days)
    if DRY_RUN or not TOKEN:
        print(title)
        print(body)
        return 0
    created = gh(
        "POST", f"/repos/{REPO}/issues", {"title": title, "body": body, "labels": ["quality", "scraper"]}
    )
    print(f"opened issue #{created.get('number')}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
