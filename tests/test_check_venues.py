"""Tests for the judgement in scripts/check_venues.py (no network: nominatim() is faked). Run: make test"""

import unittest
from pathlib import Path

from _scripts import load_script

ROOT = Path(__file__).resolve().parent.parent


C = load_script("check_venues")


def hit(display_name, cls="amenity"):
    return {"display_name": display_name, "class": cls}


class Haversine(unittest.TestCase):
    def test_bern_to_zurich_is_about_95_km(self):
        d = C.haversine_m(46.948, 7.447, 47.377, 8.541)
        self.assertLess(abs(d - 95_000), 1_000, d)

    def test_same_point_is_zero(self):
        self.assertEqual(C.haversine_m(46.948, 7.447, 46.948, 7.447), 0)


class InCity(unittest.TestCase):
    def test_whole_element_match_only(self):
        self.assertTrue(C.in_city(hit("Royal, Baden, Aargau, Schweiz"), "Baden"))
        self.assertFalse(C.in_city(hit("Royal, Lörrach, Baden-Württemberg, Deutschland"), "Baden"))
        self.assertTrue(C.in_city(hit("royal, BADEN , Aargau"), "Baden"))  # case and spaces do not matter

    def test_language_aliases(self):
        self.assertTrue(C.in_city(hit("Usine, Genf, Schweiz"), "Genève"))
        self.assertTrue(C.in_city(hit("Usine, Geneva, Switzerland"), "Genève"))
        self.assertFalse(C.in_city(hit("Usine, Lausanne, Schweiz"), "Genève"))

    def test_no_display_name(self):
        self.assertFalse(C.in_city({}, "Bern"))


class BestHit(unittest.TestCase):
    def test_amenity_in_city_beats_a_street_listed_first_and_an_in_city_boundary(self):
        street = hit("Bierhübeli, Grossaffoltern, Bern, Schweiz", "highway")
        boundary = hit("Bern, Schweiz", "boundary")
        club = hit("Bierhübeli, Neubrückstrasse, Bern, Schweiz", "amenity")
        self.assertIs(C.best_hit([street, boundary, club], "Bern"), club)

    def test_in_city_beats_a_better_class_elsewhere(self):
        barn = hit("Schüür, Mauensee, Sursee, Schweiz", "building")
        hall = hit("Schüür, Luzern, Schweiz", "place")
        self.assertIs(C.best_hit([barn, hall], "Luzern"), hall)


class Lookup(unittest.TestCase):
    """lookup() with a dict-backed Nominatim: query -> hits."""

    def setUp(self):
        self._nominatim = C.nominatim
        self.calls = []

    def tearDown(self):
        C.nominatim = self._nominatim

    def fake(self, answers):
        def nominatim(query, limit=3):
            self.calls.append(query)
            return list(answers.get(query, []))

        C.nominatim = nominatim

    def test_returns_after_the_first_query_with_an_in_city_hit(self):
        club = hit("Dachstock, Bern, Schweiz")
        self.fake({"Dachstock, Bern": [club], "Dachstock Bern, Bern": [hit("elsewhere")]})
        self.assertEqual(C.lookup("Dachstock", "Bern"), ([club], "Dachstock, Bern", False))
        self.assertEqual(self.calls, ["Dachstock, Bern"])

    def test_article_is_dropped_as_a_fallback(self):
        mokka = hit("Mokka, Thun, Schweiz")
        self.fake({"Mokka, Thun": [mokka]})
        self.assertEqual(C.lookup("Café Mokka", "Thun"), ([mokka], "Mokka, Thun", False))
        self.assertEqual(self.calls, ["Café Mokka, Thun", "Café Mokka Thun, Thun", "Mokka, Thun"])

    def test_hits_outside_the_city_are_attributed_to_the_query_that_found_them(self):
        far = hit("Café Mokka, Biel, Schweiz")
        self.fake({"Café Mokka, Thun": [far]})
        found, query, city_only = C.lookup("Café Mokka", "Thun")
        self.assertEqual((found, query, city_only), ([far], "Café Mokka, Thun", False))
        self.assertEqual(len(self.calls), 3)  # every query was tried, none gave an in-city hit

    def test_city_centre_when_nothing_is_found(self):
        centre = hit("Thun, Bern, Schweiz", "boundary")
        self.fake({"Thun, Schweiz": [centre]})
        self.assertEqual(C.lookup("Nowhere", "Thun"), ([centre], "Thun, Schweiz", True))

    def test_duplicate_hits_are_merged(self):
        same = hit("Royal, Zürich, Schweiz", "highway")
        self.fake({"Royal, Baden": [same], "Royal Baden, Baden": [same]})
        found, query, _ = C.lookup("Royal", "Baden")
        self.assertEqual(found, [same])
        self.assertEqual(query, "Royal Baden, Baden")  # the last query that returned anything


if __name__ == "__main__":
    unittest.main()
