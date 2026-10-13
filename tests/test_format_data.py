"""Edge cases for scripts/format_data.py (the canonical JSON formatter). Run: make test"""

import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from _scripts import load_script

ROOT = Path(__file__).resolve().parent.parent


F = load_script("format_data")


def show(**over):
    base = {
        "id": "2027-03-01-a-bern",
        "date": "2027-03-01",
        "title": "A",
        "venue": "V",
        "city": "Bern",
        "canton": "BE",
    }
    base.update(over)
    return base


class Ordered(unittest.TestCase):
    def test_known_keys_first_unknown_after_in_original_order(self):
        out = F.ordered({"zzz": 1, "lon": 2, "aaa": 3, "id": 4}, ["id", "lat", "lon"])
        self.assertEqual(list(out), ["id", "lon", "zzz", "aaa"])
        self.assertEqual(out, {"id": 4, "lon": 2, "zzz": 1, "aaa": 3})

    def test_missing_keys_are_not_invented(self):
        self.assertEqual(F.ordered({}, ["id", "date"]), {})


class Shows(unittest.TestCase):
    def test_empty_list_is_valid_json_and_stable(self):
        out = F.format_shows({"updated": "2026-10-13T06:00:00+02:00", "source": "mock", "shows": []})
        self.assertEqual(
            json.loads(out), {"updated": "2026-10-13T06:00:00+02:00", "source": "mock", "shows": []}
        )
        self.assertTrue(out.endswith("\n"))
        self.assertNotIn("\n\n", out)

    def test_head_keys_and_unknown_fields_survive(self):
        doc = {"note": "n", "updated": "u", "source": "mock", "shows": [show(extra="x")]}
        data = json.loads(F.format_shows(doc))
        self.assertEqual(list(data), ["note", "updated", "source", "shows"])
        self.assertEqual(data["shows"][0]["extra"], "x")
        self.assertEqual(list(data["shows"][0])[-1], "extra")  # unknown field goes last

    def test_field_order_is_canonical(self):
        data = json.loads(F.format_shows({"shows": [show(genres=["dub"], lon=7.4, lat=46.9, time="20:00")]}))
        self.assertEqual(
            list(data["shows"][0]),
            ["id", "date", "time", "title", "venue", "city", "canton", "lat", "lon", "genres"],
        )

    def test_sort_by_date_then_time_then_title_with_missing_time(self):
        doc = {
            "shows": [
                show(id="2027-03-01-c", title="C", time="21:00"),
                show(id="2027-03-01-b", title="B"),
                show(id="2027-03-01-a", title="A", time="21:00"),
                show(id="2027-02-01-z", date="2027-02-01", title="Z", time="23:00"),
            ]
        }
        ids = [s["id"] for s in json.loads(F.format_shows(doc))["shows"]]
        self.assertEqual(ids, ["2027-02-01-z", "2027-03-01-b", "2027-03-01-a", "2027-03-01-c"])

    def test_unicode_is_kept_literally(self):
        out = F.format_shows({"shows": [show(city="Zürich", title="Café Élan")]})
        self.assertIn("Zürich", out)
        self.assertNotIn("\\u00fc", out)

    def test_malformed_shows_are_passed_through(self):
        # not a list of dicts: leave as is, still valid JSON (the validator will complain, not the formatter)
        self.assertEqual(json.loads(F.format_shows({"shows": [1, "x"]}))["shows"], [1, "x"])
        self.assertEqual(json.loads(F.format_shows({"shows": "nope"}))["shows"], "nope")
        self.assertEqual(json.loads(F.format_shows({}))["shows"], [])


class Venues(unittest.TestCase):
    def test_sorted_case_insensitive_with_canonical_field_order(self):
        doc = {
            "note": "n",
            "venues": {
                "bogen F": {
                    "scrape": True,
                    "lon": 8.5,
                    "lat": 47.3,
                    "canton": "ZH",
                    "city": "Zürich",
                    "x": 1,
                },
                "Amboss": {"city": "Zürich", "canton": "ZH", "lat": 47.3, "lon": 8.5},
            },
        }
        data = json.loads(F.format_venues(doc))
        self.assertEqual(list(data), ["note", "venues"])
        self.assertEqual(list(data["venues"]), ["Amboss", "bogen F"])
        self.assertEqual(list(data["venues"]["bogen F"]), ["city", "canton", "lat", "lon", "scrape", "x"])

    def test_non_dict_values_and_missing_venues_key(self):
        data = json.loads(F.format_venues({"venues": {"A": None, "B": 3}}))
        self.assertEqual(data["venues"], {"A": None, "B": 3})
        self.assertEqual(json.loads(F.format_venues({}))["venues"], {})
        self.assertEqual(json.loads(F.format_venues({"venues": []}))["venues"], [])


class Artists(unittest.TestCase):
    def test_unknown_fields_kept_and_non_dicts_passed_through(self):
        data = json.loads(F.format_artists({"artists": {"B": {"foo": 1, "genres": []}, "a": "?"}}))
        self.assertEqual(list(data["artists"]), ["a", "B"])
        self.assertEqual(list(data["artists"]["B"]), ["genres", "foo"])
        self.assertEqual(data["artists"]["a"], "?")

    def test_note_stays_first(self):
        data = json.loads(F.format_artists({"artists": {}, "note": "n"}))
        self.assertEqual(list(data), ["note", "artists"])


class Runs(unittest.TestCase):
    def test_runs_without_at_sort_last_and_non_dicts_pass_through(self):
        runs = [{"skill": "scrape-shows"}, {"skill": "scrape-shows", "at": "2026-01-02T06:00:00+01:00"}]
        out = json.loads(F.format_runs({"runs": runs}))["runs"]
        self.assertEqual(out[0]["at"], "2026-01-02T06:00:00+01:00")
        self.assertNotIn("at", out[1])
        self.assertEqual(json.loads(F.format_runs({"runs": [1]}))["runs"], [1])

    def test_cap_keeps_newest(self):
        runs = [{"at": f"2026-01-01T{h:02d}:00:00+01:00"} for h in range(24)] * 3  # 72 entries
        out = json.loads(F.format_runs({"runs": runs}))["runs"]
        self.assertEqual(len(out), F.MAX_RUNS)
        self.assertEqual(out[0]["at"], "2026-01-01T23:00:00+01:00")
        self.assertEqual(out[-1]["at"], "2026-01-01T04:00:00+01:00")


class Main(unittest.TestCase):
    """main() against a temporary data directory (F.DATA is swapped, never the real repo)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data = Path(self.tmp.name)
        self._orig = F.DATA
        F.DATA = self.data
        self._quiet = contextlib.redirect_stdout(io.StringIO())  # main() prints its report
        self._quiet.__enter__()

    def tearDown(self):
        self._quiet.__exit__(None, None, None)
        F.DATA = self._orig
        self.tmp.cleanup()

    def write(self, name, text):
        (self.data / name).write_text(text, encoding="utf-8")

    def test_check_reports_without_writing_then_write_fixes(self):
        self.write("artists.json", '{"artists": {"b": {"genres": []}, "A": {"genres": []}}}')
        before = (self.data / "artists.json").read_text(encoding="utf-8")
        self.assertEqual(F.main(["--check"]), 1)
        self.assertEqual((self.data / "artists.json").read_text(encoding="utf-8"), before)
        self.assertEqual(F.main([]), 0)
        self.assertEqual(
            list(json.loads((self.data / "artists.json").read_text(encoding="utf-8"))["artists"]), ["A", "b"]
        )
        self.assertEqual(F.main(["--check"]), 0)  # now canonical

    def test_formatting_is_idempotent(self):
        self.write(
            "shows.json",
            '{"updated":"u","source":"mock","shows":[{"title":"B","id":"2","date":"2027-01-01"}]}',
        )
        self.write(
            "venues.json", '{"venues":{"b":{"lon":1,"lat":1,"canton":"ZH","city":"Z"},"A":{"city":"Z"}}}'
        )
        self.write("runs.json", '{"runs":[{"at":"1"},{"at":"2"}]}')
        self.assertEqual(F.main([]), 0)
        first = {p.name: p.read_text(encoding="utf-8") for p in self.data.iterdir()}
        self.assertEqual(F.main([]), 0)
        self.assertEqual({p.name: p.read_text(encoding="utf-8") for p in self.data.iterdir()}, first)
        self.assertEqual(F.main(["--check"]), 0)

    def test_missing_files_are_skipped(self):
        self.assertEqual(F.main(["--check"]), 0)
        self.assertEqual(F.main([]), 0)

    def test_invalid_json_fails_and_is_left_alone(self):
        self.write("shows.json", "{not json")
        self.assertEqual(F.main([]), 1)
        self.assertEqual((self.data / "shows.json").read_text(encoding="utf-8"), "{not json")
        self.write("shows.json", "[1, 2]")  # valid JSON, wrong shape
        self.assertEqual(F.main([]), 1)


if __name__ == "__main__":
    unittest.main()


class WebVenues(unittest.TestCase):
    """data/venues.web.json: derived from venues.json, the fields the page reads; --check keeps it in sync."""

    def test_keeps_only_the_page_fields_and_drops_non_dicts(self):
        data = {
            "venues": {
                "Zed": {"city": "Chur", "canton": "GR", "lat": 46.8, "lon": 9.5},
                "Dachstock": {
                    "city": "Bern",
                    "canton": "BE",
                    "lat": 46.95,
                    "lon": 7.44,
                    "url": "https://x",
                    "scrape": True,
                    "hint": "notes",
                },
                "Broken": None,
            }
        }
        out = json.loads(F.web_venues(data))["venues"]
        self.assertEqual(list(out), ["Dachstock", "Zed"])
        self.assertEqual(out["Dachstock"], {"city": "Bern", "lat": 46.95, "lon": 7.44, "url": "https://x"})
        self.assertEqual(out["Zed"], {"city": "Chur", "lat": 46.8, "lon": 9.5})

    def test_check_fails_when_the_derived_file_is_stale_and_write_fixes_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            F.DATA = Path(tmp)
            try:
                venues = {"venues": {"V": {"city": "Bern", "hint": "x"}}}
                (F.DATA / "venues.json").write_text(F.format_venues(venues))
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(F.main(["--check"]), 1)  # derived file missing
                    self.assertEqual(F.main([]), 0)
                    self.assertEqual(F.main(["--check"]), 0)
                self.assertEqual(
                    json.loads((F.DATA / "venues.web.json").read_text()), {"venues": {"V": {"city": "Bern"}}}
                )
                (F.DATA / "venues.web.json").write_text("{}\n")
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(F.main(["--check"]), 1)  # stale
            finally:
                F.DATA = ROOT / "data"

    def test_the_page_and_the_worker_read_the_derived_file(self):
        store = (ROOT / "src" / "stores" / "agenda.svelte.js").read_text(encoding="utf-8")
        load = (ROOT / "src" / "lib" / "load.js").read_text(encoding="utf-8")
        self.assertIn('venuesWeb: "data/venues.web.json"', load)
        self.assertIn("tryJson(DATA.venuesWeb)", store)
        self.assertIn('"data/venues.web.json"', (ROOT / "src" / "sw.js").read_text(encoding="utf-8"))


class SkillCommitsWhatFormatDataWrites(unittest.TestCase):
    """scrape-shows runs format_data.py right before its commit: every file the formatter may write
    (FORMATTERS + DERIVED targets) must be staged by that commit and reverted by its failure path –
    otherwise the first new venue leaves data/venues.web.json unstaged and main fails `make check`."""

    SKILL = (ROOT / ".claude" / "skills" / "scrape-shows" / "SKILL.md").read_text(encoding="utf-8")

    def written(self):
        files = {f"data/{name}" for name in F.FORMATTERS}
        return files | {f"data/{target}" for target, _ in F.DERIVED.values()}

    def command_files(self, verb):
        lines = [ln for ln in self.SKILL.splitlines() if verb in ln]
        self.assertTrue(lines, f"no `{verb}` line in scrape-shows SKILL.md")
        return {tok.strip("`()\\") for ln in lines for tok in ln.split(verb, 1)[1].split()}

    def test_commit_stages_every_file_format_data_writes(self):
        self.assertEqual(self.written() - self.command_files("git add"), set())

    def test_failure_path_reverts_every_written_data_file_but_the_run_log(self):
        # runs.json (and status.json) carry the failure itself, so they are written, not reverted.
        self.assertEqual(self.written() - {"data/runs.json"} - self.command_files("git checkout --"), set())
