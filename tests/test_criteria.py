"""Genre slug parsing from data/genres.json and the finer validator rules. Run: make test"""

import importlib.util
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

TOMORROW = (date.today() + timedelta(days=1)).isoformat()
ALLOWED = {"reggae", "dub", "ska"}


class AllowedGenres(unittest.TestCase):
    """allowed_genres() reads the slugs from data/genres.json – nothing more, nothing less."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._orig = V.GENRES
        V.GENRES = Path(self.tmp.name) / "genres.json"

    def tearDown(self):
        V.GENRES = self._orig
        self.tmp.cleanup()

    def parse(self, text):
        V.GENRES.write_text(text, encoding="utf-8")
        return V.allowed_genres()

    def test_missing_or_malformed_file_gives_empty_set(self):
        self.assertEqual(V.allowed_genres(), set())
        self.assertEqual(self.parse("not json"), set())
        self.assertEqual(self.parse('{"genres": "reggae"}'), set())
        self.assertEqual(self.parse('{"genres": []}'), set())

    def test_slugs_are_read_and_validated(self):
        text = '{"genres": [{"slug": "reggae"}, {"slug": "ska-punk"}, {"slug": "Not Valid"}, {"label": "x"}]}'
        self.assertEqual(self.parse(text), {"reggae", "ska-punk"})


def show(**over):
    base = {
        "id": f"{TOMORROW}-dub-inc-bern",
        "date": TOMORROW,
        "title": "Dub Inc",
        "venue": "Dachstock",
        "city": "Bern",
        "canton": "BE",
        "source_url": "https://x.ch/programm",
    }
    base.update(over)
    return base


def doc(*items, **head):
    base = {"updated": "2026-10-13T06:00:00+02:00", "source": "scraper", "shows": list(items)}
    base.update(head)
    return base


class ShowDetails(unittest.TestCase):
    def errs(self, d, allow_past=False):
        return V.check_shows(d, allow_past, ALLOWED)

    def has(self, d, fragment):
        self.assertTrue(
            any(fragment in e for e in self.errs(d)), f"expected an error containing {fragment!r}"
        )

    def test_document_head(self):
        self.has(doc(source="csv"), "'source' must be")
        self.has(doc(updated="gestern"), "'updated' must be")
        self.has(doc(updated=None), "'updated' must be")
        self.assertEqual(self.errs(doc(shows="nope")), ["shows.json: 'shows' must be a list"])

    def test_id_shape(self):
        self.has(doc(show(id=f"{TOMORROW}-Dub-Inc")), "id must look like")
        self.has(doc(show(id=f"{TOMORROW}-dub--inc")), "id must look like")
        self.has(doc(show(id=f"{TOMORROW}-")), "id must look like")
        self.has(doc(show(id=f"{TOMORROW}-ümlaut")), "id must look like")

    def test_date_and_time_formats(self):
        self.has(doc(show(date="13.10.2026", id="13.10.2026-x")), "date must be YYYY-MM-DD")
        self.has(doc(show(time="8:30")), "time must be HH:MM")
        self.has(doc(show(time="24:00")), "time must be HH:MM")
        self.has(doc(show(time="20:60")), "time must be HH:MM")
        self.assertEqual(self.errs(doc(show(time="00:00"))), [])
        self.assertEqual(self.errs(doc(show(time=""))), [])  # empty time is tolerated like a missing one

    def test_too_far_in_the_future(self):
        far = (date.today() + timedelta(days=800)).isoformat()
        self.has(doc(show(date=far, id=f"{far}-dub-inc-bern")), "more than two years ahead")

    def test_urls_need_a_scheme(self):
        self.has(doc(show(url="www.dachstock.ch")), "url must start with http(s)://")
        self.has(doc(show(source_url="ftp://x")), "source_url must start with http(s)://")
        self.assertEqual(self.errs(doc(show(url=""))), [])  # empty url is allowed (mock data uses it)

    def test_wrong_types(self):
        self.has(doc(show(title="")), "'title' must be a non-empty string")
        self.has(doc(show(title="   ")), "'title' must be a non-empty string")
        self.has(doc(show(lat="46.9", lon=7.4)), "'lat' has wrong type")
        self.has(doc(show(lat=True, lon=7.4)), "'lat' has wrong type")
        self.has(doc(show(genres="dub")), "'genres' has wrong type")
        self.has(doc(show(acts="Dub Inc")), "'acts' has wrong type")
        self.has(doc(show(acts=["Dub Inc", ""])), "every entry in 'acts'")

    def test_coordinates_on_the_border_of_the_region(self):
        self.assertEqual(self.errs(doc(show(lat=45.4, lon=5.4))), [])
        self.assertEqual(self.errs(doc(show(lat=48.3, lon=11.0))), [])
        self.has(doc(show(lat=48.31, lon=9.0)), "outside")
        self.has(doc(show(lat=47.0, lon=5.39)), "outside")

    def test_same_slot_ignores_case_and_punctuation_of_venue(self):
        a = show()
        b = show(id=f"{TOMORROW}-other-bern", venue="DACH-STOCK!", title="Other")
        self.has(doc(a, b), "same date, venue and time")

    def test_genres_without_allowed_list_only_checks_shape(self):
        # criteria.md missing: main() reports that separately, check_shows accepts any well-formed slug
        self.assertEqual(V.check_shows(doc(show(genres=["anything-goes"])), False, set()), [])
        self.assertTrue(V.check_shows(doc(show(genres=["Not A Slug"])), False, set()))

    def test_mock_data_needs_no_venue_match(self):
        keys = {"dachstock": "Dachstock"}
        self.assertEqual(V.check_shows(doc(show(venue="Nowhere"), source="mock"), False, ALLOWED, keys), [])
        self.assertTrue(V.check_shows(doc(show(venue="Nowhere")), False, ALLOWED, keys))


class Keys(unittest.TestCase):
    def test_venue_and_artist_keys_normalise_case_and_punctuation(self):
        self.assertEqual(V.venue_key("Dachstock (Reitschule)"), V.venue_key("dachstock reitschule"))
        self.assertEqual(V.artist_key("DUB INC."), V.artist_key("Dub Inc"))
        self.assertNotEqual(V.artist_key("Dub Inc"), V.artist_key("Dub Incorporated"))
        self.assertEqual(V.venue_key(123), "123")


class RunDetails(unittest.TestCase):
    def test_counters_must_be_integers_not_bools_and_lists_must_be_lists(self):
        base = {"skill": "harvest-bands", "at": "2026-11-01T05:10:00+01:00"}
        self.assertEqual(V.check_runs({"runs": [base]}), [])
        self.assertTrue(
            any("'total' must be an integer" in e for e in V.check_runs({"runs": [dict(base, total=True)]}))
        )
        self.assertTrue(
            any("'added' must be an integer" in e for e in V.check_runs({"runs": [dict(base, added=1.5)]}))
        )
        self.assertTrue(
            any("'notes' must be a list" in e for e in V.check_runs({"runs": [dict(base, notes="x")]}))
        )
        self.assertTrue(
            any("needs 'title' and 'why'" in e for e in V.check_runs({"runs": [dict(base, dropped=[None])]}))
        )

    def test_shape_errors(self):
        self.assertTrue(V.check_runs({"runs": {}}))
        self.assertTrue(V.check_runs([]))
        self.assertEqual(V.check_runs(None), [])
        self.assertTrue(any("not an object" in e for e in V.check_runs({"runs": ["x"]})))


class VenueDetails(unittest.TestCase):
    def test_optional_fields_and_url(self):
        ok = {
            "city": "Bern",
            "canton": "BE",
            "lat": 46.9,
            "lon": 7.4,
            "url": "https://x.ch",
            "scrape": False,
            "hint": "h",
        }
        self.assertEqual(V.check_venues({"venues": {"A": ok}})[0], [])
        errs, _ = V.check_venues({"venues": {"A": dict(ok, url="x.ch", scrape="yes", hint=1)}})
        self.assertTrue(any("url must start" in e for e in errs))
        self.assertTrue(any("'scrape' has wrong type" in e for e in errs))
        self.assertTrue(any("'hint' has wrong type" in e for e in errs))

    def test_required_fields_and_bool_coordinates(self):
        errs, keys = V.check_venues({"venues": {"A": {"city": " ", "canton": "BE", "lat": True, "lon": 7.4}}})
        self.assertTrue(any("'city' has wrong type" in e for e in errs))
        self.assertTrue(any("'lat' has wrong type" in e for e in errs))
        errs, _ = V.check_venues({"venues": {"A": {"city": "Bern"}}})
        self.assertEqual(sum("missing" in e for e in errs), 3)
        self.assertEqual(keys, {"a": "A"})

    def test_none_means_file_absent(self):
        self.assertEqual(V.check_venues(None), ([], {}))


class ArtistDetails(unittest.TestCase):
    def test_festivals_and_tour_checked(self):
        errs = V.check_artists(
            {"artists": {"A": {"genres": [], "festivals": "Summerjam", "tour_checked": "1.1."}}}, ALLOWED
        )
        self.assertTrue(any("'festivals' must be a list" in e for e in errs))
        self.assertTrue(any("'tour_checked' must be YYYY-MM-DD" in e for e in errs))
        self.assertEqual(
            V.check_artists({"artists": {"A": {"genres": [], "festivals": [], "source": ""}}}, ALLOWED), []
        )

    def test_none_means_file_absent(self):
        self.assertEqual(V.check_artists(None, ALLOWED), [])


if __name__ == "__main__":
    unittest.main()
