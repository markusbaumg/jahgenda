# Jahgenda

**All reggae, dub and ska shows in Switzerland in one place.**
A static site, kept up to date by AI agents, hosted on GitHub Pages.

[![Deploy](https://github.com/markusbaumg/jahgenda/actions/workflows/pages.yml/badge.svg)](https://github.com/markusbaumg/jahgenda/actions/workflows/pages.yml)
[![Scraper watchdog](https://github.com/markusbaumg/jahgenda/actions/workflows/watchdog.yml/badge.svg)](https://github.com/markusbaumg/jahgenda/actions/workflows/watchdog.yml)

**Live:** https://markusbaumg.github.io/jahgenda/ · **Board:** https://github.com/users/markusbaumg/projects/2

## What it is

Reggae shows in Switzerland are scattered over dozens of club websites, ticket shops and Facebook events.
Jahgenda collects them in a single fast list (UI in German, docs in English):

- grouped by month, past shows disappear automatically (can be shown on request)
- festivals as one multi-day entry (card with line-up by day, «läuft» while it runs)
- filters by canton (click a coat of arms to filter) and genre, full-text search
- genre chips per show, acts line for multi-band bills, canton coats of arms / country flags
- "In Kalender" (.ics), WhatsApp share and direct link per show; nearest-show hint from your location
- installable as an app on the phone (PWA: offline, own icon, update toast; the install sticker shows from
  the second visit and never over a panel or the map)
- subscribable calendar feeds: `webcal://markusbaumg.github.io/jahgenda/jahgenda.ics` (all shows) and
  `jahgenda-<canton>.ics` per canton — built by CI from `data/shows.json` on every deploy (`make ics`)
- no login, no ads, no tracking

The data is researched daily by a Claude Code agent (see [Scraper](#scraper)). What counts as reggae is a
text file anyone can edit.

Made by Kusi & Seraina.

## Layout of the repo

```
index.html                             The page: the Vite entry (head, inline slogans, mounts src/main.js). Built into dist/.
vite.config.js / package.json          Vite 6 + Svelte 5 build, pinned; the jahgenda-static plugin copies data/ and scraper/sources.json (for the Mischpult) and writes dist/style.css; vite-plugin-pwa writes sw.js + manifest.
src/styles/index.css                   The stylesheets in cascade order (imported by src/main.js; concatenated into dist/style.css for the static pages).
src/styles/tokens.css / base.css       Design tokens and the display face; reset, atmosphere, focus ring, stripes, column, skip links.
src/styles/links.css / motion.css      Link colours (late on purpose); motion, performance and the reduced-motion / contrast / forced-colours rules.
src/components/**/*.css                One stylesheet per part of the page, next to its components (header, filters, status, list, footer, mine, toast, festival, views).
src/main.js / src/App.svelte           Mounts the page: skip links, stripes, header, agenda, footer.
src/components/Header.svelte           Lockup, tagline and one of the slogans per load.
src/components/ShowList.svelte         Month sections with festival ghost rows.
src/components/DayGroup.svelte         One <section class="day"> per date with the shared date cell (HEUTE / MORGEN, weekend rule).
src/components/Row.svelte              One show: title, acts / line-up, meta line, coat of arms, star, actions.
src/components/Status.svelte           Loading skeleton, error state with retry, empty states.
src/components/Footer.svelte           «Über Jahgenda» and the bottom bar (result count, data stamp, links).
src/components/Icon.svelte             The inline SVG icons of the row actions.
src/components/festival/               Festival card parts: range date cell (LÄUFT), line-up by day, ghost row.
src/stores/agenda.svelte.js            The reactive store: shows + derived fields, genres, venues, filters, visible list.
src/stores/filters.svelte.js           Filter UI state: open panel, view, Wann range, position, active-filter pills, the URL hash.
src/components/filters/                The filter bar (search, Wo / Wann toggles, genre chips, panels), results row, empty state, past footer, URL / history glue.
src/stores/reveal.svelte.js            Deep links #<short>: scroll under the bar, highlight, stale-link note.
src/stores/feedback.svelte.js          Feedback words of the row actions («Kopiert» …) for 1.2 s; announced through live.svelte.js.
src/components/list/                   Row actions (.ics, Teilen, Link) and the stale-link note (LinkNote).
src/stores/marks.svelte.js             Meine Shows: marks (jahStore), star / state / undo, list mode, #m= links, list share + .ics.
src/components/mine/                   ★ toolbar toggle, list head («Zurück zur Agenda»), list panel, undo toast.
src/stores/views.svelte.js             Kalender / Karte state on top of ui.view: calendar month/day, list mode, pill/popup jumps.
src/components/views/                  Calendar (month grid, day list), MapView (Leaflet on demand, pins, clusters),
                                       scroll.js (scrolls the page makes itself).
src/stores/festival.svelte.js          Open line-ups (kept across re-renders, deep links).
src/components/callout/                One sticker for every nudge (Callout.svelte) and the nudges (install, subscribe): snooze or «Nie mehr zeigen».
src/stores/callout.svelte.js           The callout queue: one at a time, one nudge per visit, waits while the page is busy.
src/stores/history.js                  Back button (panels, Meine Shows, views, calendar/map jumps) and scroll restoration.
src/stores/live.svelte.js              Live regions: the results line (#results-live) and the feedback words (#feedback).
src/lib/index.js                       Pure helpers behind the link/file contract (short hashes, .ics, Google Calendar); tested in node.
src/lib/hash.js / text.js / geo.js     … split by topic: hashes and the hash parser, text/date helpers, distances.
src/lib/calendar.js                    … .ics / Google Calendar / SBB links, festival line-up text.
src/lib/dates.js / regions.js          … the formatters (in the page language) and calendar arithmetic; cantons, nearby places, region groups.
src/lib/search.js                      … search folding, aliases, the haystack per show.
src/lib/festival.js                    … festival rules: day count, calendar days, ghost months, line-up by day / «Tag offen».
src/lib/load.js                        … the one fetch helper (data/*.json paths, raw.githubusercontent.com) for the agenda and the Mischpult.
src/lib/health.js / drops.js           … Mischpult: the watchdog verdict (mirrors check_freshness.py), the dropped-candidate dedupe
                                       (mirrors quality_review.py) and the «Gehört rein» issue link.
src/lib/markdown.js                    … minimal, escaping Markdown renderer for the repo files the Mischpult shows.
src/i18n/core.js                       Languages (see «Languages»): the locale, t(key, params) with plurals, the Intl date formatters.
src/i18n/i18n.svelte.js                … the runes store: first-visit choice, the switch (jahStore «lang»), <html lang> and the head.
src/i18n/de.js / fr.js / en.js         … the message tables: German is the source, French and English translate it.
src/components/LangSwitch.svelte       The DE · FR · EN switch at the end of the footer's link line.
public/                                Static files, copied as they are into dist/ (img/, fonts, robots.txt, the pages below).
public/store.js                        Client storage abstraction (marks, view, banner) — localStorage today, swappable later.
src/sw.js                              Service worker source (vite-plugin-pwa injectManifest → dist/sw.js): shell precache, data network-first (4 s).
src/stores/pwa.svelte.js               PWA glue: worker registration and the «Neue Version» state; the manifest is in vite.config.js.
src/components/pwa/UpdateToast.svelte  The «Neue Version von Jahgenda · Aktualisieren» toast.
mischpult.html                         The Mischpult, the owners' console (second Vite entry, hidden, noindex): Status, Läufe,
                                       Aussortiert, Quellen & Venues, Prompt & Regeln, Genres – tabs by hash (#status …).
src/mischpult/main.js                  Its entry: mounts Mischpult.svelte, imports style.css (tokens) + mischpult.css (its own).
src/mischpult/Mischpult.svelte         The tab shell (WAI-ARIA tablist, hash routing, old anchors) and the data loading.
src/mischpult/sections/                One component per tab (Status, Runs, Dropped, Sources, Prompt, Genres).
src/mischpult/format.js                de-CH stamps, «vor 3 h», runner / skill / source-status wording.
public/log.html                        Redirect to mischpult.html#laeufe (the scraper log moved into the Mischpult).
public/review.html                     Redirect to mischpult.html#aussortiert (the dropped candidates moved there too).
public/img/fonts/jahdisplay.woff2      Display face (Anton subset, OFL): wordmark, day numbers, month heads.
dist/                                  The build (gitignored): what `make build` writes and GitHub Pages serves.
data/shows.json                        The shows. Written by the scraper.
data/venues.json                       Venue database: coordinates, canton, programme URL, scrape flag, scraper notes.
data/venues.web.json                   Derived by format_data.py: the venues trimmed to what the page reads (city, lat, lon, url).
data/genres.json                       Allowed genre slugs with labels, in filter display order. Single source of truth.
data/artists.json                      Genre cache per act (Wikipedia / band website).
data/runs.json                         One entry per scraper run (counts, failed sources, dropped candidates).
data/slogans.json                      Taglines (stickers; the same list is inline in index.html for the header).
data/status.json                       Heartbeat of the last run (ok, at, counts). Written by every skill run.
scraper/criteria.md                    What counts as reggae? Nearby places abroad.
scraper/bands.md                       Which bands are in, which are out, suggestions to review. Hand-curated.
scraper/sources.json                   Agenda sites, festivals, nearby regions, search queries.
.claude/skills/scrape-shows/           The scraper itself: a Claude Code skill (a prompt), not code.
.claude/skills/harvest-bands/          Collects acts from festival line-ups as suggestions for bands.md.
scripts/validate_shows.py              Validates data/*.json. Runs in CI and at the end of every scraper run.
scripts/format_data.py                 Canonical formatting of data/*.json (small diffs); writes data/venues.web.json.
scripts/check_freshness.py             Watchdog: data stale or last run failed → GitHub issue `scraper-failed`.
scripts/check_venues.py                Re-checks venue coordinates against OpenStreetMap (make venues-check).
scripts/smoke.sh                       Loads the built pages (dist/) in headless Chrome, fails on JS errors (make check).
scripts/make_icons.sh                  Renders the PWA icons from public/img/logo/jahgenda.svg.
scripts/make_ics.py                    Builds the subscribable calendar feeds (jahgenda.ics + one per region) before deploy.
scripts/make_stickers.py               Renders the promo stickers in design/stickers/ (make stickers).
scripts/quality_review.py              Weekly issue listing what the scraper dropped (false-negative review).
scripts/ghapi.py                       Shared by the two above: repo/token env, ISO timestamp parser, GitHub REST call.
scripts/launchd/                       Local fallback job for the daily scrape (macOS launchd).
tests/                                 Unit tests (python3 -m unittest, node --test for src/lib).
e2e/                                   End-to-end tests in a real browser (Playwright against vite preview; make e2e).
design/                                Logo variants, festival spec, other design documents (the HTML pages are copied into dist/design).
.github/workflows/pages.yml            Validates data, builds dist/ (vite, service worker with the injected shell list, .ics feeds), deploys on every push to main.
.github/workflows/validate.yml         CI: `make ci` (lint, validate, test, build, smoke, format check) + e2e job on every push and PR.
.github/workflows/quality-review.yml   Mondays: scripts/quality_review.py opens the review issue (label quality).
.github/workflows/watchdog.yml         Daily freshness check → issue + badge.
Makefile                               Everything you can run: `make` shows the help.
```

### Filters

Search (band, club, town — accents, umlauts and the spoken short names fold: geneve = Genève, Züri = Zürich),
one genre chip (order and labels from `data/genres.json`; the count on every chip is what a tap on it yields
under the other filters), and two dropdown panels hanging from the sticky toolbar — only one is open at a
time, closed with ×, Escape, the button, a tap outside or the Back button. The active filters live in the
URL hash (`#q=…&g=ska&f=festival&wo=ZH,BE&r=25&wann=weekend`), so a filtered view survives a reload, can be
bookmarked and sent with «Link zu dieser Auswahl»:

- **Wo** — cantons are multi-select chips with counts, grouped Deutschschweiz · Romandie · Ticino · Grenznah
  (D/F/I/A/FL), cantons without an upcoming show left out; the canton badge in a row toggles the same filter.
  **Mein Standort** asks the browser for the position (only on a tap – on start just silently when the
  browser already allows it; never stored or sent anywhere) and enables a radius (10/25/50 km), distances in
  every row with a hover-only **SBB** badge (timetable from the nearest town in `venues.json` to the show's
  town, arrival one hour before the show — `lib.sbbUrl`, tested; also an «SBB» action in the row for touch
  screens) and a «Distanz & Zug anzeigen» placeholder while the position is unknown.
- **Wann** — Heute / Morgen / Wochenende / 7 Tage, or any set of months picked on a clickable month
  histogram (bars = number of shows after the other filters; past months dimmed and switching past shows on).
  The badge in the toolbar names the active choice; nothing is stored across visits. Past shows can also be
  opened from the last row under the list («↑ n vergangene Shows anzeigen»).

Every active filter is a removable gold pill under the results row («Dub ✕ · Bern ✕ · Wochenende ✕»,
«Alles zurücksetzen» from two on). When nothing matches, the empty state names the cause («Kein Dub im
Tessin») and offers each removal with what it yields, the richest first. Links: `#<short hash>` (a show),
`#m=…` (a shared list) and `#view=calendar|map` — combinable with `&`, parsed by one `parseHash()`; a stale
show link says that the show is gone instead of silently showing everything. After every re-render the
keyboard focus returns to the same control (row + action, canton badge, view button), or to the filter pills
line as the fallback — never to `<body>`.

The list itself is time-aware: inside a month the rows are grouped by day (one date cell per day), today and
tomorrow carry a red HEUTE / MORGEN pill (only while the data is fresher than 48 h), the Fr–So of the coming
weekend are red with a «Wochenende» rule before them, and past rows are muted with the word «vorbei».

**Festivals** (`design/festival-spec.md`): a show with `end_date` is one range entry – a card with a tricolor
top edge and the cross mark as a watermark, sitting in its start month with a «FR–SO» / «16–18» date cell
(«LÄUFT» while it runs) and a ghost row «↳ … läuft noch bis So 1. Aug.» under the head of every later month it
reaches into. Shows with six or more acts show the first four and fold the rest into «▸ Alle 12 Acts nach
Tag» (per day from `days`, a search hit opens it). «Festival» is a format chip of its own next to the genres,
calendar export and Google link span the whole range, calendar dots and map pins use the gold festival role.

### Views

The filtered shows are available as **Liste**, **Kalender** or **Karte** (switch above the list; the browser
remembers the choice and the Back button returns from a switch; the result count stands next to the switch
and, with the month span and the data stamp, in the footer bar). The calendar is a month grid (Mo–So, ‹ ›
and "Heute", the month in the display face on the tricolor rule, today with a gold ring) with one pill per
show (genre colour, «★» and green for «Ich gehe»); on the phone it becomes a compact grid with dots and the
list of the tapped day below. The map (rounded frame) loads Leaflet 1.9.4 and OpenStreetMap tiles on first
open only – offline it says «Karte braucht Netz» and points to the list – shows one striped pin per venue
(popup with the shows there; gold centre = festival, star = «Ich gehe»), your own location on request, and
shows without coordinates below under "Ohne Standort". A tap on a show in the calendar or the map jumps to
its row in the list.

**Motion and performance** (`design/ui-revamp.md` §4): every duration is a token (`--t-1` … `--t-4`,
`--ease-tape`, `--ease-skank`, `--stagger`), all set to 0 ms under `prefers-reduced-motion` – the top
stripe draws in once on load, the first ten rows enter staggered after a filter change (inside a view
transition where the browser has one, else an opacity dip), the fader / echo on marking, a gold hairline
under a stuck month head, the pulsing ring while the position is being located, the install sticker that
slides in with the skank ease and can be swiped away. Month sections use `content-visibility: auto`; the
canton coats of arms are svgo-optimised and the service worker precaches only the ones that occur in
`data/shows.json`; the display face is a 9 KB self-hosted subset, preloaded. `prefers-contrast: more` and
`forced-colors` get their own rules, and at 200 % zoom (viewports under 500 px high) the bar unsticks.

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
            │ skill scrape-shows       │ ◄── scraper/criteria.md   (what counts? nearby?)
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
  `scripts/validate_shows.py` checks the shape of `status.json` like that of the other data files, so a
  malformed heartbeat cannot be committed and silently blind the watchdog.
- **Watchdog:** `.github/workflows/watchdog.yml` runs daily at 08:17 Zurich (after the routine) and again at 14:17 (GitHub sometimes skips a scheduled fire) and executes
  `scripts/check_freshness.py`: if the newest scrape-shows timestamp (status.json while it holds the
  scrape-shows heartbeat, the newest scrape-shows run, shows.json `updated` – a harvest-bands run or a hand
  correction with runner `manual` does not count) is older than 36 h, the newest scrape-shows run reported
  failure (`ok: false` in status.json or in its runs.json entry), or shows.json is empty, it opens (or comments on) one issue labelled `scraper-failed`, @-mentions the owner
  and turns the badge above red; when healthy again it closes the issue. `make watchdog` runs the same check
  locally without touching GitHub.
- **Where to look:** the badge, the `scraper-failed` issue, the Mischpult (below), and the routine's own run
  log at https://claude.ai/code/routines.
- **Mischpult (the owners' console, hidden):** https://markusbaumg.github.io/jahgenda/mischpult.html is one
  Svelte page (second Vite entry, `src/mischpult/`) with six tabs, each reachable by hash: **Status** (`#status`:
  the heartbeat, the watchdog verdict mirrored from `check_freshness.py` – red when the data is older than 36 h or
  the last run said `ok: false` – the data stamp, links to the routines and the `scraper-failed` issues),
  **Läufe** (`#laeufe`: every run of `runs.json`, collapsible, with the per-source table), **Aussortiert**
  (`#aussortiert`), **Quellen & Venues** (`#quellen`), **Prompt & Regeln** (`#prompt`: SKILL.md, criteria.md,
  bands.md and sources.json read from raw.githubusercontent.com) and **Genres** (`#genres`). `log.html` and
  `review.html` are redirects to `#laeufe` / `#aussortiert`, so old links and issues still land. The console is
  not linked from any public page, carries `noindex` (and `no-referrer`), is never precached by the service
  worker, and is deliberately _not_ listed in `robots.txt` (a `Disallow` line would advertise the URL to
  scanners). The name is Swiss German for «mixing desk» — we avoid `admin`, the first path every automated
  scanner tries. Rename = move the entry and update `vite.config.js` (input, globIgnores), `scripts/smoke.sh`,
  the redirects, `tests/test_contract.py`, this section and CLAUDE.md.
- **Quality (false positives/negatives):** the Mischpult's «Aussortiert» tab lists every candidate the scraper
  looked at and dropped, with date, venue, source link and reason – once per candidate, deduped across runs like
  the weekly issue (`src/lib/drops.js` mirrors `quality_review.py`; «Jeden Lauf einzeln zeigen» lists every run);
  «Gehört rein» opens a prefilled GitHub issue. Every
  Monday `.github/workflows/quality-review.yml` opens one `quality` issue summarising the week's dropped
  candidates and failed sources, so the check is never forgotten (`make quality-review` previews it). Details and alternatives (ntfy/Telegram) in `design/monitoring-plan.md`.

### When a run fails

- **Nothing breaks.** A failed run commits nothing; the page keeps showing the last good state
  (`Stand: …` in the footer). The browser hides past shows anyway.
- **Where to look:** https://claude.ai/code/routines → routine → last run → log. Or the Mischpult's «Läufe» tab
  (`mischpult.html#laeufe`) if the run got as far as writing `data/runs.json`.
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
| `genres`     | no            | Max. 3 slugs from `data/genres.json`                                                 |

`source` is `mock` (sample data, the page shows a notice) or `scraper`.

`data/venues.json`: `{ "venues": { "Dachstock": { "city": "Bern", "canton": "BE", "lat": 46.953, "lon": 7.4407,
"url": "https://www.dachstock.ch/events", "scrape": true, "hint": "…" } } }` – `scrape: true` means the
scraper reads this venue's programme on every run; `hint` tells it where the events are on the page.

`data/artists.json`: `{ "artists": { "Dub Inc": { "genres": ["reggae", "dub"], "source": "https://fr.wikipedia.org/wiki/Dub_Inc",
"checked": "2026-10-13", "festivals": ["Summerjam 2026"], "tour_checked": "2026-10-13" } } }` – `source`
may be `manual` for hand corrections, which the scraper then never changes.

`data/runs.json`: one entry per scraper run (counts, failed sources, dropped candidates with reasons). Shown
in the Mischpult (tabs Läufe and Aussortiert).

Check everything: `make validate` (strict: `make validate-strict`). Format: `make fmt-data`.

## Development

```sh
make              # help: all targets
make dev          # Vite dev server with hot reload on http://127.0.0.1:5173 (data/ served from the repo)
make build        # npm ci + vite build → dist/ (data/ copied, sw.js + manifest by vite-plugin-pwa)
make serve        # the production build on http://127.0.0.1:4173 (vite preview)
make check        # lint + validate + test + build + smoke – must be green before every commit
make deploy       # check, commit, push → GitHub Pages deploys
make icons        # re-render PWA icons from public/img/logo/jahgenda.svg
make status       # last deploys and the last scraper run
```

The page is Svelte 5 (runes) + Vite 6: the source lives in `src/`, static files in `public/`, the build in
`dist/` (gitignored). Dependencies are pinned in `package.json` (`npm ci`); beyond Node 22+ you need Python 3
(scripts, tests, validator) and the GitHub CLI for `make status`. `data/` stays at the repo root as the
scraper's contract – the build copies it into `dist/data`, the dev server serves it from the repo.

### End-to-end tests

`e2e/` is a small [Playwright](https://playwright.dev) project that drives the real page in a browser:
desktop Chrome (1280×800) and an iPhone 13 emulated in Chromium. One spec per area – list, search and
genre chips, the Wo and Wann panels, the three views (the map really loads Leaflet), Meine Shows with
share link and `.ics` download, the phone layout of the row actions, mocked geolocation, every page loading without console errors, and the
Mischpult (`pages.spec.js`: tabs by hash and keyboard, the watchdog colours, deduped «Aussortiert» and the
«Gehört rein» link, the log/review redirects, hidden from the public page). The interaction tests run
against a fixture served in place of `data/shows.json` (dates relative to today), so they do not depend
on what the scraper found; the load and console checks use the real data.

```sh
make e2e                                   # build, npm ci, download Chromium, run the suite (vite preview of dist/ on :4173)
cd e2e && npx playwright test --project="iPhone 13" tests/phone.spec.js   # one project / one file
cd e2e && npx playwright test --ui          # Playwright's UI mode
cd e2e && node adhoc.js https://markusbaumg.github.io/jahgenda/ shot.png   # ad-hoc script against any URL
```

`make e2e` is not part of `make check` (browser download, network for Leaflet and tiles); CI runs it as
its own job in `validate.yml` and uploads the report and traces when it fails.

### Changing the logo

Logo #10 (Swiss cross on red/gold/green stripes) is active: `public/img/logo/jahgenda.svg` is referenced in
the header (`src/components/Header.svelte`) and the Mischpult, as favicon, in the sticky bar and in
the manifest (`vite.config.js`) / the PWA icons (`make icons` re-renders those). All ten variants live in
`public/img/logo/NN-name.svg` (icon) and `NN-name-wordmark.svg` (icon + wordmark); the picker page is
`design/logos.html` (https://markusbaumg.github.io/jahgenda/design/logos.html). To switch: copy the chosen
icon over `public/img/logo/jahgenda.svg`, run `make icons`, commit.

### Languages

The agenda speaks German, French and English (story #48); the owners' console (`mischpult.html`; `log.html` and
`review.html` only redirect there) and the stickers stay German.

- **Which language:** `?lang=fr|en|de` (the hreflang alternates in `index.html`) → the visitor's choice in
  the DE · FR · EN switch (footer link line, saved in jahStore under `lang`) → on the first visit the browser's first
  language (`fr*` → French, `en*` → English) → German. The URL hash (filters, show links, `#m=` lists) never
  carries the language, so every link works in every language.
- **Where the words are:** `src/i18n/de.js` is the source (Swiss spelling, «Show»), `fr.js` and `en.js`
  translate it key by key; a key missing there falls back to German. Components call `t("key", params)`
  from `src/i18n/i18n.svelte.js`, plain modules (`src/lib`, stores) the same `t` from `src/i18n/core.js`.
  Dates go through the formatters in `src/lib/dates.js` (Intl, de-CH / fr-CH / en-GB).
- **Edit a string:** change the value in all three tables. Placeholders are `{name}`; a plural is
  `{ one: "{n} Show", other: "{n} Shows" }` (picked by `params.n`); grammar that a template cannot carry
  (French prepositions: «au Tessin», «à Genève») is a function `(params) => string`.
- **Add a string:** add the key to `de.js`, `fr.js` and `en.js`, then use `t("area.name")` in the
  component (literal key, so the e2e scan in `e2e/tests/i18n.spec.js` knows it). Canton names are
  `region.<code>` in fr / en (German: `src/lib/regions.js`).
- **Taglines:** `data/slogans.json` has `slogans` (German, also the stickers) and `fr` / `en`; the same
  lists sit inline in `index.html` (`#slogans`, `#slogans-fr`, `#slogans-en`) – `tests/test_contract.py`
  keeps them equal, the validator checks all three.
- **Head and app:** `<html lang>`, description, og/canonical follow the language at runtime; the build
  writes `manifest.webmanifest` (German) plus `manifest.fr.webmanifest` / `manifest.en.webmanifest`
  (`vite.config.js`, name and description from the tables).

### Contributing (for Seraina and everyone else)

You can shape the agenda without touching code – four text files:

1. `scraper/criteria.md` – what counts as reggae, which places abroad count.
2. `scraper/bands.md` – move a band to _Included_ or _Excluded_; review the _Suggestions_ the harvester adds.
3. `data/venues.json` – add a venue (name, city, canton, coordinates, programme URL).
4. `data/genres.json` – allowed genre slugs, labels and filter order.

Edit on GitHub, commit to `main`, done. The next scraper run picks it up; the validator stops anything
that would break the page.

## Location

The distance feature asks the browser for your location. It is used only in the browser and never
stored or sent anywhere. The same goes for the "Meine Shows" marks (localStorage only).

## Meine Shows (personal list)

The star on every show marks it (**Gemerkt: Interessiert**, gold); a marked row shows a two-segment toggle
**Interessiert / Ich gehe** (green = going). Tapping the star again un-marks the show, with a «Rückgängig»
toast to undo. The ★ button in the toolbar is always there (muted with «0» until something is marked); it
opens the list mode with only the marked shows (past ones stay marked but are hidden as usual). In that view:

- **Kalender exportieren (.ics)** – one file with all marked shows ("Ich gehe" as confirmed, "Interessiert" as tentative).
- **Liste teilen** – copies a link of the form `…/#m=<short>g,<short>i` (short per-show hashes, g = going,
  i = interested; old `#mine=<id>:g,…` links still resolve), plus a WhatsApp button with the same link.
  Whoever opens it sees only those shows, with the friend's "Ich gehe" marks as a chip "geht hin";
  nothing is written into their own list. «Zurück zur Agenda» (✕) leaves the shared view.

Marks live only in the browser (`localStorage`, key `jahgenda.marks`) – no account, no server, nothing is
transmitted. Without `localStorage` everything still works; marks then last until the next reload.

## Roadmap

See the [project board](https://github.com/users/markusbaumg/projects/2) and the
[issues](https://github.com/markusbaumg/jahgenda/issues).
