# Jahgenda scraper monitoring — proposal

Goal: the owner **knows when the scraper ran, knows when it failed, and has one clear scheduler story**. Everything below is stdlib Python + GitHub Actions + small edits to the skill, implementable in about an hour. Tested locally: the watchdog script below was dry-run against the current `data/` plus three fixtures (fresh ok, fresh fail, future timestamp) and gives the right verdict/exit code on Python 3.12+ (ubuntu-latest has 3.12).

## 0. Requirements as stories (checklist)

| # | Story | Acceptance criteria | Where |
|---|-------|---------------------|-------|
| S1 | As the owner I want **every scraper run to leave a trace**, even when it changes nothing or fails. | Every run commits `data/status.json` (heartbeat) and a `runs.json` entry; a failed run commits a `ok:false` entry without touching show data. | §5 |
| S2 | As the owner I want to **be told within a day when no run landed**. | A GitHub Actions job runs daily after the routine, opens one issue `scraper-failed` when the newest timestamp is older than 36 h or the last run says `ok:false`, closes it when healthy. | §2 |
| S3 | As the owner I want the **alert on my phone/mail**. | Issue @-mentions me (always notifies); workflow failure mails me; optional ntfy/Telegram push. | §4 |
| S4 | As the owner I want **one scheduler story**: cloud routine is primary, the Mac is a fallback that never double-runs. | launchd job runs only if `status.json` is older than 20 h; `status.json.runner` says who ran. | §1 |
| S5 | As a visitor/owner I want to **see the health at a glance**. | README badge (workflow status) + shields badge with show count; `log.html` banner "Letzter Lauf: … vor 3 h, ok, 41 Shows". | §3, §6 |
| S6 | As the owner I want **no false alarms** (holidays, DST, nothing new to add). | Freshness is measured on the heartbeat, not on data changes; all timestamps carry offsets; threshold 36 h covers a late routine. | §7 |
| S7 | As the owner I want **no corrupt deploys from concurrent pushes**. | Only the scraper commits; the watchdog never pushes; `pull --rebase` once on reject; Pages workflow already has `concurrency`. | §7 |

## 1. Operating model

```
06:07 Zurich  Claude routine "/scrape-shows"  (primary)  → commits data/* + status.json  → Pages deploys
07:10 Zurich  launchd on the Mac (fallback)              → runs ONLY if status.json older than 20 h
08:17 Zurich  GitHub Actions "watchdog" (observer)       → reads repo, opens/closes issue, never commits
```

- **Primary**: the cloud routine. Schedule it at `06:07`, not `06:00` (routine docs: on-the-hour runs can start several minutes late). The routine must push to `main` directly (the prompt already says so; routines otherwise push to `claude/*` branches).
- **Fallback**: the launchd job. Replace `make scrape` with a guard script so the Mac only steps in when the cloud did not deliver (see below). launchd fires missed jobs on wake, so a closed laptop still catches up later in the day.
- **Observer**: the watchdog workflow. It commits nothing and so can never conflict with the scraper. Its only side effect is the issue.
- **Who commits what**: only the scraper (cloud or Mac) commits, and only `data/*` + `scraper/bands.md` (Suggestions). `status.json` is written on *every* run, success or failure, so a run that "found nothing new" still moves the heartbeat (S1, S6).

Fallback guard, `scripts/scrape_if_stale.sh` (referenced from the plist instead of `make scrape`):

```sh
#!/bin/bash
# Run the scraper on this Mac only when the cloud routine has not delivered in the last 20 h.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull -q --rebase origin main
if python3 - <<'EOF'
import json, sys
from datetime import datetime, timezone, timedelta
try:
    at = datetime.fromisoformat(json.load(open("data/status.json"))["at"])
    if at.tzinfo is None: at = at.replace(tzinfo=timezone.utc)
    sys.exit(0 if datetime.now(timezone.utc) - at < timedelta(hours=20) else 1)
except Exception:
    sys.exit(1)
EOF
then echo "$(date -Is) primary ran recently, skipping"; exit 0; fi
echo "$(date -Is) primary stale, running fallback"
JAHGENDA_RUNNER=mac make scrape
```

In the plist: `cd "__REPO__" && scripts/scrape_if_stale.sh`, hour 7, minute 10. Keep `make cron-install` as the way to enable it; document that the fallback is **optional** and the watchdog alone gives you visibility.

## 2. Freshness watchdog (GitHub Actions)

`.github/workflows/watchdog.yml`:

```yaml
name: Scraper watchdog

on:
  schedule:
    # 06:17 UTC = 08:17 CEST / 07:17 CET. GitHub cron is UTC only; avoid :00 (high-load, delays).
    - cron: "17 6 * * *"
  workflow_dispatch:

permissions:
  contents: read
  issues: write

concurrency:
  group: watchdog
  cancel-in-progress: false

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - name: Check data freshness and sync the scraper-failed issue
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          MAX_AGE_HOURS: "36"
        run: python3 scripts/check_freshness.py --max-age-hours "$MAX_AGE_HOURS"
```

The job **exits 1 when unhealthy** on purpose: the Actions badge turns red and GitHub sends its normal "workflow run failed" mail to the actor (the person who last touched the workflow file, i.e. you). The issue is the durable, de-duplicated signal; the red run is the loud one.

`scripts/check_freshness.py` (stdlib only; local copy tested at `/private/tmp/claude-501/-Users-markus-dev-reggae/3c38dcbb-88e6-46d2-ab26-8112db31ac28/scratchpad/watchdog/check_freshness.py`):

```python
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
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
    ZURICH = ZoneInfo("Europe/Zurich")
except Exception:  # pragma: no cover
    ZURICH = timezone.utc

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
REPO = os.environ.get("GITHUB_REPOSITORY", "markusbaumg/jahgenda")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
DRY_RUN = os.environ.get("DRY_RUN") == "1"
LABEL = "scraper-failed"
LABEL_COLOR = "d73a4a"
ISSUE_TITLE = "Scraper is not delivering (watchdog)"
MENTION = "@" + REPO.split("/")[0]  # an @-mention always notifies, whatever the watch settings
API = "https://api.github.com"


def load(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (OSError, ValueError) as e:
        return {"__error__": f"{path.name}: {e}"}


def parse_ts(value):
    """ISO 8601 -> aware datetime (UTC). Naive timestamps are taken as UTC. None if unparsable."""
    if not isinstance(value, str) or not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


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
            problems.append(f"data is stale: {hours(age):.1f} h since the last run, limit is {hours(max_age):.0f} h")
        if newest > now + timedelta(hours=2):
            problems.append(f"last timestamp lies in the future ({fmt(newest)}): clock or timezone bug in the scraper")

    if isinstance(status, dict) and "__error__" not in status:
        ok = status.get("ok")
        counts = status.get("counts") or {}
        info.append(
            f"status.json: ok={ok} runner={status.get('runner', '?')} skill={status.get('skill', '?')} "
            f"total={counts.get('total', '?')} +{counts.get('added', 0)} ~{counts.get('updated', 0)} -{counts.get('removed', 0)}"
        )
        if ok is False:
            problems.append(f"last run reported failure: {status.get('error') or status.get('message') or 'no reason given'}")
    else:
        info.append("status.json: missing (scraper skill does not write it yet)")

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
    req = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": "jahgenda-watchdog",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, (json.loads(e.read() or b"null") if e.fp else None)


def open_issue():
    code, issues = gh("GET", f"/repos/{REPO}/issues?labels={LABEL}&state=open&per_page=5")
    if code != 200:
        print(f"WARN cannot list issues: HTTP {code} {issues}")
        return None
    issues = [i for i in issues if "pull_request" not in i]
    return issues[0] if issues else None


def ensure_label():
    code, _ = gh("POST", f"/repos/{REPO}/labels",
                 {"name": LABEL, "color": LABEL_COLOR, "description": "Opened by the freshness watchdog"})
    if code not in (201, 422):  # 422 = already exists
        print(f"WARN cannot create label: HTTP {code}")


def report(healthy, lines, now):
    run_url = ""
    if os.environ.get("GITHUB_SERVER_URL") and os.environ.get("GITHUB_RUN_ID"):
        run_url = f"{os.environ['GITHUB_SERVER_URL']}/{REPO}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
    stamp = now.astimezone(ZURICH).strftime("%Y-%m-%d %H:%M %Z")
    bullets = "\n".join(f"- {l}" for l in lines)
    links = (
        f"\n\nCheck: https://claude.ai/code/routines (last run and its log) · "
        f"https://markusbaumg.github.io/jahgenda/log.html · "
        f"[watchdog run]({run_url})" if run_url else ""
    )
    issue = open_issue()
    if not healthy:
        body = f"{MENTION} the watchdog found the scraper unhealthy at {stamp}:\n\n{bullets}{links}"
        if issue:
            gh("POST", f"/repos/{REPO}/issues/{issue['number']}/comments", {"body": "Still unhealthy. " + body})
            print(f"commented on existing issue #{issue['number']}")
        else:
            ensure_label()
            code, created = gh("POST", f"/repos/{REPO}/issues",
                               {"title": ISSUE_TITLE, "body": body, "labels": [LABEL]})
            print(f"opened issue #{created.get('number')}" if code == 201 else f"WARN cannot open issue: HTTP {code} {created}")
    elif issue:
        gh("POST", f"/repos/{REPO}/issues/{issue['number']}/comments",
           {"body": f"Healthy again at {stamp}:\n\n{bullets}{links}\n\nClosing."})
        gh("PATCH", f"/repos/{REPO}/issues/{issue['number']}", {"state": "closed", "state_reason": "completed"})
        print(f"closed issue #{issue['number']}")
    else:
        print("healthy, no open issue")


def main(argv):
    max_h = 36.0
    if "--max-age-hours" in argv:
        max_h = float(argv[argv.index("--max-age-hours") + 1])
    now = datetime.now(timezone.utc)
    healthy, lines = assess(now, timedelta(hours=max_h))
    print(("HEALTHY" if healthy else "UNHEALTHY") + f" (checked {fmt(now)})")
    for l in lines:
        print("  " + l)
    if DRY_RUN or not TOKEN:
        print("dry run: GitHub not contacted" if DRY_RUN else "no GITHUB_TOKEN: GitHub not contacted")
    else:
        report(healthy, lines, now)
    return 0 if healthy else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
```

Verdict rules: unhealthy if newest of (`status.json.at`, newest `runs[].at`, `shows.json.updated`) is older than 36 h, if `status.json.ok == false`, if a timestamp is in the future (timezone bug), if `shows.json` is live (`source != mock`) with zero shows, or if a data file is unparsable. `source: mock` is reported as info, not as a failure, so the watchdog can go in before the first real run. Try it locally: `DRY_RUN=1 python3 scripts/check_freshness.py`. Add `watchdog` to `make status` for the same output.

## 3. README badges

Workflow badge (goes red when the watchdog fails, i.e. when the scraper is stale/failed):

```markdown
[![Scraper watchdog](https://github.com/markusbaumg/jahgenda/actions/workflows/watchdog.yml/badge.svg?branch=main)](https://github.com/markusbaumg/jahgenda/actions/workflows/watchdog.yml)
```

Optional data badge from the committed `data/status.json`, served by Pages. Two variants, pick one:

- *Dynamic JSON badge* (no extra file; shows the count): `https://img.shields.io/badge/dynamic/json?url=https://markusbaumg.github.io/jahgenda/data/status.json&query=$.counts.total&label=shows&suffix=%20shows&color=1b7f3b`
- *Endpoint badge* (full control of label/colour): have the skill also write `data/badge.json` as `{"schemaVersion":1,"label":"scraper","message":"ok · 41 shows · 13.10. 06:14","color":"brightgreen"}` (red + `"isError":true` on failure), then `https://img.shields.io/endpoint?url=https://markusbaumg.github.io/jahgenda/data/badge.json`.

Both lag by the Pages deploy (about a minute) plus shields' cache (a few minutes). Add `data/` to the Pages upload; it already is (`path: .`).

## 4. Notification options

| Channel | Setup | Pros | Cons |
|---|---|---|---|
| **GitHub issue with @-mention** (built in above) | none | Zero secrets, deduplicated, has history, mentions notify by mail + GitHub mobile app even if "watching" is off | Mail/app only; ~2 h after the missed run |
| **Workflow-failure mail** (built in: exit 1) | none, check GitHub notification settings → Actions | Free second channel | Only to the workflow's actor; noisy if you later make the watchdog "warn only" |
| **Routine's own run status / PushNotification** | ask in the prompt: "end with PushNotification: 'Jahgenda: +3 ~1 -2, 41 shows' or 'Jahgenda FAILED: <why>'" | Immediate, comes from the run itself | Only fires when the run *reaches* that step: a run that never starts (GitHub connection expired, usage limit, routine paused) sends nothing. The routine list's green tick means "session exited without infra error", not "task succeeded". Treat it as nice-to-have, not as the monitor |
| **ntfy.sh** | pick an unguessable topic, add it as a secret (`NTFY_TOPIC`) to the repo; in the watchdog add a step `if: failure()` → `curl -H "Title: Jahgenda scraper" -H "Priority: high" -H "Tags: warning" -d "stale or failed, see issue" https://ntfy.sh/$NTFY_TOPIC`; the skill can post success the same way (needs `ntfy.sh` in the cloud environment's allowed domains) | Real phone push in <1 min, free, no account | Topic name is the password; the free server's reliability is best-effort; one more thing to install |
| **Telegram bot** | create a bot, store `TELEGRAM_TOKEN` + `TELEGRAM_CHAT_ID` as secrets, `curl https://api.telegram.org/bot$TOKEN/sendMessage -d chat_id=$CHAT -d text=...` | Reliable, you already have the app | Bot creation step, token to rotate |
| **healthchecks.io dead-man's switch** (optional belt-and-braces) | the skill pings a check URL at the end of a successful run; healthchecks mails/pushes when the ping is missing | Catches the case where GitHub Actions itself is dead or disabled | External service, secret URL |

Recommendation for the hour: issue + mention + failure mail now (nothing to configure); ntfy later if you want it on the phone immediately.

## 5. What the scraper skill should write

Add `data/status.json` (one object, overwritten on every run — the heartbeat):

```json
{
  "ok": true,
  "skill": "scrape-shows",
  "at": "2026-10-13T06:14:22+02:00",
  "runner": "cloud",
  "duration_s": 812,
  "counts": { "added": 3, "updated": 1, "removed": 2, "total": 41 },
  "failed_sources": 1,
  "error": null,
  "run_url": "https://claude.ai/code/session_…"
}
```

Skill edits (`.claude/skills/scrape-shows/SKILL.md`):

1. **Clock**: step "Today's date" → use `TZ=Europe/Zurich date -Iseconds` for `at` and `updated` (the cloud sandbox runs in UTC; `date -Is` there yields `+00:00`, which is correct but surprising on `log.html`; the point is every timestamp *must* carry an offset).
2. **Step 6**: also write `data/status.json` as above; `runner` from `$JAHGENDA_RUNNER` if set, else `cloud`. Add `"ok": true` to the `runs.json` entry as well (the validator accepts extra keys).
3. **Step 7 (commit)**: add `data/status.json` to `git add`. Change the commit message rule: "Commit even if no show changed; the message is then `Scraper run: no changes (41 total)`" — the heartbeat must move every day.
4. **New step 7b, on failure** (validator cannot be made to pass, a source budget blown, anything that stops the run): `git checkout -- data/shows.json data/artists.json data/venues.json scraper/bands.md` (revert data), then write `status.json` with `"ok": false, "error": "<one line>"` and prepend a `runs.json` entry with `"ok": false`, `added/updated/removed 0`, `total` = current count, `notes: ["Lauf abgebrochen: …"]`; run the validator (it passes now, data untouched) and commit `Scraper run failed: <why>`. Never leave the repo without a commit.
5. **Step 8**: finish with `PushNotification` (one line, counts or the error).
6. Validator: add a tiny `check_status()` (ok bool, at parseable, counts ints) so a broken heartbeat is caught too; ~10 lines in `scripts/validate_shows.py`, plus one test.

Also commit `data/status.json` once by hand (`ok: true`, today's `at`, `runner: manual`) so the watchdog has something to read before the first routine run, and add the file to `format_data.py`'s canonical list if you want stable key order.

## 6. log.html: last-run banner

Insert after the `.notice` paragraph a `<p id="health" class="status"></p>` and extend the script: fetch `data/status.json` first, render it, then the runs list as today.

```js
const rel = new Intl.RelativeTimeFormat("de-CH", { numeric: "auto" });
fetch("data/status.json", { cache: "no-cache" })
  .then((r) => (r.ok ? r.json() : null))
  .then((s) => {
    const el = document.getElementById("health");
    if (!s || !s.at) { el.textContent = "Kein Status vorhanden."; return; }
    const at = new Date(s.at);
    const h = Math.round((at - Date.now()) / 36e5);
    const stale = -h > 36;
    const who = s.runner === "mac" ? " (Fallback vom Mac)" : "";
    const c = s.counts || {};
    el.className = "status " + (s.ok === false || stale ? "warn" : "ok");
    el.innerHTML =
      `<strong>Letzter Lauf:</strong> ${fmt.format(at)} (${rel.format(h, "hour")})${who} – ` +
      (s.ok === false
        ? `<strong>fehlgeschlagen:</strong> ${escape(s.error || "kein Grund angegeben")}`
        : `ok, ${c.total ?? "?"} Shows (+${c.added ?? 0} ~${c.updated ?? 0} −${c.removed ?? 0})`) +
      (stale ? " – <strong>seit über 36 h kein Lauf</strong>" : "");
  })
  .catch(() => {});
```

Add `.status.ok { color: var(--green-text) } .status.warn { color: var(--red) }` to the inline style. In the runs list, show a red "fehlgeschlagen" chip when `r.ok === false`. Because the banner computes staleness client-side, `log.html` tells the truth even if the watchdog itself is down.

## 7. Pitfalls and how they are avoided

- **Timezones**: GitHub cron is UTC; 06:17 UTC is 08:17 in summer and 07:17 in winter, both fine. Routines are set in your local zone and converted. The cloud sandbox clock is UTC: always write offset-aware ISO timestamps; the watchdog treats a naive timestamp as UTC and flags future timestamps (a classic DST/offset bug).
- **Routine runs but commits nothing**: today's skill only commits on success and only when there is something to commit, so "ran, found nothing" and "never ran" look identical. The heartbeat commit (§5, steps 3–4) removes that ambiguity; "no changes" is still a commit. A green run in the routine list is not evidence of success; the repo is.
- **Routine silently stops**: expired GitHub connection → runs are skipped for 72 h, then the routine turns itself off; subscription usage limit → runs rejected; subscription paused → routines on hold. None of these produce a commit, so the watchdog catches all of them after 36 h. Reconnect at claude.ai/connect-github, then flip the routine back on.
- **Concurrent pushes**: only the scraper writes to `main`; the watchdog has `contents: read`. Cloud and Mac cannot overlap because the Mac only runs when `status.json` is >20 h old. The skill already does one `pull --rebase` on reject. `pages.yml` has `concurrency: pages` with cancel-in-progress, so two quick deploys collapse into the latest one.
- **Holidays / quiet weeks**: freshness is about the heartbeat, not about new shows, so a week with zero new concerts is healthy. If you pause the routine on purpose, also disable the watchdog (Actions → workflow → Disable) or expect one issue that closes itself on the next run.
- **Late or dropped scheduled runs**: both GitHub cron and routines are best-effort; GitHub says runs at the top of the hour can be delayed or dropped under load. 36 h tolerance and off-the-hour minutes (`:07`, `:17`) absorb this.
- **Watchdog disabled after 60 days without repo activity** (public repos): a daily heartbeat commit keeps the repo active, so this only bites if the scraper has been dead for 60 days, by which time the issue has been open for 58 of them. If you want a monitor that survives even that, add the healthchecks.io ping.
- **Notifications you never see**: mentions and failure mails depend on your GitHub notification settings (Settings → Notifications → "Actions: failed workflows only" and email for participating). Check once, then forget.
- **Label missing**: the script creates `scraper-failed` on first use (422 = exists is ignored); `GITHUB_TOKEN` with `issues: write` is enough.
- **Validator vs failure commit**: the failed-run commit reverts data files first, so `validate_shows.py` keeps passing and `pages.yml` deploys the old, good data with the new status.

## Order of work (about an hour)

1. Commit `scripts/check_freshness.py`, `.github/workflows/watchdog.yml`, a hand-written `data/status.json` (10 min). Run the workflow once via `workflow_dispatch`, confirm "healthy, no open issue".
2. Edit `SKILL.md` steps 6, 7, 7b, 8 and add `status.json` to `format_data.py`/validator (20 min).
3. `log.html` banner + README badges (15 min).
4. `scripts/scrape_if_stale.sh` + plist change; re-run `make cron-install` only if you want the fallback (10 min).
5. Optional: `NTFY_TOPIC` secret + `if: failure()` step in the watchdog; allow `ntfy.sh` in the routine's environment (5 min).

Sources: [Claude Code routines docs](https://code.claude.com/docs/en/routines), [GitHub Actions: events that trigger workflows (schedule)](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows), [shields.io endpoint badge](https://shields.io/badges/endpoint-badge), [ntfy publishing docs](https://docs.ntfy.sh/publish/), [keepalive for 60-day cron suspension](https://dev.to/gautamkrishnar/how-to-prevent-github-from-suspending-your-cronjob-based-triggers-knf), [GitHub community: scheduled workflow delays](https://github.com/orgs/community/discussions/185355).
