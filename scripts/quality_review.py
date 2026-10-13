#!/usr/bin/env python3
"""Weekly quality review: open one GitHub issue listing what the scraper dropped in the last 7 days.

Gives the owners a notification (GitHub issue → mail/app) to check false negatives in the Mischpult
(mischpult.html#aussortiert).
Stdlib only. Needs GITHUB_TOKEN (issues: write) and GITHUB_REPOSITORY. DRY_RUN=1 prints instead.

Usage: python3 scripts/quality_review.py [--days 7]
"""

import json
import os
import re
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


DATE_IN_TITLE = re.compile(r"\b(\d{1,2})\.(\d{1,2})\.(?:(\d{4}))?")


def drop_key(d):
    """Same candidate dropped by several runs → one key: the first words of the title (before « @ », « – »,
    a bracket or a colon) plus the date (the `date` field, or a «DD.MM.» the prompt wrote into the title)."""
    title = re.split(r" @ | – | - |\(|:", str(d.get("title") or ""), maxsplit=1)[0]
    words = re.sub(r"[^a-z0-9äöüéèàç ]", " ", title.lower()).split()[:3]
    day = d.get("date") or ""
    if not day:
        m = DATE_IN_TITLE.search(str(d.get("title") or ""))
        if m:
            day = f"{m.group(1).zfill(2)}.{m.group(2).zfill(2)}"
    elif re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(day)):
        day = f"{day[8:10]}.{day[5:7]}"
    return (" ".join(words), day)


def dedupe(items):
    """Keep one entry per candidate (the most complete one: date + venue + url), newest run first,
    and remember in how many runs it was dropped."""
    best, order = {}, []
    for at, d, r in items:
        k = drop_key(d)
        score = sum(bool(d.get(f)) for f in ("date", "venue", "city", "url"))
        if k not in best:
            best[k] = [at, d, r, score, 1]
            order.append(k)
        else:
            best[k][4] += 1
            if score > best[k][3] or (score == best[k][3] and at > best[k][0]):
                best[k][:4] = [at, d, r, score]
    return [(b[0], dict(b[1], runs=b[4]), b[2]) for b in (best[k] for k in order)]


def body_for(items, days):
    lines = [
        f"The scraper dropped **{len(items)} candidate(s)** in the last {days} days. Please skim them for",
        f"false negatives in the [Mischpult]({SITE}mischpult.html#aussortiert) (tab «Aussortiert») —",
        "each row has a «Gehört rein» button that opens a prefilled issue.",
        "Rules live in `scraper/criteria.md` and `scraper/bands.md`.",
        "",
    ]
    for at, d, r in sorted(items, key=lambda x: x[0], reverse=True):
        where = ", ".join(x for x in (d.get("venue"), d.get("city")) if x)
        link = f" ([Quelle]({d['url']}))" if d.get("url") else ""
        times = f" (in {d['runs']} Läufen)" if d.get("runs", 1) > 1 else ""
        lines.append(
            f"- **{d.get('title', '?')}** · {d.get('date', '?')} · {where}{link} — {d.get('why', '')}{times}"
        )
    sources = {}
    for _, _, r in items:
        for s in r.get("sources") or []:
            if s.get("status") == "failed":
                sources[s.get("name")] = s.get("error", "")
    if sources:
        lines += ["", "**Sources that failed in these runs:**"] + [f"- {n}: {e}" for n, e in sources.items()]
    lines += ["", f"Full logs: {SITE}mischpult.html#laeufe"]
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
    items = dedupe(collect(days))
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
