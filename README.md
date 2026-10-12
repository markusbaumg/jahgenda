# Jahgenda

**All reggae, dub and ska shows in Switzerland in one place.**
A static site, kept up to date by AI agents, hosted on GitHub Pages.

[![Deploy](https://github.com/markusbaumg/jahgenda/actions/workflows/pages.yml/badge.svg)](https://github.com/markusbaumg/jahgenda/actions/workflows/pages.yml)
[![Scraper watchdog](https://github.com/markusbaumg/jahgenda/actions/workflows/watchdog.yml/badge.svg)](https://github.com/markusbaumg/jahgenda/actions/workflows/watchdog.yml)

**Live:** https://markusbaumg.github.io/jahgenda/ · **Board:** https://github.com/users/markusbaumg/projects/2 · **Scraper log:** https://markusbaumg.github.io/jahgenda/log.html

## What it is

Reggae shows in Switzerland are scattered over dozens of club websites, ticket shops and Facebook events.
Jahgenda collects them in a single fast list (UI in German, docs in English):

- grouped by month, past shows disappear automatically (can be shown on request)
- filters by canton (click a coat of arms to filter) and genre, full-text search
- genre chips per show, acts line for multi-band bills, canton coats of arms / country flags
- "In Kalender" (.ics), WhatsApp share and direct link per show; nearest-show hint from your location
- installable as an app on the phone (PWA: offline, own icon, update toast)
- subscribable calendar feeds: `webcal://markusbaumg.github.io/jahgenda/jahgenda.ics` (all shows) and
  `jahgenda-<canton>.ics` per canton — built by CI from `data/shows.json` on every deploy (`make ics`)
- no login, no ads, no tracking

The data is researched daily by a Claude Code agent (see [Scraper](#scraper)). What counts as reggae is a
text file anyone can edit.

Made by Kusi & Seraina.

## Layout of the repo

```
index.html / style.css / app.js        The page. No build step, no framework.
store.js                               Client storage abstraction (marks, view, banner) — localStorage today, swappable later.
pwa.js / sw.js / manifest.webmanifest  Installable app: install banner, offline cache, update toast.
log.html                               Public scraper log (renders data/runs.json).
data/shows.json                        The shows. Written by the scraper.
data/venues.json                       Venue database: coordinates, canton, programme URL, scrape flag.
data/genres.json                       Allowed genre slugs with labels, in filter display order. Single source of truth.
data/artists.json                      Genre cache per act (Wikipedia / band website).
data/runs.json                         One entry per scraper run (counts, failed sources, dropped candidates).
scraper/criteria.md                    What counts as reggae? Nearby places abroad. Allowed genre slugs.
scraper/bands.md                       Which bands are in, which are out, suggestions to review. Hand-curated.
scraper/sources.json                   Agenda sites, festivals, nearby regions, search queries.
.claude/skills/scrape-shows/           The scraper itself: a Claude Code skill (a prompt), not code.
.claude/skills/harvest-bands/          Collects acts from festival line-ups as suggestions for bands.md.
scripts/validate_shows.py              Validates data/*.json. Runs in CI and at the end of every scraper run.
scripts/format_data.py                 Canonical formatting of data/*.json (small diffs).
scripts/make_icons.sh                  Renders the PWA icons from img/logo/jahgenda.svg.
scripts/launchd/                       Local fallback job for the daily scrape (macOS launchd).
tests/                                 Unit tests (python3 -m unittest).
design/                                Logo variants, festival spec, other design documents.
.github/workflows/pages.yml            Validates data, stamps the service worker, deploys on every push to main.
.github/workflows/validate.yml         Validates on branches and pull requests.
Makefile                               Everything you can run: `make` shows the help.
```

### Views

The filtered shows are available as **Liste**, **Kalender** or **Karte** (switch next to the result count; the
browser remembers the choice). The calendar is a month grid (Mo–So, ‹ › and "Heute") with one pill per show;
on the phone it becomes a compact grid with dots and the list of the tapped day below. The map loads Leaflet
1.9.4 and OpenStreetMap tiles on first open only, shows one marker per venue (popup with the shows there),
your own location on request, and shows without coordinates below under "Ohne Standort". A tap on a show in
the calendar or the map jumps to its row in the list.

## Scraper

The scraper is not a classic program but a **Claude Code skill**: `/scrape-shows`. It describes step by
step how the agent reads the sources, decides what is reggae, looks up genres, logs the run, validates
the result and commits it.

```
            ┌──────────────────────────┐
  daily  →  │ Claude Code routine      │  (cloud, runs on the personal Claude subscription)
  06:00     │ prompt: "/scrape-shows"  │
            └────────────┬─────────────┘
                         │ clones the repo
                         ▼
            ┌──────────────────────────┐     scraper/bands.md      (who is in? – beats everything)
            │ skill scrape-shows       │ ◄── scraper/criteria.md   (what counts? genre slugs)
            │  1 read sources          │ ◄── scraper/sources.json  (where to look?)
            │  2 bands + criteria      │ ◄── data/venues.json      (venues, coordinates)
            │  3 look up genres        │ ◄── data/artists.json     (genre cache)
            │  4 merge + write         │ ──► Wikipedia / band websites
            │  5 log + validate        │ ──► scripts/validate_shows.py
            └────────────┬─────────────┘
                         │ git push main
                         ▼
            ┌──────────────────────────┐
            │ GitHub Pages workflow    │ validates again, deploys
            └──────────────────────────┘

  monthly ──► skill harvest-bands: festival line-ups (Summerjam, Reeds, Lakesplash, …)
              → new acts as "Suggestions" in bands.md + a GitHub issue to review them
```

Why this way?

- **Subscription instead of API.** Routines run as Claude Code sessions on the personal Claude plan; no
  API bill.
- **Prompt instead of parser.** Club websites change their layout all the time. An agent that reads a
  page like a human does not break on every redesign.
- **Criteria as text.** `scraper/criteria.md` is part of the prompt. Changing the definition of "reggae"
  means editing a text file.
- **Bands chosen by hand.** `scraper/bands.md` has three lists: _Included_, _Excluded_, _Suggestions_.
  Included always counts; Excluded never makes it into the agenda. The harvester only fills Suggestions;
  humans move the lines.
- **Genre cache.** Each act is looked up on Wikipedia / its website at most every 180 days; the result
  lives in `data/artists.json`. Hand corrections get `"source": "manual"` and are never touched again.
- **Nothing unvalidated goes live.** The validator runs at the end of every scraper run (strict) and
  again before the deploy (`--allow-past`, so a push on a day without a run does not fail on yesterday's
  shows). If it fails, the old page stays online.
- **No invented shows.** Every scraped show needs a `source_url` – the page where the agent found it –
  and a venue in `data/venues.json` so it has coordinates. The validator enforces both.
- **Nearby counts.** Konstanz, Lörrach, Annemasse, Como, Bregenz & co. (list in `criteria.md`) are searched
  too and shown with a country flag instead of a coat of arms.

### Routines (run on the Claude subscription)

The routines do not live in the repo but at https://claude.ai/code/routines (account
markus.baumgartner@gmail.com). Both clone this repo, need push rights on `main` (GitHub connection at
https://claude.ai/connect-github) and **network access = Full** on the cloud environment (claude.ai/code →
environment "Default" → Network access), otherwise every website fetch fails with ENOTFOUND.

| Routine          | Schedule                    | Prompt           |
| ---------------- | --------------------------- | ---------------- |
| Jahgenda – Shows | daily 06:00 (Europe/Zurich) | `/scrape-shows`  |
| Jahgenda – Bands | monthly, 1st at 07:00       | `/harvest-bands` |

Create or change them with `/schedule` in Claude Code, or in the web UI.

**Local fallback:** `make cron-install` installs a launchd job that runs `make scrape` on this Mac every day
at 06:10 (logs in `~/Library/Logs/jahgenda/`); `make cron-uninstall` removes it.

### Monitoring: how we know it ran

- **Heartbeat:** every run overwrites `data/status.json` (`ok`, `at`, counts, error) and prepends an entry to
  `data/runs.json`; the scraper commits even when nothing changed, and commits `ok: false` on failure.
- **Watchdog:** `.github/workflows/watchdog.yml` runs daily at 08:17 Zurich (after the routine) and executes
  `scripts/check_freshness.py`: if the newest timestamp is older than 36 h, the last run reported failure, or
  shows.json is empty, it opens (or comments on) one issue labelled `scraper-failed`, @-mentions the owner
  and turns the badge above red; when healthy again it closes the issue. `make watchdog` runs the same check
  locally without touching GitHub.
- **Where to look:** the badge, the `scraper-failed` issue, `log.html`, and the routine's own run log at
  https://claude.ai/code/routines.
- **Quality (false positives/negatives):** `review.html` lists every candidate the scraper looked at and
  dropped, with date, venue, source link and reason; «Gehört rein» opens a prefilled GitHub issue. Every
  Monday `.github/workflows/quality-review.yml` opens one `quality` issue summarising the week's dropped
  candidates and failed sources, so the check is never forgotten (`make quality-review` previews it). Details and alternatives (ntfy/Telegram) in `design/monitoring-plan.md`.

### When a run fails

- **Nothing breaks.** A failed run commits nothing; the page keeps showing the last good state
  (`Stand: …` in the footer). The browser hides past shows anyway.
- **Where to look:** https://claude.ai/code/routines → routine → last run → log. Or `log.html` on the site
  if the run got as far as writing `data/runs.json`.
- **Usual causes:** a source blocks (listed in the log under "Nicht erreichbar" – adjust or remove it in
  `sources.json` / `venues.json`), the validator fails (the message names file and field), the
  subscription limit is reached (the next run catches up), network access of the environment not Full.
- **Catch up by hand:** `make scrape` (or `claude` in the repo and type `/scrape-shows`).

### Running the scraper by hand

```sh
make scrape       # update shows (Claude Code, subscription)
make harvest      # suggest bands from festival line-ups
```

### Changing the scraper

| I want to …                              | File                                                          |
| ---------------------------------------- | ------------------------------------------------------------- |
| change what counts as reggae             | `scraper/criteria.md`                                         |
| include or exclude a band for good       | `scraper/bands.md`                                            |
| add an agenda site or a festival         | `scraper/sources.json`                                        |
| add a venue / fix coordinates / crawl it | `data/venues.json` (`make venues-check` verifies coordinates) |
| correct a wrong genre for an act         | `data/artists.json` (`"source": "manual"`)                    |
| change how the scraper works             | `.claude/skills/scrape-shows/SKILL.md`                        |
| add a check for the data                 | `scripts/validate_shows.py` + `tests/`                        |

## Data format

`data/shows.json`:

```json
{
  "updated": "2026-10-13T06:12:00+02:00",
  "source": "scraper",
  "shows": [
    {
      "id": "2026-10-16-alpine-dub-collective-bern",
      "date": "2026-10-16",
      "time": "20:30",
      "title": "Alpine Dub Collective + Support",
      "acts": ["Alpine Dub Collective", "Mista Sanchez"],
      "venue": "Dachstock",
      "city": "Bern",
      "canton": "BE",
      "url": "https://www.dachstock.ch/…",
      "tickets": "https://www.petzi.ch/…",
      "source_url": "https://www.dachstock.ch/events",
      "lat": 46.953,
      "lon": 7.4407,
      "genres": ["dub", "reggae"]
    }
  ]
}
```

| Field        | Required      | Meaning                                                                              |
| ------------ | ------------- | ------------------------------------------------------------------------------------ |
| `id`         | yes           | Stable: `date-slug-city`                                                             |
| `date`       | yes           | `YYYY-MM-DD`, local date                                                             |
| `time`       | no            | `HH:MM`                                                                              |
| `title`      | yes           | Act(s) / event name                                                                  |
| `acts`       | no            | Acts separately, headliner first                                                     |
| `venue`      | yes           | Must exist in `data/venues.json`                                                     |
| `city`       | yes           | Town                                                                                 |
| `canton`     | yes           | Canton code (`ZH`) or country code `D`, `F`, `I`, `A`, `FL` for nearby places abroad |
| `url`        | no            | Event page                                                                           |
| `tickets`    | no            | Ticket shop link                                                                     |
| `source_url` | for `scraper` | Page where the show was found                                                        |
| `lat`, `lon` | no            | Coordinates (from the venue), both or none                                           |
| `genres`     | no            | Max. 3 slugs from `data/genres.json`                    |

`source` is `mock` (sample data, the page shows a notice) or `scraper`.

`data/venues.json`: `{ "venues": { "Dachstock": { "city": "Bern", "canton": "BE", "lat": 46.953, "lon": 7.4407,
"url": "https://www.dachstock.ch/events", "scrape": true, "hint": "…" } } }` – `scrape: true` means the
scraper reads this venue's programme on every run; `hint` tells it where the events are on the page.

`data/artists.json`: `{ "artists": { "Dub Inc": { "genres": ["reggae", "dub"], "source": "https://fr.wikipedia.org/wiki/Dub_Inc",
"checked": "2026-10-13", "festivals": ["Summerjam 2026"], "tour_checked": "2026-10-13" } } }` – `source`
may be `manual` for hand corrections, which the scraper then never changes.

`data/runs.json`: one entry per scraper run (counts, failed sources, dropped candidates with reasons). Shown
on `log.html`.

Check everything: `make validate` (strict: `make validate-strict`). Format: `make fmt-data`.

## Development

```sh
make              # help: all targets
make serve        # http://localhost:8000
make dev          # live reload on http://127.0.0.1:5500 (npx live-server)
make check        # lint + validate + test – must be green before every commit
make deploy       # check, commit, push → GitHub Pages deploys
make icons        # re-render PWA icons from img/logo/jahgenda.svg
make status       # last deploys and the last scraper run
```

No dependencies beyond Python 3, Node (for prettier via npx) and the GitHub CLI.

### Changing the logo

Logo #10 (Swiss cross on red/gold/green stripes) is active: `img/logo/jahgenda.svg` is referenced in the
header of `index.html` and `log.html`, as favicon, in the sticky bar and in `manifest.webmanifest` / the PWA
icons (`make icons` re-renders those). All ten variants live in `img/logo/NN-name.svg` (icon) and
`NN-name-wordmark.svg` (icon + wordmark); the picker page is `design/logos.html`
(https://markusbaumg.github.io/jahgenda/design/logos.html). To switch: copy the chosen icon over
`img/logo/jahgenda.svg`, run `make icons`, commit.

### Contributing (for Seraina and everyone else)

You can shape the agenda without touching code – three text files:

1. `scraper/criteria.md` – what counts as reggae, which places abroad count, allowed genre slugs.
2. `scraper/bands.md` – move a band to _Included_ or _Excluded_; review the _Suggestions_ the harvester adds.
3. `data/venues.json` – add a venue (name, city, canton, coordinates, programme URL).

Edit on GitHub, commit to `main`, done. The next scraper run picks it up; the validator stops anything
that would break the page.

## Location

The distance feature asks the browser for your location. It is used only in the browser and never
stored or sent anywhere. The same goes for the "Meine Shows" marks (localStorage only).

## Meine Shows (personal list)

The star on every show has two levels: tap once = **Interessiert** (gold border), again = **Ich gehe**
(green border), a third tap clears it. As soon as something is marked, a star button with a counter appears
in the toolbar; it filters the list to the marked shows (past ones stay marked but are hidden as usual).
In that view:

- **Kalender exportieren (.ics)** – one file with all marked shows ("Ich gehe" as confirmed, "Interessiert" as tentative).
- **Liste teilen** – copies a link of the form `…/#m=<short>g,<short>i` (short per-show hashes, g = going,
  i = interested; old `#mine=<id>:g,…` links still resolve), plus a WhatsApp button with the same link.
  Whoever opens it sees only those shows, with the friend's "Ich gehe" marks as a chip "geht hin";
  nothing is written into their own list. «Filter zurücksetzen» leaves the shared view.

Marks live only in the browser (`localStorage`, key `jahgenda.marks`) – no account, no server, nothing is
transmitted. Without `localStorage` everything still works; marks then last until the next reload.

## Roadmap

See the [project board](https://github.com/users/markusbaumg/projects/2) and the
[issues](https://github.com/markusbaumg/jahgenda/issues).
