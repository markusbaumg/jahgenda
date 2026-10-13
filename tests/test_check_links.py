"""Tests for scripts/check_links.py (the weekly dead-link check): only 404/410 and an unknown host count as
broken, bot walls and timeouts never do; the result lands in the quality-review issue. No network: the
opener is faked. Run: make test"""

import importlib.util
import socket
import sys
import unittest
import urllib.error
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS))  # quality_review imports check_links and ghapi


def load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


L = load("check_links")
Q = load("quality_review")


class FakeResponse:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def opener(answers):
    """answers: {(method, url): status | exception}; 200 when absent. Records the requests."""
    calls = []

    def open_(req, timeout=None):
        calls.append((req.get_method(), req.full_url))
        a = answers.get((req.get_method(), req.full_url), 200)
        if isinstance(a, BaseException):
            raise a
        if a >= 400:
            raise urllib.error.HTTPError(req.full_url, a, "x", {}, None)
        return FakeResponse()

    open_.calls = calls
    return open_


class Classify(unittest.TestCase):
    def test_404_and_410_on_get_are_broken(self):
        for code in (404, 410):
            op = opener({("HEAD", "https://a/x"): code, ("GET", "https://a/x"): code})
            self.assertEqual(L.classify("https://a/x", op), f"HTTP {code}")

    def test_fragment_is_not_sent(self):
        # https://rotefabrik.ch/de/programm.html#/events/31588: the server only sees the page, which is gone.
        op = opener({("HEAD", "https://a/p.html"): 404, ("GET", "https://a/p.html"): 404})
        self.assertEqual(L.classify("https://a/p.html#/events/1", op), "HTTP 404")
        self.assertEqual(op.calls, [("HEAD", "https://a/p.html"), ("GET", "https://a/p.html")])

    def test_head_404_but_get_ok_is_fine(self):
        self.assertIsNone(L.classify("https://a/x", opener({("HEAD", "https://a/x"): 404})))

    def test_bot_walls_rate_limits_and_server_errors_are_not_broken(self):
        for code in (401, 403, 429, 500, 503):
            op = opener({("HEAD", "https://a/x"): code, ("GET", "https://a/x"): code})
            self.assertIsNone(L.classify("https://a/x", op), code)

    def test_timeouts_and_tls_errors_are_not_broken(self):
        for exc in (
            TimeoutError("t"),
            urllib.error.URLError(TimeoutError("t")),
            urllib.error.URLError("ssl"),
        ):
            self.assertIsNone(L.classify("https://a/x", opener({("HEAD", "https://a/x"): exc})))

    def test_unknown_host_is_broken(self):
        exc = urllib.error.URLError(socket.gaierror(8, "nodename nor servname provided"))
        self.assertEqual(
            L.classify("https://gone.invalid/", opener({("HEAD", "https://gone.invalid/"): exc})),
            "DNS: host not found",
        )


class Collect(unittest.TestCase):
    def test_show_urls_tickets_and_venue_urls_once_each(self):
        shows = {
            "shows": [
                {"id": "a", "url": "https://v/a", "tickets": "https://t/a"},
                {"id": "b", "url": "https://v/a"},
                {"id": "c", "url": "mailto:x", "tickets": None},
                "junk",
            ]
        }
        venues = {"venues": {"V": {"url": "https://v/"}, "W": {"city": "Bern"}, "X": None}}
        links = dict(L.collect(shows, venues))
        self.assertEqual(set(links), {"https://v/a", "https://t/a", "https://v/"})
        self.assertEqual(links["https://v/a"], "show a (url), show b (url)")
        self.assertEqual(links["https://v/"], "venue V")

    def test_check_returns_only_broken_in_order(self):
        links = [("https://a/1", "show 1 (url)"), ("https://a/2", "venue V")]
        op = opener({("HEAD", "https://a/2"): 410, ("GET", "https://a/2"): 410})
        self.assertEqual(L.check(links, op, workers=1), [("https://a/2", "venue V", "HTTP 410")])


class QualityIssue(unittest.TestCase):
    BROKEN = [("https://a/2", "venue Sous Soul", "HTTP 404")]

    def test_dead_links_alone_make_an_issue_section_and_title(self):
        body = Q.body_for([], 7, self.BROKEN)
        self.assertIn("Dead links on the page (1)", body)
        self.assertIn("- HTTP 404: https://a/2 ← venue Sous Soul", body)
        self.assertNotIn("dropped", body)
        self.assertEqual(Q.title_for([], 7, self.BROKEN), "Quality review: 1 dead link(s)")

    def test_no_links_section_without_dead_links(self):
        self.assertNotIn("Dead links", Q.body_for([], 7))
        self.assertEqual(Q.links_section([]), [])


if __name__ == "__main__":
    unittest.main()
