#!/usr/bin/env python3
"""Freshness watchdog for the Jahgenda scraper.

Reads data/status.json (heartbeat written by every scraper run), data/runs.json and
data/shows.json, decides whether the scraper is healthy, and keeps exactly one GitHub
issue labelled `scraper-failed` in sync with that verdict:

  unhealthy  -> open the issue (or add a comment to the existing one)
  healthy    -> close the open issue, if any

Exit code 1 when unhealthy, so the workflow (and its badge) turns red and GitHub mails
the owner a "workflow failed" notification as well.

Stdlib only. Needs GITHUB_TOKEN (issues: write) and GITHUB_REPOSITORY in the environment.
Set DRY_RUN=1 to print the verdict without touching GitHub.

Usage: python3 scripts/check_freshness.py [--max-age-hours 36]
"""

import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from ghapi import DRY_RUN, REPO, SITE, TOKEN, parse_ts  # noqa: F401 (parse_ts is part of this module's API)
from ghapi import gh as _gh

try:
    from zoneinfo import ZoneInfo

    ZURICH = ZoneInfo("Europe/Zurich")
except Exception:  # pragma: no cover
    ZURICH = timezone.utc

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
LABEL = "scraper-failed"
LABEL_COLOR = "d73a4a"
ISSUE_TITLE = "Scraper is not delivering (watchdog)"
MENTION = "@" + REPO.split("/")[0]  # an @-mention always notifies, whatever the watch settings


def load(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (OSError, ValueError) as e:
        return {"__error__": f"{path.name}: {e}"}


def fmt(dt):
    return dt.astimezone(ZURICH).strftime("%a %Y-%m-%d %H:%M %Z") if dt else "never"


def hours(td):
    return td.total_seconds() / 3600


def assess(now, max_age):
    """Return (healthy: bool, lines: list[str]) describing the verdict."""
    problems, info = [], []

    status = load(DATA / "status.json")
    runs = load(DATA / "runs.json")
    shows = load(DATA / "shows.json")
    for d in (status, runs, shows):
        if isinstance(d, dict) and "__error__" in d:
            problems.append("unreadable file: " + d["__error__"])

    stamps = {}
    if isinstance(status, dict):
        stamps["status.json at"] = parse_ts(status.get("at"))
    if isinstance(runs, dict) and isinstance(runs.get("runs"), list):
        ats = [parse_ts(r.get("at")) for r in runs["runs"] if isinstance(r, dict)]
        ats = [a for a in ats if a]
        stamps["runs.json newest at"] = max(ats) if ats else None
    if isinstance(shows, dict):
        stamps["shows.json updated"] = parse_ts(shows.get("updated"))

    known = {k: v for k, v in stamps.items() if v}
    if not known:
        problems.append("no timestamp found in data/status.json, data/runs.json or data/shows.json")
    else:
        key, newest = max(known.items(), key=lambda kv: kv[1])
        age = now - newest
        info.append(f"last sign of life: {fmt(newest)} ({hours(age):.1f} h ago, from {key})")
        if age > max_age:
            problems.append(
                f"data is stale: {hours(age):.1f} h since the last run, limit is {hours(max_age):.0f} h"
            )
        if newest > now + timedelta(hours=2):
            problems.append(
                f"last timestamp lies in the future ({fmt(newest)}): clock or timezone bug in the scraper"
            )

    if isinstance(status, dict) and "__error__" not in status:
        ok = status.get("ok")
        # status.json is written by a prompt, not by code: never trust its shape.
        counts = status.get("counts") if isinstance(status.get("counts"), dict) else {}
        info.append(
            f"status.json: ok={ok} runner={status.get('runner', '?')} skill={status.get('skill', '?')} "
            f"total={counts.get('total', '?')} +{counts.get('added', 0)} "
            f"~{counts.get('updated', 0)} -{counts.get('removed', 0)}"
        )
        if ok is False:
            reason = status.get("error") or status.get("message") or "no reason given"
            problems.append(f"last run reported failure: {reason}")
            # A failed run (e.g. the cloud routine without network) does not mean the agenda is stale:
            # say how old the data itself is, so the owner knows whether visitors are affected.
            data_at = stamps.get("shows.json updated")
            if data_at:
                data_age = now - data_at
                verdict = "still fresh" if data_age <= max_age else "also stale"
                info.append(f"agenda data itself: {fmt(data_at)} ({hours(data_age):.1f} h ago) — {verdict}")
    else:
        info.append("status.json: missing (no run has written the heartbeat yet)")

    if isinstance(shows, dict) and "__error__" not in shows:
        n = len(shows.get("shows") or [])
        info.append(f"shows.json: {n} shows, source={shows.get('source')}")
        if shows.get("source") == "mock":
            info.append("note: shows.json is still mock data, the site shows the mock notice")
        elif n == 0:
            problems.append("shows.json contains zero shows")

    if isinstance(runs, dict) and isinstance(runs.get("runs"), list) and runs["runs"]:
        r = runs["runs"][0]
        if isinstance(r, dict) and r.get("failed_sources"):
            info.append(f"last run: {len(r['failed_sources'])} source(s) unreachable")

    return (not problems), problems + info


def gh(method, path, body=None):
    return _gh(method, path, body, agent="jahgenda-watchdog")


def open_issue():
    """The open scraper-failed issue, None when there is none - or False when GitHub could not
    be asked, which must not be mistaken for "none" (that would open a duplicate issue)."""
    code, issues = gh("GET", f"/repos/{REPO}/issues?labels={LABEL}&state=open&per_page=5")
    if code != 200:
        print(f"WARN cannot list issues: HTTP {code} {issues}")
        return False
    issues = [i for i in issues if "pull_request" not in i]
    return issues[0] if issues else None


def ensure_label():
    code, _ = gh(
        "POST",
        f"/repos/{REPO}/labels",
        {"name": LABEL, "color": LABEL_COLOR, "description": "Opened by the freshness watchdog"},
    )
    if code not in (201, 422):  # 422 = already exists
        print(f"WARN cannot create label: HTTP {code}")


def report(healthy, lines, now):
    run_url = ""
    if os.environ.get("GITHUB_SERVER_URL") and os.environ.get("GITHUB_RUN_ID"):
        run_url = f"{os.environ['GITHUB_SERVER_URL']}/{REPO}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
    stamp = now.astimezone(ZURICH).strftime("%Y-%m-%d %H:%M %Z")
    bullets = "\n".join(f"- {line}" for line in lines)
    links = (
        f"\n\nCheck: https://claude.ai/code/routines (last run and its log) · "
        f"{SITE}log.html · "
        f"[watchdog run]({run_url})"
        if run_url
        else ""
    )
    issue = open_issue()
    if issue is False:
        print("WARN cannot sync the issue, skipping the GitHub update (the run still fails when unhealthy)")
        return
    if not healthy:
        body = f"{MENTION} the watchdog found the scraper unhealthy at {stamp}:\n\n{bullets}{links}"
        if issue:
            gh(
                "POST",
                f"/repos/{REPO}/issues/{issue['number']}/comments",
                {"body": "Still unhealthy. " + body},
            )
            print(f"commented on existing issue #{issue['number']}")
        else:
            ensure_label()
            code, created = gh(
                "POST", f"/repos/{REPO}/issues", {"title": ISSUE_TITLE, "body": body, "labels": [LABEL]}
            )
            if code == 201:
                print(f"opened issue #{created.get('number')}")
            else:
                print(f"WARN cannot open issue: HTTP {code} {created}")
    elif issue:
        gh(
            "POST",
            f"/repos/{REPO}/issues/{issue['number']}/comments",
            {"body": f"Healthy again at {stamp}:\n\n{bullets}{links}\n\nClosing."},
        )
        gh(
            "PATCH",
            f"/repos/{REPO}/issues/{issue['number']}",
            {"state": "closed", "state_reason": "completed"},
        )
        print(f"closed issue #{issue['number']}")
    else:
        print("healthy, no open issue")


def main(argv):
    max_h = 36.0
    if "--max-age-hours" in argv:
        i = argv.index("--max-age-hours") + 1
        try:
            max_h = float(argv[i])
        except (IndexError, ValueError):
            print("usage: check_freshness.py [--max-age-hours N]")
            return 2
    now = datetime.now(timezone.utc)
    healthy, lines = assess(now, timedelta(hours=max_h))
    print(("HEALTHY" if healthy else "UNHEALTHY") + f" (checked {fmt(now)})")
    for line in lines:
        print("  " + line)
    if DRY_RUN or not TOKEN:
        print("dry run: GitHub not contacted" if DRY_RUN else "no GITHUB_TOKEN: GitHub not contacted")
    else:
        report(healthy, lines, now)
    return 0 if healthy else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
