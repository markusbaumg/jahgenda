"""Festivals (design/festival-spec.md): a show with `end_date` (+ optional `days`) is one range entry.
Pins the validator rules 2–9, the field order of the formatter and the multi-day feed event.
Run: make test"""

import contextlib
import importlib.util
import io
import json
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


V = load_module("validate_shows")
F = load_module("format_data")
M = load_module("make_ics")

ALLOWED = {"reggae", "dub", "dancehall", "ska", "festival"}
TODAY = date.today()


def iso(days_from_today):
    return (TODAY + timedelta(days=days_from_today)).isoformat()


START, MID, END = iso(10), iso(11), iso(12)
ACTS = [
    "Alborosie",
    "Dub Inc",
    "Gentleman",
    "Protoje",
    "Mellow Mood",
    "Phenomden",
    "Dubblestandart",
    "Jahcoustix",
    "Elijah",
    "Open Season",
    "Iration",
    "Jah Prayzah",
]


def reeds(**over):
    """The spec's example (festival-spec.md §1.2), dated relative to today so it is never past."""
    base = {
        "id": f"{START}-reeds-festival-pfaeffikon",
        "date": START,
        "end_date": END,
        "title": "Reeds Festival 2027",
        "acts": list(ACTS),
        "days": {
            START: ["Dub Inc", "Mellow Mood", "Phenomden", "Jahcoustix"],
            MID: ["Alborosie", "Protoje", "Dubblestandart"],
            END: ["Gentleman", "Elijah", "Open Season"],
        },
        "venue": "Seequai Pfäffikon",
        "city": "Pfäffikon ZH",
        "canton": "ZH",
        "url": "https://www.reeds-festival.ch/",
        "source_url": "https://www.reeds-festival.ch/line-up",
        "lat": 47.3604,
        "lon": 8.7861,
        "genres": ["festival", "reggae", "dub", "dancehall"],
    }
    base.update(over)
    for key in [k for k, v in base.items() if v is None]:
        del base[key]
    return base


def running(**over):
    """A festival that started yesterday and ends tomorrow."""
    base = dict(id=f"{iso(-1)}-reeds-festival-pfaeffikon", date=iso(-1), end_date=iso(1), days=None)
    base.update(over)
    return reeds(**base)


def show(**over):
    base = {
        "id": f"{MID}-afterparty-pfaeffikon",
        "date": MID,
        "time": "23:00",
        "title": "Reeds Afterparty",
        "venue": "Seequai Pfäffikon",
        "city": "Pfäffikon ZH",
        "canton": "ZH",
        "source_url": "https://x.ch/p",
        "genres": ["reggae"],
    }
    base.update(over)
    return base


def doc(*items, source="scraper"):
    return {"updated": "2026-10-13T06:00:00+02:00", "source": source, "shows": list(items)}


class RangeEntries(unittest.TestCase):
    def errs(self, d, allow_past=False):
        return V.check_shows(d, allow_past, ALLOWED)

    def has(self, d, fragment):
        errs = self.errs(d)
        self.assertTrue(any(fragment in e for e in errs), f"expected {fragment!r} in {errs}")

    def test_spec_example_passes_with_four_genres(self):
        self.assertEqual(self.errs(doc(reeds())), [])
        early = reeds(acts=[], days=None, genres=["festival", "reggae"])  # early in the season
        self.assertEqual(self.errs(doc(early)), [])

    def test_end_date_shape_and_range(self):
        self.has(doc(reeds(end_date="18.7.2027")), "end_date must be YYYY-MM-DD")
        self.has(doc(reeds(end_date=START, days=None)), "end_date must be after date")
        self.has(doc(reeds(end_date=iso(9), days=None)), "end_date must be after date")
        self.has(doc(reeds(end_date=iso(25), days=None)), "more than 14 days")
        self.assertEqual(self.errs(doc(reeds(end_date=iso(24), days=None))), [])

    def test_running_festival_is_not_past_but_a_finished_one_is(self):
        self.assertEqual(self.errs(doc(running())), [])
        over = reeds(id=f"{iso(-3)}-reeds-festival-pfaeffikon", date=iso(-3), end_date=iso(-1), days=None)
        self.has(doc(over), f"date {iso(-1)} is in the past")
        self.assertEqual(self.errs(doc(over), allow_past=True), [])

    def test_days_need_end_date_and_valid_keys_and_values(self):
        self.has(doc(reeds(end_date=None, genres=["reggae"])), "'days' needs 'end_date'")
        self.has(doc(reeds(days={"Freitag": ["Dub Inc"]})), "days key 'Freitag' must be YYYY-MM-DD")
        self.has(doc(reeds(days={iso(20): ["Dub Inc"]})), f"days key '{iso(20)}' lies outside")
        self.has(doc(reeds(days={START: []})), "must be a non-empty list of acts")
        self.has(doc(reeds(days={START: ["Dub Inc", ""]})), "has an empty act name")
        self.has(doc(reeds(days={START: ["Dub Inc", "DUB INC."]})), "listed twice on")
        # the same act on two days is fine (resident sound at a weekender)
        self.assertEqual(self.errs(doc(reeds(days={START: ["Dub Inc"], MID: ["Dub Inc"]}))), [])

    def test_days_acts_must_be_in_acts_with_a_hint(self):
        self.assertEqual(self.errs(doc(reeds(days={START: ["DUB INC."]}))), [])  # artist_key tolerant
        self.has(doc(reeds(days={START: ["Dub Incorporated"]})), "did you mean 'Dub Inc'?")
        self.has(doc(reeds(days={START: ["Dub Inc", "Vibronics"]})), "days act 'Vibronics' is not in acts")

    def test_acts_near_duplicates_and_cap(self):
        self.has(doc(show(acts=["Dub Inc", "DUB INC."])), "near-duplicate of 'Dub Inc'")
        self.has(doc(reeds(acts=[f"Act {i}" for i in range(41)], days=None)), "more than 40 acts")
        self.assertEqual(self.errs(doc(reeds(acts=[f"Act {i}" for i in range(40)], days=None))), [])

    def test_genres_festival_required_and_limits(self):
        self.has(doc(reeds(genres=["reggae", "dub"])), "must carry the genre 'festival'")
        self.has(doc(reeds(genres=["festival", "reggae", "dub", "dancehall", "ska"])), "at most 4 genres")
        self.has(doc(show(genres=["reggae", "dub", "dancehall", "ska"])), "at most 3 genres")
        # a one-day open air keeps `festival` without end_date
        self.assertEqual(self.errs(doc(show(genres=["festival", "reggae"]))), [])

    def test_duplicate_festival_in_one_year(self):
        other = reeds(id=f"{MID}-reeds-pfaeffikon", date=MID, title="REEDS FESTIVAL 2027", days=None)
        self.has(doc(reeds(), other), "duplicate festival — same as")
        # next year's edition is a different festival
        far = iso(380)
        nxt = reeds(id=f"{far}-reeds-festival-pfaeffikon", date=far, end_date=iso(382), days=None)
        self.assertEqual(self.errs(doc(reeds(), nxt)), [])

    def test_day_entry_inside_a_range_at_the_same_venue_is_rejected(self):
        self.has(doc(reeds(), show(venue="SEEQUAI PFÄFFIKON")), "lies inside the range of")
        # an afterparty in another club is a normal show; so is a show at the venue before the festival
        self.assertEqual(self.errs(doc(reeds(), show(venue="Kraftfeld"))), [])
        self.assertEqual(self.errs(doc(reeds(), show(id=f"{iso(9)}-x-pfaeffikon", date=iso(9), time=""))), [])

    def test_repo_data_has_the_dubquake_weekender_as_one_range_entry(self):
        data = json.loads((ROOT / "data" / "shows.json").read_text(encoding="utf-8"))
        ranges = [s for s in data["shows"] if s.get("end_date")]
        self.assertTrue(ranges, "no range entry in data/shows.json")
        for s in ranges:
            self.assertIn("festival", s["genres"])
            self.assertTrue(all(a in s["acts"] for d in s.get("days", {}).values() for a in d))


class Formatter(unittest.TestCase):
    def test_end_date_and_days_sit_next_to_date_and_acts(self):
        out = json.loads(F.format_shows(doc(reeds())))["shows"][0]
        keys = list(out)
        self.assertEqual(keys[:3], ["id", "date", "end_date"])
        self.assertEqual(keys.index("days"), keys.index("acts") + 1)


class Feed(unittest.TestCase):
    STAMP = "20261013T060000Z"

    def test_festival_is_one_all_day_event_over_the_whole_range(self):
        s = reeds(date="2027-07-16", end_date="2027-07-18", time="18:00", days=None, acts=["Dub Inc"])
        lines = M.vevent(s, self.STAMP)
        self.assertIn("DTSTART;VALUE=DATE:20270716", lines)
        self.assertIn("DTEND;VALUE=DATE:20270719", lines)  # exclusive: last day + 1
        self.assertFalse(any("TZID=" in x for x in lines), "time is ignored for a range entry")
        self.assertIn("SUMMARY:Reeds Festival 2027", lines)  # the line-up goes into the description
        desc = next(x for x in lines if x.startswith("DESCRIPTION:"))
        self.assertIn("Dub Inc", desc)

    def test_lineup_by_day_then_open_acts(self):
        s = reeds(
            date="2027-07-16",
            end_date="2027-07-18",
            acts=["Alborosie", "Dub Inc", "Iration"],
            days={"2027-07-17": ["Alborosie"], "2027-07-16": ["Dub Inc"]},
        )
        self.assertEqual(M.lineup(s), ["Fr 16.7.: Dub Inc", "Sa 17.7.: Alborosie", "Tag offen: Iration"])
        self.assertEqual(M.lineup(reeds(acts=[], days=None)), [])

    def test_running_festival_stays_in_the_feed(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp) / "shows.json"
            data.write_text(json.dumps({"shows": [running()]}), encoding="utf-8")
            M.SHOWS = data
            out = Path(tmp) / "out"
            out.mkdir()
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(M.main([str(out)]), 0)
            self.assertIn("reeds-festival", (out / "jahgenda.ics").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
