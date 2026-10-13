"""What the GitHub-facing scripts share: the repo, the token, the dry-run switch, one timestamp parser and
one thin GitHub REST call. Stdlib only. Imported by check_freshness.py and quality_review.py, which both run
as `python3 scripts/<name>.py` (so this directory is on sys.path); the tests add it themselves.
"""

import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone

REPO = os.environ.get("GITHUB_REPOSITORY", "markusbaumg/jahgenda")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
DRY_RUN = os.environ.get("DRY_RUN") == "1"
SITE = "https://markusbaumg.github.io/jahgenda/"
API = "https://api.github.com"


def parse_ts(value):
    """ISO 8601 -> aware datetime in UTC. Naive timestamps are taken as UTC. None if unparsable."""
    if not isinstance(value, str) or not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def gh(method, path, body=None, agent="jahgenda"):
    """One GitHub REST call -> (status, parsed body). An HTTP error is returned, never raised, so a caller
    can print what went wrong and go on (a watchdog must not die on a 403 and open a duplicate later)."""
    req = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": agent,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, (json.loads(e.read() or b"null") if e.fp else None)
