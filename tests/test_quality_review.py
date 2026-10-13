"""Tests for scripts/quality_review.py: the weekly issue must not list the same dropped candidate twice
when several runs dropped it. Run: make test"""

import importlib.util
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))  # for the shared ghapi.py
SPEC = importlib.util.spec_from_file_location(
    "quality_review", Path(__file__).resolve().parent.parent / "scripts" / "quality_review.py"
)
Q = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(Q)

T1 = datetime(2026, 10, 13, 0, 38, tzinfo=timezone.utc)
T2 = datetime(2026, 10, 13, 1, 47, tzinfo=timezone.utc)


class DropKey(unittest.TestCase):
    def test_structured_and_prose_entries_share_a_key(self):
        a = {"title": "Sean Koch – Europe 2026", "date": "2026-10-18", "venue": "Bierhübeli", "city": "Bern"}
        b = {"title": "Sean Koch @ Bierhübeli Bern 18.10."}
        self.assertEqual(Q.drop_key(a), Q.drop_key(b))
        self.assertEqual(Q.drop_key(a), ("sean koch", "18.10"))

    def test_same_title_different_day_stays_apart(self):
        a = {"title": "10 Years DMB Records: Skaboom", "date": "2026-11-13"}
        b = {"title": "10 Years DMB Records: Fluffy Machine @ Burgdorf 14.11."}
        self.assertNotEqual(Q.drop_key(a), Q.drop_key(b))

    def test_dedupe_keeps_the_most_complete_entry_and_counts_runs(self):
        prose = {"title": "Dub Inc @ Bierhübeli Bern 18.03.2027", "why": "abgesagt"}
        full = {
            "title": "Dub Inc",
            "date": "2027-03-18",
            "venue": "Bierhübeli",
            "city": "Bern",
            "url": "https://x",
            "why": "Abgesagt",
        }
        other = {"title": "Santrofi", "date": "2026-10-30", "venue": "Kuppel", "city": "Basel"}
        out = Q.dedupe([(T1, prose, {}), (T2, full, {}), (T2, other, {})])
        self.assertEqual(len(out), 2)
        self.assertEqual(out[0][1]["venue"], "Bierhübeli")
        self.assertEqual(out[0][1]["runs"], 2)
        self.assertEqual(out[1][1]["runs"], 1)
        body = Q.body_for(out, 7)
        self.assertIn("(in 2 Läufen)", body)
        self.assertEqual(body.count("Dub Inc"), 1)


if __name__ == "__main__":
    unittest.main()
