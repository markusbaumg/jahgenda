"""Tests for scripts/check_freshness.py: assess() is the only thing that pages the owner. Run: make test"""

import contextlib
import io
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from _scripts import load_script

ROOT = Path(__file__).resolve().parent.parent


C = load_script("check_freshness")

NOW = datetime(2026, 10, 13, 8, 17, tzinfo=timezone.utc)
MAX_AGE = timedelta(hours=36)


def iso(dt):
    return dt.isoformat().replace("+00:00", "Z")


class Assess(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._data = C.DATA
        C.DATA = Path(self.tmp.name)

    def tearDown(self):
        C.DATA = self._data
        self.tmp.cleanup()

    def write(self, name, obj):
        text = obj if isinstance(obj, str) else json.dumps(obj)
        (C.DATA / name).write_text(text, encoding="utf-8")

    def status(self, hours_ago=2, **over):
        base = {
            "ok": True,
            "skill": "scrape-shows",
            "at": iso(NOW - timedelta(hours=hours_ago)),
            "runner": "cloud",
            "counts": {"added": 1, "updated": 0, "removed": 0, "total": 41},
            "failed_sources": 0,
            "error": None,
        }
        base.update(over)
        return base

    def shows(self, n=3, source="scraper", hours_ago=2):
        return {"updated": iso(NOW - timedelta(hours=hours_ago)), "source": source, "shows": [{}] * n}

    def assess(self):
        return C.assess(NOW, MAX_AGE)

    def problems(self):
        healthy, lines = self.assess()
        return healthy, [line for line in lines if not line.startswith(("last sign of life", "status.json:"))]

    def test_healthy_when_the_heartbeat_is_two_hours_old(self):
        self.write("status.json", self.status())
        self.write("shows.json", self.shows())
        healthy, lines = self.assess()
        self.assertTrue(healthy, lines)
        self.assertTrue(any("2.0 h ago, from status.json at" in line for line in lines), lines)

    def test_stale_after_max_age(self):
        self.write("status.json", self.status(hours_ago=37))
        self.write("shows.json", self.shows(hours_ago=37))
        healthy, lines = self.assess()
        self.assertFalse(healthy)
        self.assertTrue(any(line.startswith("data is stale: 37.0 h") for line in lines), lines)

    def test_timestamp_in_the_future_is_a_clock_bug(self):
        self.write("status.json", self.status(hours_ago=-3))
        healthy, lines = self.assess()
        self.assertFalse(healthy)
        self.assertTrue(any("lies in the future" in line for line in lines), lines)

    def test_failed_run_reports_its_error(self):
        self.write("status.json", self.status(ok=False, error="WebFetch ENOTFOUND"))
        healthy, lines = self.assess()
        self.assertFalse(healthy)
        self.assertIn("last run reported failure: WebFetch ENOTFOUND", lines)
        self.write("status.json", self.status(ok=False, error=None))
        self.assertIn("last run reported failure: no reason given", self.assess()[1])

    def test_failed_run_still_tells_how_old_the_data_is(self):
        self.write("status.json", self.status(ok=False, error="no network"))
        self.write("shows.json", self.shows(hours_ago=3))
        lines = self.assess()[1]
        self.assertTrue(
            any(
                line.startswith("agenda data itself:") and "3.0 h ago) — still fresh" in line
                for line in lines
            ),
            lines,
        )
        self.write("shows.json", self.shows(hours_ago=40))
        self.assertTrue(any("40.0 h ago) — also stale" in line for line in self.assess()[1]))

    def test_zero_shows_is_fine_for_mock_data_but_not_for_the_scraper(self):
        self.write("status.json", self.status())
        self.write("shows.json", self.shows(n=0, source="mock"))
        healthy, lines = self.assess()
        self.assertTrue(healthy, lines)
        self.assertTrue(any("still mock data" in line for line in lines), lines)
        self.write("shows.json", self.shows(n=0, source="scraper"))
        healthy, lines = self.assess()
        self.assertFalse(healthy)
        self.assertIn("shows.json contains zero shows", lines)

    def test_newest_of_the_three_timestamps_counts(self):
        self.write("status.json", self.status(hours_ago=50))
        self.write("runs.json", {"runs": [{"at": iso(NOW - timedelta(hours=40))}, {"at": "garbage"}]})
        self.write("shows.json", {**self.shows(), "updated": iso(NOW - timedelta(hours=1))})
        healthy, lines = self.assess()
        self.assertTrue(healthy, lines)
        self.assertTrue(any("1.0 h ago, from shows.json updated" in line for line in lines), lines)

    def harvest(self, hours_ago=2):
        return {"skill": "harvest-bands", "at": iso(NOW - timedelta(hours=hours_ago)), "added": 3, "total": 9}

    def scrape_run(self, hours_ago, **over):
        return {
            "skill": "scrape-shows",
            "at": iso(NOW - timedelta(hours=hours_ago)),
            "runner": "cloud",
            **over,
        }

    def test_a_fresh_harvest_run_does_not_hide_a_stale_scraper(self):
        """Review #50: harvest-bands overwrites status.json with ok:true and logs a run; neither is a sign
        of life of the daily scraper."""
        self.write("status.json", {**self.status(), **self.harvest(), "counts": {"added": 3}})
        self.write("runs.json", {"runs": [self.harvest(), self.scrape_run(120)]})
        self.write("shows.json", self.shows(hours_ago=120))
        healthy, lines = self.assess()
        self.assertFalse(healthy, lines)
        self.assertTrue(any(line.startswith("data is stale: 120.0 h") for line in lines), lines)

    def test_a_manual_correction_is_no_sign_of_life_either(self):
        self.write("runs.json", {"runs": [self.scrape_run(1, runner="manual"), self.scrape_run(40)]})
        self.write("shows.json", self.shows(hours_ago=40))
        healthy, lines = self.assess()
        self.assertFalse(healthy, lines)
        self.assertTrue(any("from runs.json newest scrape-shows at" in line for line in lines), lines)

    def test_a_failed_scrape_stays_red_after_harvest_overwrites_status(self):
        self.write("status.json", {**self.status(), **self.harvest(hours_ago=1), "counts": {"added": 3}})
        self.write(
            "runs.json",
            {"runs": [self.harvest(hours_ago=1), self.scrape_run(2, ok=False, error="ENOTFOUND")]},
        )
        self.write("shows.json", self.shows(hours_ago=20))
        healthy, lines = self.assess()
        self.assertFalse(healthy, lines)
        self.assertIn("last run reported failure: ENOTFOUND", lines)
        # the next good scrape-shows run clears it
        self.write(
            "runs.json",
            {"runs": [self.scrape_run(0.5), self.harvest(hours_ago=1), self.scrape_run(2, ok=False)]},
        )
        self.assertTrue(self.assess()[0])

    def test_status_failure_wins_over_an_older_ok_run(self):
        self.write("status.json", self.status(hours_ago=1, ok=False, error="no network"))
        self.write("runs.json", {"runs": [self.scrape_run(25)]})
        self.assertIn("last run reported failure: no network", self.assess()[1])

    def test_malformed_counts_do_not_crash(self):
        for counts in ([], "3 added", 7, None):
            self.write("status.json", self.status(counts=counts))
            self.write("shows.json", self.shows())
            healthy, lines = self.assess()
            self.assertTrue(healthy, (counts, lines))
            self.assertTrue(any("total=? +0 ~0 -0" in line for line in lines), (counts, lines))

    def test_unreadable_json_is_a_problem_not_a_traceback(self):
        self.write("status.json", "{not json")
        self.write("shows.json", self.shows())
        healthy, lines = self.assess()
        self.assertFalse(healthy)
        self.assertTrue(any(line.startswith("unreadable file: status.json") for line in lines), lines)

    def test_no_files_at_all(self):
        healthy, lines = self.assess()
        self.assertFalse(healthy)
        self.assertIn("no timestamp found in data/status.json, data/runs.json or data/shows.json", lines)
        self.assertIn("status.json: missing (no run has written the heartbeat yet)", lines)

    def test_main_rejects_a_flag_without_a_value(self):
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(C.main(["--max-age-hours"]), 2)
            self.assertEqual(C.main(["--max-age-hours", "soon"]), 2)


class ParseTs(unittest.TestCase):
    def test_offset_z_and_naive_all_become_utc(self):
        utc = datetime(2026, 10, 13, 6, 0, tzinfo=timezone.utc)
        self.assertEqual(C.parse_ts("2026-10-13T08:00:00+02:00"), utc)
        self.assertEqual(C.parse_ts("2026-10-13T06:00:00Z"), utc)
        naive = C.parse_ts("2026-10-13T06:00:00")
        self.assertEqual(naive, utc)
        self.assertEqual(naive.tzinfo, timezone.utc)

    def test_garbage_is_none(self):
        for value in (None, "", "yesterday", 1760336062, "2026-13-40T00:00:00Z"):
            self.assertIsNone(C.parse_ts(value), value)


if __name__ == "__main__":
    unittest.main()
