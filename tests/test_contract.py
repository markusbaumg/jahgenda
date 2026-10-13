"""Drift tests for lists that live in several files and break the PWA silently when they disagree:
the region codes (validator, src/lib/regions.js, public/img/cantons/*.svg) and the app-shell file list
(public/sw.js SHELL, the build stamp in vite.config.js, the Makefile). Stdlib only. Run: make test"""

import importlib.util
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"


def load_module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


V = load_module("validate_shows")
SW = (PUBLIC / "sw.js").read_text(encoding="utf-8")
REGIONS_JS = (ROOT / "src" / "lib" / "regions.js").read_text(encoding="utf-8")
MAKEFILE = (ROOT / "Makefile").read_text(encoding="utf-8")
VITE_CONFIG = (ROOT / "vite.config.js").read_text(encoding="utf-8")
PAGES = (ROOT / ".github" / "workflows" / "pages.yml").read_text(encoding="utf-8")


def js_object_keys(src, name):
    """Keys of `export const <name> = { KEY: ..., };` in src/lib/regions.js."""
    m = re.search(rf"const {name} = \{{(.*?)\n\s*\}};", src, re.S)
    assert m, f"const {name} = {{...}} not found in regions.js"
    return set(re.findall(r"^\s*([A-Z]+):", m.group(1), re.M))


def shell_files():
    m = re.search(r"const SHELL = \[(.*?)\];", SW, re.S)
    assert m, "const SHELL = [...] not found in sw.js"
    return [f for f in re.findall(r'"([^"]+)"', m.group(1)) if f != "./"]


def built_file(f):
    """Where a shell file comes from before the build: public/ (static) or the repo root (style.css, copied
    by the jahgenda-static plugin)."""
    return (PUBLIC / f).is_file() or (ROOT / f).is_file()


def makefile_var(name):
    m = re.search(rf"^{name}\s*:=\s*(.+)$", MAKEFILE, re.M)
    assert m, f"{name} not found in Makefile"
    return m.group(1).split()


class Regions(unittest.TestCase):
    def test_validator_app_and_svgs_agree(self):
        # (sw.js no longer lists the flags: they are cached on first use, not precached.)
        self.assertEqual(js_object_keys(REGIONS_JS, "CANTONS"), V.CANTONS, "regions.js CANTONS vs validator")
        self.assertEqual(js_object_keys(REGIONS_JS, "ABROAD"), V.ABROAD, "regions.js ABROAD vs validator")
        svgs = {p.stem for p in (PUBLIC / "img" / "cantons").glob("*.svg")}
        self.assertEqual(svgs, V.REGIONS, "public/img/cantons/*.svg vs validator")


class AppShell(unittest.TestCase):
    def test_every_shell_file_exists(self):
        missing = [f for f in shell_files() if not built_file(f)]
        self.assertEqual(missing, [], "sw.js SHELL lists files that do not exist (install would fail)")
        shell = SW.split("const SHELL = [")[1].split("];")[0]
        self.assertIn("...BUNDLE", shell, "SHELL must spread the bundle")

    def test_build_stamps_the_worker(self):
        # The Vite build inserts the hashed bundle files and BUILD (vite.config.js) – pages.yml checks
        # the stamp landed before uploading, so a stale cache can never ship.
        self.assertIn('const BUILD = "__BUILD__"', SW)
        self.assertIn("const BUNDLE = /* __BUNDLE__ */ []", SW)
        self.assertIn("__BUNDLE__", VITE_CONFIG)
        self.assertIn("__BUILD__", VITE_CONFIG)
        self.assertIn("__BUILD__", PAGES)
        self.assertIn("path: dist", PAGES)
        for f in ("data", "style.css", "design"):
            self.assertIn(f'["{f}", "{f}"', VITE_CONFIG, f"the build no longer copies {f}/ into dist")

    def test_makefile_knows_the_shell_files(self):
        web = makefile_var("WEB_FILES")
        # Plain entries must exist; a glob (e2e/*.js) must match at least one file, or prettier gets the
        # literal pattern and fails.
        missing = [f for f in web if not (ROOT / f).exists() and not (("*" in f) and list(ROOT.glob(f)))]
        self.assertEqual(missing, [], "WEB_FILES lists missing files")
        m = re.search(r"^\tnode --check (.+)$", MAKEFILE, re.M)
        self.assertTrue(m, "node --check line not found in the lint target")
        checked = set(m.group(1).split())
        shell_js = {f"public/{f}" for f in shell_files() if f.endswith(".js")}
        self.assertEqual(sorted(shell_js - checked), [], "shell scripts not syntax-checked by make lint")
        self.assertIn("public/sw.js", checked)
        self.assertIn("public/*.js", web, "the plain scripts in public/ must be in WEB_FILES (prettier)")


class Slogans(unittest.TestCase):
    """The tagline list is inline in index.html (picked by the header before the first paint) and in
    data/slogans.json (stickers, validator): the two must stay the same list."""

    def test_inline_slogans_equal_the_data_file(self):
        import json

        html = (ROOT / "index.html").read_text(encoding="utf-8")
        m = re.search(r'<script type="application/json" id="slogans">(.*?)</script>', html, re.S)
        self.assertIsNotNone(m, "index.html has no inline slogans block")
        inline = json.loads(m.group(1))
        data = json.loads((ROOT / "data" / "slogans.json").read_text(encoding="utf-8"))["slogans"]
        self.assertEqual(inline, data, "index.html #slogans vs data/slogans.json")
        header = (ROOT / "src" / "components" / "Header.svelte").read_text(encoding="utf-8")
        self.assertIn(f'const DEFAULT = "{inline[0]}"', header, "the default tagline is the first slogan")


class ReadmeLayout(unittest.TestCase):
    """README «Layout of the repo» must name every page, script, data file, scraper file and workflow."""

    def test_every_repo_file_is_in_the_layout_block(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        m = re.search(r"## Layout of the repo\n\n```\n(.*?)```", readme, re.S)
        self.assertIsNotNone(m, "README has no «Layout of the repo» block")
        block = m.group(1)
        patterns = [
            "*.html",
            "*.js",
            "public/*.html",
            "public/*.js",
            "public/*.webmanifest",
            "src/*.js",
            "src/*.svelte",
            "src/*/*.js",
            "src/*/*.svelte",
            "scripts/*.py",
            "scripts/*.sh",
            "data/*.json",
            "scraper/*",
            ".github/workflows/*.yml",
        ]
        files = [p for pat in patterns for p in ROOT.glob(pat) if p.is_file()]
        missing = sorted(
            str(p.relative_to(ROOT))
            for p in files
            if p.name not in block and str(p.relative_to(ROOT)) not in block
        )
        self.assertEqual(missing, [], f"add these to the README layout block: {missing}")


class SmokeCoverage(unittest.TestCase):
    """scripts/smoke.sh must load every public page of the build, or a new page ships untested."""

    def test_every_root_page_is_smoke_tested(self):
        smoke = (ROOT / "scripts" / "smoke.sh").read_text(encoding="utf-8")
        m = re.search(r"^for page in (.+?); do$", smoke, re.M)
        self.assertIsNotNone(m, "smoke.sh has no `for page in … ; do` loop")
        tested = set(m.group(1).split())
        pages = {p.name for p in ROOT.glob("*.html")} | {p.name for p in PUBLIC.glob("*.html")}
        self.assertEqual(
            sorted(pages - tested), [], f"add these pages to the smoke loop: {sorted(pages - tested)}"
        )


if __name__ == "__main__":
    unittest.main()
