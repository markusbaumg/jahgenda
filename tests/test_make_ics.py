"""Tests for scripts/make_ics.py: the subscribable feeds are a public contract (Apple/Google/Outlook
parse them), so folding, escaping and the timed/all-day shapes are pinned here. Run: make test"""

import contextlib
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "make_ics", Path(__file__).resolve().parent.parent / "scripts" / "make_ics.py"
)
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)

STAMP = "20261013T060000Z"


def show(**over):
    base = {
        "id": "2026-10-16-dub-collective-bern",
        "date": "2026-10-16",
        "time": "20:30",
        "title": "Dub Collective",
        "acts": ["Dub Collective", "Selecta Iray"],
        "venue": "Dachstock",
        "city": "Bern",
        "canton": "BE",
        "url": "https://dachstock.ch/x",
        "tickets": "https://petzi.ch/t",
        "lat": 46.95,
        "lon": 7.44,
        "genres": ["dub", "reggae"],
    }
    base.update(over)
    return base


class Helpers(unittest.TestCase):
    def test_escape_follows_rfc_5545(self):
        self.assertEqual(M.esc("a, b; c\\d\nnew"), "a\\, b\\; c\\\\d\\nnew")

    def test_fold_keeps_lines_under_76_octets_and_never_splits_utf8(self):
        line = "SUMMARY:" + "ü" * 60  # 2 octets each → must fold inside, never between the two bytes
        folded = M.fold(line)
        for part in folded.split("\r\n"):
            self.assertLessEqual(len(part.encode("utf-8")), 76)
            part.encode("utf-8").decode("utf-8")  # every piece is valid UTF-8 on its own
        self.assertEqual(folded.replace("\r\n ", ""), line)
        self.assertEqual(M.fold("short"), "short")


class Events(unittest.TestCase):
    def test_timed_show_has_zurich_tz_and_three_hour_block(self):
        lines = M.vevent(show(), STAMP)
        self.assertIn("UID:2026-10-16-dub-collective-bern@jahgenda", lines)
        self.assertIn("DTSTART;TZID=Europe/Zurich:20261016T203000", lines)
        self.assertIn("DTEND;TZID=Europe/Zurich:20261016T233000", lines)
        self.assertIn("SUMMARY:Dub Collective (Dub Collective · Selecta Iray)", lines)
        self.assertIn("LOCATION:Dachstock\\, Bern", lines)
        self.assertIn("GEO:46.95;7.44", lines)
        self.assertIn("CATEGORIES:dub\\,reggae", lines)
        desc = next(x for x in lines if x.startswith("DESCRIPTION:"))
        self.assertIn("https://dachstock.ch/x\\nTickets: https://petzi.ch/t\\n", desc)
        self.assertTrue(desc.endswith("#2026-10-16-dub-collective-bern"))

    def test_show_without_time_is_an_all_day_event(self):
        lines = M.vevent(show(time="", acts=[]), STAMP)
        self.assertIn("DTSTART;VALUE=DATE:20261016", lines)
        self.assertIn("DTEND;VALUE=DATE:20261017", lines)
        self.assertIn("SUMMARY:Dub Collective", lines)  # no acts → no bracket

    def test_calendar_envelope(self):
        cal = M.calendar("Jahgenda – BE", [show()], STAMP)
        self.assertTrue(cal.startswith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"))
        self.assertIn("X-WR-CALNAME:Jahgenda – BE\r\n", cal)
        self.assertIn("BEGIN:VTIMEZONE\r\nTZID:Europe/Zurich\r\n", cal)
        self.assertTrue(cal.endswith("END:VEVENT\r\nEND:VCALENDAR\r\n"))
        self.assertNotIn("\n\n", cal)


class Build(unittest.TestCase):
    def test_main_writes_one_feed_per_region_with_upcoming_shows_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp) / "shows.json"
            data.write_text(
                json.dumps(
                    {
                        "shows": [
                            show(),
                            show(id="2099-01-01-x-zurich", date="2099-01-01", canton="ZH", city="Zürich"),
                            show(id="2000-01-01-old-bern", date="2000-01-01"),
                        ]
                    }
                ),
                encoding="utf-8",
            )
            M.SHOWS = data
            out = Path(tmp) / "out"
            out.mkdir()
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(M.main([str(out)]), 0)
            names = sorted(p.name for p in out.iterdir())
            self.assertEqual(names, ["jahgenda-BE.ics", "jahgenda-ZH.ics", "jahgenda.ics"])
            self.assertNotIn("old-bern", (out / "jahgenda.ics").read_text(encoding="utf-8"))
            self.assertIn("x-zurich", (out / "jahgenda-ZH.ics").read_text(encoding="utf-8"))
            self.assertNotIn("x-zurich", (out / "jahgenda-BE.ics").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
