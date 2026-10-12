# Jahgenda – project rules for Claude

Jahgenda is a static agenda of reggae, dub and ska shows in Switzerland (GitHub Pages). The data is not
written by code but by Claude Code skills that run as routines. Read `README.md` first – it explains the
layout. The site UI is German; code, docs and config are English.

## Who owns what

- **Humans own:** `scraper/criteria.md`, `scraper/bands.md` (except the _Suggestions_ section),
  `scraper/sources.json`, `index.html`, `style.css`, `app.js`, `pwa.js`, `sw.js`, `README.md`, `CLAUDE.md`.
  Skills never change these files – with one exception: skills may append lines under _Suggestions_ in
  `bands.md`.
- **Skills own:** `data/shows.json`, `data/artists.json`, `data/runs.json`, `data/status.json` (heartbeat). Humans may correct them;
  skills respect hand corrections (`"source": "manual"` in artists.json).
- **Humans also own:** `data/genres.json` (allowed genre slugs, labels, filter order — single source of truth
  for validator, scraper and page) and `store.js` (every client-side persistence goes through `window.jahStore`;
  never call localStorage directly, so the backend can be swapped later).
- **Shared:** `data/venues.json` – humans maintain venues (coordinates, programme URL, `scrape` flag),
  skills add new venues they encounter but do not change existing ones.

## Iron rules for skills

1. **Never invent.** Every show needs a `source_url` – the page where it was found – and a venue in
   `data/venues.json`.
2. **`scraper/bands.md` beats `scraper/criteria.md` beats own judgement.**
3. **Before every commit:** `python3 scripts/format_data.py && python3 scripts/validate_shows.py` must
   pass. Otherwise commit nothing.
4. **Every run leaves a trace:** an entry in `data/runs.json` (what was found, what was dropped and why,
   which sources could not be loaded) and the heartbeat `data/status.json`. Commit even when nothing
   changed; on failure commit `status.json` with `"ok": false`. This is what `log.html` and the watchdog show.
5. **Commit only `data/*` and `scraper/bands.md` (Suggestions).** Everything else is off limits.
6. **When in doubt, leave it out.** One show too few beats one invented or wrong show.
7. **Do not work around bot protection.** A blocked source is skipped and logged.

## Commands

```sh
make              # help: all targets
make check        # lint + validate + test – must be green before every commit
make serve        # view the page locally (http://localhost:8000)
make scrape       # run the scraper now (Claude Code, subscription)
make e2e          # Playwright end-to-end tests (e2e/, desktop + iPhone) – own CI job, not part of check
```

Skills: `/scrape-shows` (update shows), `/harvest-bands` (suggest bands from festival line-ups).
Tests: `make test` (`python3 -m unittest discover -s tests`). Every commit on `main` must pass `make check`.

## Setup and decisions (so nothing gets lost)

- **Owners:** Kusi (markus.baumgartner@gmail.com, GitHub `markusbaumg`) and Seraina. Site UI German, everything
  else English. Kusi is called "Kusi" on the site, never "Markus".
- **Repo / live / board:** github.com/markusbaumg/jahgenda · https://markusbaumg.github.io/jahgenda/ ·
  project board https://github.com/users/markusbaumg/projects/2 (public; columns Backlog / Let's Build /
  In progress / In review / Done; every story has an area prefix `scraper:` `data:` `ui:` `ops:` `docs:`
  and matching labels; keep it in sync with real work).
- **Routines (Claude Code cloud, personal Max subscription, not the API):** "Jahgenda – Shows (täglich)"
  `trig_01P5hw7jkjp8WJuw1tDH4Djx`, cron `0 4 * * *` UTC (06:00 Zurich), model claude-sonnet-5-5, prompt runs
  `/scrape-shows`; "Jahgenda – Bands (monatlich)" `trig_01XcTRA8vUt2huXiva3SSP1K`, cron `0 5 1 * *`. Environment
  `env_01DjniiwyKBnsHAzi1ECBn9P` ("Default") must have **Network access = Full**, otherwise WebFetch fails with
  ENOTFOUND (first run failed exactly like that). Fallback: `make cron-install` (launchd 06:10 on the Mac).
- **Monitoring:** `.github/workflows/watchdog.yml` + `scripts/check_freshness.py` (daily 08:17 Zurich): stale
  > 36 h or `status.json` ok:false → issue labelled `scraper-failed`; README badges. Skills write
  > `data/status.json` every run and commit even without changes.
- **Scraper proof:** a local run (`claude -p "/scrape-shows"`, branch `scrape-test`, worktree
  `../reggae-scrape-test`) found 29 real shows with sources, coordinates and genres — the skill works; the
  cloud run only lacks network access.
- **Data rules:** genres only from `data/genres.json` (its order = filter order); Seraina's core list is
  reggae, ska, rocksteady, ska-punk, dub — dancehall is included, open question whether it stays. Nearby places abroad
  (criteria.md → Nearby) use country codes D/F/I/A/FL as `canton`. Every show needs `source_url` and a venue in
  `data/venues.json`. Optional `tickets` link. Festivals: spec in `design/festival-spec.md` (end_date + days).
- **UI decisions:** dark warm theme, red #d8342f / gold #f2b632 / green #1e8f4e; logo #10 (Swiss cross on
  stripes, `img/logo/jahgenda.svg`); "Jahgenda" is always one word ("Jah" cream, "genda" gold); tricolor stripe
  top and bottom; dense list with zebra rows; canton coats of arms (click = filter); views Liste | Kalender |
  Karte with logo-striped map pins; Meine Shows (★ in the toolbar, Interessiert / Ich gehe, share link
  `#m=…`, .ics export); short per-show hashes in links; PWA with install banner ("Nie mehr fragen"); footer band
  "Über uns" with photo (red/gold/green ring) and a bottom bar with result count + data stamp; no link
  underlines; nearest-show hint links to the closest upcoming show.
- **Mischpult (owners' page):** `mischpult.html` is hidden (no links, noindex, not in robots.txt — a Disallow line would
  advertise it) — the overview of sources, prompt, rules and runs, plus the links to `log.html` and `review.html`.
  Never call it «admin» (scanners try that path first). Keep it unlinked from the public pages.
- **Design documents:** `design/logos.html` (picker), `design/festival-spec.md`, `design/pwa-spec.md`,
  `design/promo-plan.md` (domain jahgenda.ch is free; stickers; QR), `design/monitoring-plan.md`,
  `design/ui-revamp.md` (when the panel delivers). Promo concept for Seraina as a Claude artifact:
  https://claude.ai/artifact/V4gf752tMY4EaeDRgaaoAD
- **Tech decision (approved 2026-10-13):** the page migrates to **Svelte 5 + Vite** (components per
  design/ui-revamp.md, reactive store, vite-plugin-pwa, Vitest + Playwright mobile tests), still a static build
  on GitHub Pages; everything else (data contract, skills, validator, routines, watchdog) stays. Story #33 —
  starts right after the revamp (#21–#28) and the mobile gate (#32) are merged. Until then no new big vanilla
  features beyond what is already in flight. The migration also moves the page source from the repo root into
  `src/` (+ `public/` for static files; `data/`, `scraper/`, `scripts/`, `tests/`, `design/` stay) — not
  earlier, because the in-flight worktree branches edit the root files (Kusi, 2026-10-13).
- **Working style:** big features are built by background workflows in isolated worktrees
  (`.claude/worktrees/…`, gitignored) with a reviewer, then merged by hand into `main`; `make check` must be
  green before every push; GitHub Pages deploys every push to `main`.
