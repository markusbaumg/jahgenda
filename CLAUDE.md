# Jahgenda – Projektregeln für Claude

Jahgenda ist eine statische Agenda für Reggae-, Dub- und Ska-Konzerte in der Schweiz (GitHub Pages,
https://markusbaumg.github.io/jahgenda/). Kein Framework, kein Build-Schritt: `index.html`, `style.css`, `app.js`
lesen `data/shows.json`. Die Daten werden nicht von Code, sondern von Claude-Code-Skills recherchiert, die als
Routinen laufen. Lies zuerst `README.md` – dort stehen Aufbau, Datenformat und der Ablauf des Scrapers.

## Was wem gehört

- **Menschen gehören:** `index.html`, `log.html`, `style.css`, `app.js`, `design/`, `img/`, `scripts/`, `tests/`,
  `Makefile`, `.github/`, `README.md`, `CLAUDE.md`, `scraper/criteria.md`, `scraper/sources.json` und
  `scraper/bands.md` (ausser dem Abschnitt «Suggestions»). Skills ändern diese Dateien nie – mit einer Ausnahme:
  Skills dürfen Zeilen unter «Suggestions» in `bands.md` anhängen. Die drei `scraper/`-Dateien sind auf
  Englisch (sie sind Teil der englischen Skill-Prompts).
- **Skills gehören:** `data/shows.json`, `data/artists.json`, `data/runs.json`. Menschen dürfen sie korrigieren;
  Skills respektieren Handkorrekturen (`"source": "manual"` in `artists.json`, siehe SKILL.md).
- **Geteilt:** `data/venues.json`. Menschen pflegen Programm-URLs, Hinweise und das `scrape`-Flag; Skills tragen
  neue Venues mit Koordinaten ein, wenn sie eine Show an einer unbekannten Venue finden, ändern aber keine
  bestehenden. Jede gescrapte Show braucht hier einen Eintrag – der Validator erzwingt das.

## Eiserne Regeln für Skills

1. **Nichts erfinden.** Jede Show braucht eine `source_url` – die Seite, auf der sie gefunden wurde.
2. **`scraper/bands.md` schlägt `scraper/criteria.md` schlägt eigenes Urteil.**
3. **Vor jedem Commit:** `python3 scripts/validate_shows.py` (streng, ohne `--allow-past`) muss durchlaufen.
   Sonst nichts committen.
4. **Jeder Lauf hinterlässt eine Spur:** ein Eintrag in `data/runs.json` (was gefunden, was verworfen und warum,
   welche Quellen nicht geladen werden konnten). Das ist das öffentliche Log – es wird auf `log.html` angezeigt.
5. **Nur `data/*` und `scraper/bands.md` (Suggestions) committen.** Alles andere ist tabu. Vor dem Commit
   `python3 scripts/format_data.py` (kanonische Form, kleine Diffs), dann der Validator.
6. **Im Zweifel weglassen.** Lieber eine Show zu wenig als eine erfundene oder falsche.

## Regeln für Code-Änderungen (Menschen und Claude-Sessions am Code)

- **Jeder Commit muss `make check` bestehen** (Lint, Validator, Tests, Datenformat). Das ist auch, was die CI
  auf jedem Push ausführt (`make ci`).
- Kein Framework, kein Build-Schritt, keine Laufzeit-Abhängigkeiten. Python bleibt stdlib-only; prettier und
  live-server laufen über `npx`, ruff ist optional.
- Code-Stil: vanilla JS als IIFE in `app.js`, CSS-Variablen in `style.css`, UI-Texte auf Deutsch, dunkles warmes
  Design (Rot/Gold/Grün). Formatierung macht `make fmt` (prettier 110 Zeichen, ruff), nicht die Hand.
- Skills (`.claude/skills/*/SKILL.md`) nur ändern, wenn der Ablauf des Scrapers gemeint ist – und dann README
  und Validator mitziehen.

## Befehle

```sh
make              # Hilfe mit allen Zielen
make serve        # Seite lokal: http://localhost:8000   (make dev = mit Auto-Reload)
make check        # Lint + Validator + Tests + Datenformat – vor jedem Commit
make test         # nur die Unit-Tests (python3 -m unittest discover -s tests)
make validate     # nur die Daten (--allow-past); make validate-strict = wie im Scraper
make fmt          # prettier + ruff + data/*.json normalisieren
make scrape       # /scrape-shows headless ausführen; make harvest = /harvest-bands
make cron-install # launchd-Job: täglich 06:10 make scrape auf diesem Mac (Fallback zur Cloud-Routine)
make deploy       # check, committen, pushen → GitHub Pages
```

Skills: `/scrape-shows` (Konzerte aktualisieren, täglich), `/harvest-bands` (Bands aus Festival-Line-ups
vorschlagen, monatlich).

## Testen

- `make test`: `tests/test_validate.py` (Validator und Formatierer am Repo-Datenstand), `tests/test_criteria.py`
  (Genre-Slug-Parsing aus `criteria.md`, Detailregeln), `tests/test_format_data.py` (Formatierer-Randfälle).
  Die Tests laden die Skripte per Pfad – kein Paket, kein pytest nötig.
- Neue Prüfung im Validator → Test dazu. Neues Datenfeld → Validator, Formatierer (`*_ORDER`), README-Tabelle
  und Tests anpassen.
- Seite: `make serve` und im Browser bei 375 px Breite prüfen; Headless-Screenshot mit Chrome
  (`--headless=new --screenshot=… http://127.0.0.1:8000/`).
