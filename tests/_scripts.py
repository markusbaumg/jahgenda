"""Load a script from scripts/ for a unit test.

The scripts are programs, not a package (`python3 scripts/<name>.py`), so the tests import them by path.
scripts/ goes on sys.path once, because the scripts import each other (ghapi.py, check_links.py) the way
they do when run from their own directory. The tests run as `python3 -m unittest discover -s tests`
(make test), which puts tests/ on sys.path so `from _scripts import load_script` resolves.
"""

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))


def load_script(name):
    """scripts/<name>.py as a fresh module object (its module-level code runs, `__main__` does not)."""
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
