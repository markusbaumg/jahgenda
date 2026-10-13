"""Genre slug parsing from data/genres.json and the finer validator rules. Run: make test"""

import importlib.util
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


class GenresFile(unittest.TestCase):
    """check_genres_file(): the page contract behind the chips - unique slug + label per entry."""

    def test_repo_file_passes(self):
        self.assertEqual(V.check_genres_file(json.loads(V.GENRES.read_text(encoding="utf-8"))), [])

    def test_shape(self):
        self.assertEqual(V.check_genres_file([]), ["genres.json: must be an object with a 'genres' list"])
        self.assertEqual(
            V.check_genres_file({"genres": {}}), ["genres.json: must be an object with a 'genres' list"]
        )
        errs = V.check_genres_file({"note": "x", "genres": ["reggae"], "order": []})
        self.assertEqual(errs, ["genres[0]: not an object", "genres.json: unknown field 'order'"])

    def test_slug_label_and_unknown_fields(self):
        doc = {
            "genres": [
                {"slug": "reggae", "label": "Reggae", "maps": "reggae"},
                {"slug": "Ska Punk", "label": "Ska-Punk"},
                {"slug": "reggae", "label": ""},
                {"slug": "dub", "label": "Dub", "maps": 3, "colour": "gold"},
                {"label": "Roots"},
            ]
        }
        errs = V.check_genres_file(doc)
        self.assertEqual(
            errs,
            [
                "genres[1]: 'slug' must be a lowercase slug like 'roots' or 'ska-punk'",
                "genres[2]: duplicate slug 'reggae'",
                "genres[2]: 'label' must be a non-empty string",
                "genres[3]: 'maps' must be a string",
                "genres[3]: unknown field 'colour'",
                "genres[4]: 'slug' must be a lowercase slug like 'roots' or 'ska-punk'",
            ],
        )


class Slogans(unittest.TestCase):
    def test_repo_file_passes(self):
        self.assertEqual(V.check_slogans(json.loads(V.SLOGANS.read_text(encoding="utf-8"))), [])

    def test_shape_and_entries(self):
        self.assertEqual(V.check_slogans(["x"]), ["slogans.json: must be an object with a 'slogans' list"])
        self.assertEqual(
            V.check_slogans({"slogans": "x"}), ["slogans.json: must be an object with a 'slogans' list"]
        )
        self.assertEqual(V.check_slogans({"slogans": []}), ["slogans.json: 'slogans' is empty"])
        errs = V.check_slogans({"note": "n", "slogans": ["Irie", "", 3, " Irie "], "lang": "gsw"})
        self.assertEqual(
            errs,
            [
                "slogans[1]: must be a non-empty string",
                "slogans[2]: must be a non-empty string",
                "slogans[3]: duplicate ' Irie '",
                "slogans.json: unknown field 'lang'",
            ],
        )


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

    def test_scraped_show_must_sit_at_its_venue(self):
        keys = {"dachstock": "Dachstock"}
        venues = {"Dachstock": {"city": "Bern", "canton": "BE", "lat": 46.95, "lon": 7.44}}
        ok = show(venue="Dachstock", canton="BE", lat=46.951, lon=7.441)
        self.assertEqual(V.check_shows(doc(ok), False, ALLOWED, keys, venues), [])
        errs = V.check_shows(
            doc(show(venue="Dachstock", canton="ZH", lat=46.95, lon=7.44)), False, ALLOWED, keys, venues
        )
        self.assertTrue(any("canton 'ZH' but venue" in e for e in errs))
        errs = V.check_shows(
            doc(show(venue="Dachstock", canton="BE", lat=47.38, lon=8.53)), False, ALLOWED, keys, venues
        )
        self.assertTrue(any("not at venue" in e for e in errs))
        # mock data and shows without coordinates are left alone
        self.assertEqual(
            V.check_shows(
                doc(show(venue="Dachstock", canton="ZH"), source="mock"), False, ALLOWED, keys, venues
            ),
            [],
        )


class Keys(unittest.TestCase):
    def test_venue_and_artist_keys_normalise_case_and_punctuation(self):
        self.assertEqual(V.venue_key("Dachstock (Reitschule)"), V.venue_key("dachstock reitschule"))
        self.assertEqual(V.artist_key("DUB INC."), V.artist_key("Dub Inc"))
        self.assertNotEqual(V.artist_key("Dub Inc"), V.artist_key("Dub Incorporated"))
        self.assertEqual(V.venue_key(123), "123")


class StatusChecks(unittest.TestCase):
    """data/status.json, the heartbeat: the exact shape the skills write and the watchdog reads."""

    GOOD = {
        "ok": True,
        "skill": "scrape-shows",
        "at": "2026-10-13T06:14:22+02:00",
        "runner": "cloud",
        "counts": {"added": 3, "updated": 1, "removed": 2, "total": 41},
        "failed_sources": 1,
        "error": None,
    }

    def one(self, fragment, **over):
        errs = V.check_status({**self.GOOD, **over})
        self.assertEqual(len(errs), 1, errs)
        self.assertIn(fragment, errs[0])

    def test_skill_examples_pass(self):
        self.assertEqual(V.check_status(self.GOOD), [])
        harvest = {
            "ok": True,
            "skill": "harvest-bands",
            "at": "2026-11-01T05:10:00+01:00",
            "runner": "cloud",
            "counts": {"added": 12, "total": 57},
            "error": None,
        }
        self.assertEqual(V.check_status(harvest), [])
        self.assertEqual(V.check_status({**self.GOOD, "ok": False, "error": "WebFetch ENOTFOUND"}), [])
        self.assertEqual(V.check_status({**self.GOOD, "at": "2026-10-13T04:14:22Z"}), [])

    def test_absent_file_is_fine_but_shape_is_not_negotiable(self):
        self.assertEqual(V.check_status(None), [])
        self.assertEqual(V.check_status([]), ["status.json: must be an object"])

    def test_each_wrong_type_gives_one_specific_message(self):
        self.one("'ok' must be true or false", ok="true")
        self.one("'skill' must be", skill="scraper")
        self.one("'at' must be an ISO 8601 timestamp", at=1760336062)
        self.one("'at' needs a UTC offset", at="2026-10-13T06:14:22")
        self.one("'runner' must be a string", runner=1)
        self.one("'counts' must be an object", counts=[3, 1, 2, 41])
        self.one("count 'added' must be an integer", counts={"added": "3"})
        self.one("count 'total' must be an integer", counts={"total": True})
        self.one("unknown count 'kept'", counts={"kept": 3})
        self.one("'failed_sources' must be an integer", failed_sources=["Exil"])
        self.one("'error' must be a string or null", error=403)
        self.one("unknown field 'message'", message="x")


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
