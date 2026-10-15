"""Tests for scripts/validate_shows.py and scripts/format_data.py. Run: make test"""

import contextlib
import copy
import io
import json
import unittest
from datetime import date, timedelta
from pathlib import Path

from _scripts import load_script

ROOT = Path(__file__).resolve().parent.parent


V = load_script("validate_shows")
F = load_script("format_data")

TOMORROW = (date.today() + timedelta(days=1)).isoformat()
YESTERDAY = (date.today() - timedelta(days=1)).isoformat()
ALLOWED = {"reggae", "dub", "ska", "roots"}


def show(**over):
    base = {
        "id": f"{TOMORROW}-dub-inc-bern",
        "date": TOMORROW,
        "time": "20:30",
        "title": "Dub Inc",
        "venue": "Dachstock",
        "city": "Bern",
        "canton": "BE",
        "url": "https://x.ch/e",
        "source_url": "https://x.ch/programm",
        "lat": 46.95,
        "lon": 7.44,
        "genres": ["reggae", "dub"],
    }
    base.update(over)
    return base


def shows_doc(*items, source="scraper"):
    return {"updated": "2026-10-13T06:00:00+02:00", "source": source, "shows": list(items)}


class ShowChecks(unittest.TestCase):
    def errs(self, doc, allow_past=False):
        return V.check_shows(doc, allow_past, ALLOWED)

    def test_valid_show_passes(self):
        self.assertEqual(self.errs(shows_doc(show())), [])

    def test_required_fields(self):
        s = show()
        del s["venue"]
        self.assertTrue(any("missing 'venue'" in e for e in self.errs(shows_doc(s))))

    def test_unknown_field_rejected(self):
        self.assertTrue(any("unknown field" in e for e in self.errs(shows_doc(show(foo=1)))))

    def test_past_show_rejected_for_scraper_but_not_mock(self):
        s = show(date=YESTERDAY, id=f"{YESTERDAY}-dub-inc-bern")
        self.assertTrue(any("in the past" in e for e in self.errs(shows_doc(s))))
        self.assertEqual(self.errs(shows_doc(s, source="mock")), [])
        self.assertEqual(self.errs(shows_doc(s), allow_past=True), [])

    def test_scraper_needs_source_url(self):
        s = show()
        del s["source_url"]
        self.assertTrue(any("source_url" in e for e in self.errs(shows_doc(s))))
        self.assertEqual(self.errs(shows_doc(s, source="mock")), [])

    def test_id_must_match_date(self):
        s = show(id="2020-01-01-dub-inc-bern")
        self.assertTrue(any("start with the show's date" in e for e in self.errs(shows_doc(s))))

    def test_canton_and_abroad_codes(self):
        self.assertTrue(any("unknown canton" in e for e in self.errs(shows_doc(show(canton="XX")))))
        self.assertEqual(self.errs(shows_doc(show(canton="D", city="Konstanz", lat=47.66, lon=9.17))), [])

    def test_coordinates_must_be_in_region_and_paired(self):
        self.assertTrue(any("outside" in e for e in self.errs(shows_doc(show(lat=52.5, lon=13.4)))))
        s = show()
        del s["lon"]
        self.assertTrue(any("both" in e for e in self.errs(shows_doc(s))))

    def test_genres_from_allowed_list_max_three_no_duplicates(self):
        self.assertTrue(
            any("not in data/genres.json" in e for e in self.errs(shows_doc(show(genres=["jazz"]))))
        )
        self.assertTrue(
            any(
                "at most 3" in e for e in self.errs(shows_doc(show(genres=["reggae", "dub", "ska", "roots"])))
            )
        )
        self.assertTrue(
            any("duplicate genre" in e for e in self.errs(shows_doc(show(genres=["dub", "dub"]))))
        )
        self.assertTrue(
            any("must be a lowercase slug" in e for e in self.errs(shows_doc(show(genres=["Dub Techno"]))))
        )

    def test_duplicate_id_and_same_slot(self):
        a, b = show(), show(id=f"{TOMORROW}-dub-inc-support-bern", title="Dub Inc + Support")
        errs = self.errs(shows_doc(a, copy.deepcopy(a)))
        self.assertTrue(any("duplicate id" in e for e in errs))
        errs = self.errs(shows_doc(a, b))
        self.assertTrue(any("same date, venue and time" in e for e in errs))
        # two events in one venue on one night with different times are fine
        self.assertEqual(
            self.errs(shows_doc(a, show(id=f"{TOMORROW}-afterparty-bern", time="23:00", title="Afterparty"))),
            [],
        )

    def test_tickets_url(self):
        self.assertEqual(self.errs(shows_doc(show(tickets="https://petzi.ch/e/1"))), [])
        self.assertTrue(
            any("tickets must start" in e for e in self.errs(shows_doc(show(tickets="petzi.ch"))))
        )

    def test_acts_must_be_strings(self):
        self.assertTrue(any("'acts'" in e for e in self.errs(shows_doc(show(acts=[1])))))
        self.assertEqual(self.errs(shows_doc(show(acts=["Dub Inc", "Support"]))), [])

    def test_malformed_input_does_not_crash(self):
        self.assertTrue(V.check_shows("nope", False, ALLOWED))
        self.assertTrue(V.check_shows({"shows": [None, 3]}, False, ALLOWED))
        self.assertTrue(V.check_shows(shows_doc({"id": 5}), False, ALLOWED))


class ArtistChecks(unittest.TestCase):
    def errs(self, artists):
        return V.check_artists({"artists": artists}, ALLOWED)

    def test_valid(self):
        self.assertEqual(
            self.errs(
                {"Dub Inc": {"genres": ["reggae"], "source": "https://w.org/x", "checked": "2026-10-12"}}
            ),
            [],
        )
        self.assertEqual(self.errs({"Dub Inc": {"genres": ["reggae"], "source": "manual"}}), [])

    def test_genres_required_list_and_allowed(self):
        self.assertTrue(any("'genres' must be a list" in e for e in self.errs({"A": {"genres": "reggae"}})))
        self.assertTrue(any("'genres' must be a list" in e for e in self.errs({"A": {}})))
        self.assertTrue(any("not in data/genres.json" in e for e in self.errs({"A": {"genres": ["pop"]}})))

    def test_unknown_field_and_bad_dates_and_source(self):
        self.assertTrue(
            any("unknown field" in e for e in self.errs({"A": {"genres": [], "tourchecked": "2026-01-01"}}))
        )
        self.assertTrue(any("'checked'" in e for e in self.errs({"A": {"genres": [], "checked": "gestern"}})))
        self.assertTrue(
            any("source must be" in e for e in self.errs({"A": {"genres": [], "source": "wikipedia"}}))
        )

    def test_near_duplicate_names(self):
        errs = self.errs({"Dub Inc": {"genres": []}, "DUB INC.": {"genres": []}})
        self.assertTrue(any("near-duplicate" in e for e in errs))

    def test_malformed(self):
        self.assertTrue(self.errs({"A": None}))
        self.assertTrue(V.check_artists({"artists": []}, ALLOWED))


class VenueChecks(unittest.TestCase):
    def test_venues_and_show_lookup(self):
        errs, keys = V.check_venues(
            {
                "venues": {
                    "Dachstock": {"city": "Bern", "canton": "BE", "lat": 46.95, "lon": 7.44, "scrape": True}
                }
            }
        )
        self.assertEqual(errs, [])
        self.assertIn("dachstock", keys)
        # show at a known venue (spelling differs only in case/punctuation) passes, unknown venue fails
        self.assertEqual(V.check_shows(shows_doc(show(venue="DACHSTOCK")), False, ALLOWED, keys), [])
        self.assertTrue(
            any(
                "not in data/venues.json" in e
                for e in V.check_shows(shows_doc(show(venue="Nowhere")), False, ALLOWED, keys)
            )
        )

    def test_venue_errors(self):
        errs, _ = V.check_venues(
            {"venues": {"A": {"city": "X", "canton": "XX", "lat": 1, "lon": 1, "foo": 1}, "a": None}}
        )
        self.assertTrue(any("unknown canton" in e for e in errs))
        self.assertTrue(any("outside" in e for e in errs))
        self.assertTrue(any("unknown field" in e for e in errs))
        self.assertTrue(any("near-duplicate" in e for e in errs))
        self.assertTrue(V.check_venues({"venues": []})[0])

    def test_venue_checked_is_an_iso_date(self):
        base = {"city": "Bern", "canton": "BE", "lat": 46.95, "lon": 7.44}
        ok, _ = V.check_venues({"venues": {"A": dict(base, checked="2026-10-15")}})
        self.assertEqual(ok, [])
        bad, _ = V.check_venues({"venues": {"A": dict(base, checked="yesterday")}})
        self.assertTrue(any("'checked' must be YYYY-MM-DD" in e for e in bad), bad)


class RunChecks(unittest.TestCase):
    def test_runs(self):
        ok = {
            "runs": [
                {
                    "skill": "scrape-shows",
                    "at": "2026-10-13T06:00:00+02:00",
                    "added": 1,
                    "total": 1,
                    "dropped": [{"title": "X", "why": "Y"}],
                    "failed_sources": [],
                    "notes": [],
                }
            ]
        }
        self.assertEqual(V.check_runs(ok), [])
        bad = {"runs": [{"skill": "other", "at": "x", "added": "1", "dropped": [{"title": 1}]}]}
        errs = V.check_runs(bad)
        self.assertEqual(len(errs), 4, errs)
        for fragment in (
            "'skill' must be",
            "'at' must be",
            "'added' must be an integer",
            "needs 'title' and 'why'",
        ):
            self.assertTrue(any(fragment in e for e in errs), (fragment, errs))
        self.assertTrue(V.check_runs({"runs": [{}] * 61}))


class GenreSlugs(unittest.TestCase):
    def test_slugs_are_read_from_genres_json(self):
        slugs = V.allowed_genres()
        self.assertIn("reggae", slugs)
        self.assertIn("ska-punk", slugs)
        self.assertNotIn("Reggae", slugs)


class RepoData(unittest.TestCase):
    def test_repo_data_validates(self):
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(V.main(["--allow-past"]), 0)

    def test_repo_data_is_formatted(self):
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(F.main(["--check"]), 0)


class Formatter(unittest.TestCase):
    def test_shows_sorted_and_one_per_line(self):
        doc = shows_doc(
            show(date="2027-01-02", id="2027-01-02-b-bern", title="B"),
            show(date="2027-01-01", id="2027-01-01-a-bern", title="A"),
        )
        out = F.format_shows(doc)
        self.assertLess(out.index('"2027-01-01-a-bern"'), out.index('"2027-01-02-b-bern"'))
        self.assertEqual(out.count("\n    {"), 2)
        self.assertEqual(json.loads(out)["source"], "scraper")

    def test_artists_sorted_case_insensitive(self):
        out = F.format_artists(
            {"artists": {"b": {"genres": []}, "A": {"checked": "2026-01-01", "genres": []}}}
        )
        data = json.loads(out)
        self.assertEqual(list(data["artists"]), ["A", "b"])
        self.assertEqual(list(data["artists"]["A"]), ["genres", "checked"])

    def test_runs_newest_first_capped(self):
        runs = [{"skill": "scrape-shows", "at": f"2026-01-{i:02d}T06:00:00+01:00"} for i in range(1, 30)] * 3
        out = json.loads(F.format_runs({"runs": runs}))["runs"]
        self.assertEqual(len(out), 60)
        self.assertEqual(out[0]["at"], "2026-01-29T06:00:00+01:00")


if __name__ == "__main__":
    unittest.main()
