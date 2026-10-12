# Jahgenda – project rules for Claude

Jahgenda is a static agenda of reggae, dub and ska shows in Switzerland (GitHub Pages). The data is not
written by code but by Claude Code skills that run as routines. Read `README.md` first – it explains the
layout. The site UI is German; code, docs and config are English.

## Who owns what

- **Humans own:** `scraper/criteria.md`, `scraper/bands.md` (except the *Suggestions* section),
  `scraper/sources.json`, `index.html`, `style.css`, `app.js`, `pwa.js`, `sw.js`, `README.md`, `CLAUDE.md`.
  Skills never change these files – with one exception: skills may append lines under *Suggestions* in
  `bands.md`.
- **Skills own:** `data/shows.json`, `data/artists.json`, `data/runs.json`. Humans may correct them;
  skills respect hand corrections (`"source": "manual"` in artists.json).
- **Shared:** `data/venues.json` – humans maintain venues (coordinates, programme URL, `scrape` flag),
  skills add new venues they encounter but do not change existing ones.

## Iron rules for skills

1. **Never invent.** Every show needs a `source_url` – the page where it was found – and a venue in
   `data/venues.json`.
2. **`scraper/bands.md` beats `scraper/criteria.md` beats own judgement.**
3. **Before every commit:** `python3 scripts/format_data.py && python3 scripts/validate_shows.py` must
   pass. Otherwise commit nothing.
4. **Every run leaves a trace:** an entry in `data/runs.json` (what was found, what was dropped and why,
   which sources could not be loaded). This is the public log shown on `log.html`.
5. **Commit only `data/*` and `scraper/bands.md` (Suggestions).** Everything else is off limits.
6. **When in doubt, leave it out.** One show too few beats one invented or wrong show.
7. **Do not work around bot protection.** A blocked source is skipped and logged.

## Commands

```sh
make              # help: all targets
make check        # lint + validate + test – must be green before every commit
make serve        # view the page locally (http://localhost:8000)
make scrape       # run the scraper now (Claude Code, subscription)
```

Skills: `/scrape-shows` (update shows), `/harvest-bands` (suggest bands from festival line-ups).
Tests: `make test` (`python3 -m unittest discover -s tests`). Every commit on `main` must pass `make check`.
