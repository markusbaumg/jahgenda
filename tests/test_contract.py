"""Drift tests for lists that live in several files and break the PWA silently when they disagree:
the region codes (validator, app.js, img/cantons/*.svg) and the app-shell file list
(sw.js SHELL, the BUILD hash input in pages.yml, the Makefile). Stdlib only. Run: make test"""

import importlib.util
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


V = load_module("validate_shows")
SW = (ROOT / "sw.js").read_text(encoding="utf-8")
APP = (ROOT / "app.js").read_text(encoding="utf-8")
MAKEFILE = (ROOT / "Makefile").read_text(encoding="utf-8")
PAGES = (ROOT / ".github" / "workflows" / "pages.yml").read_text(encoding="utf-8")


def js_object_keys(src, name):
    """Keys of `const <name> = { KEY: ..., };` in app.js."""
    m = re.search(rf"const {name} = \{{(.*?)\n\s*\}};", src, re.S)
    assert m, f"const {name} = {{...}} not found in app.js"
    return set(re.findall(r"^\s*([A-Z]+):", m.group(1), re.M))


def shell_files():
    m = re.search(r"const SHELL = \[(.*?)\];", SW, re.S)
    assert m, "const SHELL = [...] not found in sw.js"
    return [f for f in re.findall(r'"([^"]+)"', m.group(1)) if f != "./"]


def build_hash_inputs():
    """The files pages.yml hashes into BUILD (globs expanded), as paths relative to the repo root."""
    line = next(ln for ln in PAGES.splitlines() if "BUILD=$(cat" in ln)
    tokens = line.split("cat ", 1)[1].split("|", 1)[0].split()
    files = set()
    for t in tokens:
        files |= {str(p.relative_to(ROOT)) for p in ROOT.glob(t)} if "*" in t else {t}
    return files


def makefile_var(name):
    m = re.search(rf"^{name}\s*:=\s*(.+)$", MAKEFILE, re.M)
    assert m, f"{name} not found in Makefile"
    return m.group(1).split()


class Regions(unittest.TestCase):
    def test_validator_app_and_svgs_agree(self):
        # (sw.js no longer lists the flags: they are cached on first use, not precached.)
        self.assertEqual(js_object_keys(APP, "CANTONS"), V.CANTONS, "app.js CANTONS vs validator")
        self.assertEqual(js_object_keys(APP, "ABROAD"), V.ABROAD, "app.js ABROAD vs validator")
        svgs = {p.stem for p in (ROOT / "img" / "cantons").glob("*.svg")}
        self.assertEqual(svgs, V.REGIONS, "img/cantons/*.svg vs validator")


class AppShell(unittest.TestCase):
    def test_every_shell_file_exists(self):
        missing = [f for f in shell_files() if not (ROOT / f).is_file()]
        self.assertEqual(missing, [], "sw.js SHELL lists files that do not exist (install would fail)")

    def test_shell_and_worker_are_in_the_build_hash(self):
        hashed = build_hash_inputs()
        self.assertTrue(hashed, "no BUILD=$(cat ...) line in pages.yml")
        not_hashed = sorted(set(shell_files()) - hashed)
        self.assertEqual(not_hashed, [], "shell files missing from the BUILD hash in pages.yml (stale cache)")
        self.assertIn("sw.js", hashed)
        self.assertEqual(
            sorted(f for f in hashed if not (ROOT / f).is_file()), [], "pages.yml hashes missing files"
        )
        self.assertTrue(
            {f for f in hashed if f.startswith("img/cantons/")} >= {f"img/cantons/{c}.svg" for c in V.REGIONS}
        )

    def test_makefile_knows_the_shell_files(self):
        web = makefile_var("WEB_FILES")
        # Plain entries must exist; a glob (e2e/*.js) must match at least one file, or prettier gets the
        # literal pattern and fails.
        missing = [f for f in web if not (ROOT / f).is_file() and not (("*" in f) and list(ROOT.glob(f)))]
        self.assertEqual(missing, [], "WEB_FILES lists missing files")
        m = re.search(r"^\tnode --check (.+)$", MAKEFILE, re.M)
        self.assertTrue(m, "node --check line not found in the lint target")
        checked = set(m.group(1).split())
        shell_js = {f for f in shell_files() if f.endswith(".js")}
        self.assertEqual(sorted(shell_js - checked), [], "shell scripts not syntax-checked by make lint")
        self.assertIn("sw.js", checked)
        self.assertEqual(sorted(shell_js - set(web)), [], "shell scripts not in WEB_FILES (prettier)")


if __name__ == "__main__":
    unittest.main()


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
    """scripts/smoke.sh must load every public page of the repo root, or a new page ships untested."""

    def test_every_root_page_is_smoke_tested(self):
        smoke = (ROOT / "scripts" / "smoke.sh").read_text(encoding="utf-8")
        m = re.search(r"^for page in (.+?); do$", smoke, re.M)
        self.assertIsNotNone(m, "smoke.sh has no `for page in … ; do` loop")
        tested = set(m.group(1).split())
        pages = {p.name for p in ROOT.glob("*.html")}
        self.assertEqual(
            sorted(pages - tested), [], f"add these pages to the smoke loop: {sorted(pages - tested)}"
        )
