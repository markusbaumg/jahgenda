"""scripts/ghapi.py: the GitHub call shared by the watchdog and the quality review returns (status, body) for
a success AND for an HTTP error (never raises), sends the token and the API version, and parse_ts is UTC."""

import io
import json
import unittest
import urllib.error
from datetime import datetime, timezone
from unittest import mock

from _scripts import load_script

G = load_script("ghapi")


class FakeResponse(io.BytesIO):
    status = 201

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class Gh(unittest.TestCase):
    def test_success_returns_status_and_parsed_body(self):
        seen = {}

        def urlopen(req, timeout):
            seen["url"] = req.full_url
            seen["method"] = req.get_method()
            seen["headers"] = dict(req.header_items())
            seen["body"] = json.loads(req.data)
            return FakeResponse(b'{"number": 7}')

        with mock.patch.object(G.urllib.request, "urlopen", urlopen), mock.patch.object(G, "TOKEN", "tok"):
            code, body = G.gh("POST", "/repos/o/r/issues", {"title": "x"}, agent="jahgenda-test")
        self.assertEqual((code, body), (201, {"number": 7}))
        self.assertEqual(seen["url"], "https://api.github.com/repos/o/r/issues")
        self.assertEqual(seen["method"], "POST")
        self.assertEqual(seen["body"], {"title": "x"})
        self.assertEqual(seen["headers"]["Authorization"], "Bearer tok")
        self.assertEqual(seen["headers"]["X-github-api-version"], "2022-11-28")
        self.assertEqual(seen["headers"]["User-agent"], "jahgenda-test")

    def test_http_error_is_returned_not_raised(self):
        def urlopen(req, timeout):
            raise urllib.error.HTTPError(
                req.full_url, 403, "Forbidden", {}, io.BytesIO(b'{"message": "rate limited"}')
            )

        with mock.patch.object(G.urllib.request, "urlopen", urlopen):
            code, body = G.gh("GET", "/repos/o/r/issues")
        self.assertEqual(code, 403)
        self.assertEqual(body, {"message": "rate limited"})

    def test_empty_body_is_none(self):
        with mock.patch.object(G.urllib.request, "urlopen", lambda req, timeout: FakeResponse(b"")):
            self.assertEqual(G.gh("GET", "/x"), (201, None))


class ParseTs(unittest.TestCase):
    def test_offsets_z_and_naive_all_become_utc(self):
        utc = datetime(2026, 10, 13, 6, 0, tzinfo=timezone.utc)
        self.assertEqual(G.parse_ts("2026-10-13T08:00:00+02:00"), utc)
        self.assertEqual(G.parse_ts("2026-10-13T06:00:00Z"), utc)
        self.assertEqual(G.parse_ts("2026-10-13T06:00:00"), utc)

    def test_garbage_is_none(self):
        for value in ("", None, 42, "yesterday", "2026-13-40T00:00:00Z"):
            self.assertIsNone(G.parse_ts(value), value)


if __name__ == "__main__":
    unittest.main()
