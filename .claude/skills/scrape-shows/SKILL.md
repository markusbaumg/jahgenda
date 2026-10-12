---
name: scrape-shows
description: Research upcoming reggae, dub and ska shows in Switzerland and update data/shows.json (plus the artist genre cache). Run by the daily routine; can also be run by hand with /scrape-shows.
---

# Scrape shows

You update the concert data of Jahgenda. The result of this run is a commit on `main` that changes
`data/shows.json` and `data/artists.json`. Nothing else in the repo is touched.

Work from the repository root. Today's date is what `date +%F` prints — use it, do not guess.

## 1. Load the inputs

1. `scraper/criteria.md` — the definition of what counts as reggae. **This file is authoritative.** Apply it
   literally; if it says a kind of event stays out, it stays out even if it looks interesting.
2. `scraper/bands.md` — the hand-curated band list. It overrides everything: an act under **Dabei** always
   counts, an act under **Nicht dabei** never does (drop its shows even if a venue lists them). Read the
   setting line `Vorschläge automatisch berücksichtigen: ja|nein` — it decides whether acts under
   **Vorschläge** are part of the watchlist search (step 2.4). Match names case-insensitively, ignoring
   anything after ` — `.
3. `scraper/sources.json` — agenda pages, venues (with canton + coordinates) and search queries.
4. `data/shows.json` — the current state. Keep every existing *future* show unless you find clear evidence
   that it was cancelled or moved. Existing `id`s must stay stable.
5. `data/artists.json` — the genre cache and watchlist. Look here first before researching an act.

## 2. Collect candidates

Go through the sources in this order and keep a scratch list of candidates (title, date, time, venue, city,
canton, url, source_url, acts).

1. **Agendas** (`agendas` in sources.json): open each one, filter for the genres in `criteria.md`,
   collect everything in Switzerland from today up to 12 months ahead.
2. **Venues** (`venues`): open each venue's programme page and pick the matching events. Use the venue's
   `canton`, `lat`, `lon` from sources.json for the entry.
3. **Web search** (`search_queries`): run each query for the current month and the next two months
   (`{monat}` German month name, `{jahr}` year). Open promising results. Also search for any act that appears
   in an existing entry to confirm it still takes place.
4. **Band watchlist**: the acts under **Dabei** in `bands.md`, plus the acts under **Vorschläge** if the
   setting says `ja`. Pick the 40 of them whose `tour_checked` in `data/artists.json` is oldest or missing.
   For each, search `"<name>" schweiz konzert <year>` (and the French variant for Romandie acts) and open the
   act's tour-dates page if there is one. Keep only Swiss dates. Set `tour_checked` to today for every
   artist you checked, found or not — this rotates through the whole list over a few runs.

Rules while collecting:

- **Never invent a show.** Every candidate must come from a page you actually opened. Record that page as
  `source_url`.
- If a page does not load, skip it and note it in the summary; do not retry more than twice.
- Dates: convert everything to `YYYY-MM-DD` local Swiss date. If only a weekday and day are given, resolve
  them against the page's month/year context. If you cannot pin the date, drop the candidate.
- Time: `HH:MM` (24h) door or start time if shown; otherwise omit.
- Venue not in sources.json: look up its city and canton; find coordinates (venue website, Wikipedia, or
  OpenStreetMap). If you cannot find coordinates, leave `lat`/`lon` out — never guess.
- Events outside Switzerland are dropped, no matter how close to the border.

## 3. Decide what counts

Decision order for each candidate:

1. An act under **Nicht dabei** in `bands.md` → drop the show.
2. An act under **Dabei** → keep the show.
3. Otherwise decide with `criteria.md`. When unsure about an act, research it (step 4) and then decide.
   Drop candidates that stay doubtful — the criteria file says so.

Acts you researched that are not in `bands.md` yet and that you decided to keep: append them under
**Vorschläge** as `- Name — <genres>, gefunden via <venue or source>` so a human can confirm or reject
them next time. Do not add acts you dropped.

## 4. Genres per act (with cache)

Each show gets `genres`: a list of lowercase slugs (e.g. `reggae`, `roots`, `dub`, `ska`, `rocksteady`,
`dancehall`, `soundsystem`, `nyabinghi`, `lovers-rock`, `steppers`). Use at most 3 per show; prefer the
most specific established labels. Build the list from the acts:

1. Split the title into acts (`Dub Inc + Support` → `Dub Inc`; ignore "Support", "DJs", "& Friends").
2. For each act, look it up in `data/artists.json` → `artists[<name>]`. If present and `checked` is less
   than 180 days ago, use its `genres`.
3. Otherwise research: first the act's Wikipedia page (any language), then the act's own website or
   Bandcamp. Take the genres that are stated there, map them to slugs, and write the entry back to the cache:
   ```json
   "Dub Inc": { "genres": ["reggae", "dub"], "source": "https://fr.wikipedia.org/wiki/Dub_Inc", "checked": "2026-10-13" }
   ```
   If nothing reliable is found, write `{ "genres": [], "source": "", "checked": "<today>" }` so the next
   run does not repeat the search, and fall back to the genre the event page itself uses.
4. The show's `genres` is the union of its acts' genres (deduplicated, max 3, most common first).

Cache entries that a human edited stay as they are — only add new entries or refresh ones older than
180 days. Never remove an artist; `festivals` and `tour_checked` fields of existing entries are kept.

## 5. Merge and write

Build the new `shows` array:

- Start from the existing future shows (date ≥ today). Drop past ones.
- For each candidate, compute `id` = `<date>-<slug of main act or title>-<slug of city>` (ASCII, lowercase,
  hyphens). If an existing show has the same `date` + `venue` (case-insensitive), treat it as the same show:
  keep its `id`, update the other fields from the fresher source.
- Sort by date, then time, then title.
- Set `"source": "scraper"` and `"updated"` to the current time in ISO 8601 with offset.

Allowed fields per show — nothing else:
`id, date, time, title, venue, city, canton, url, source_url, lat, lon, genres`.

Write `data/shows.json` with 2-space indentation and `data/artists.json` with the artists sorted by key.
Only these fields are allowed per artist: `genres, source, checked, festivals, tour_checked`.

## 6. Log the run

Prepend one entry to `data/runs.json` → `runs` (newest first, keep at most 60):

```json
{
  "skill": "scrape-shows",
  "at": "2026-10-13T06:14:00+02:00",
  "added": 3, "updated": 1, "removed": 2, "total": 41,
  "failed_sources": ["https://www.example.ch/programm (timeout)"],
  "dropped": [ { "title": "Afro Night @ Plaza", "why": "Afrobeats, kein Reggae-Bezug (criteria.md)" } ],
  "notes": ["Exil: Seite blockiert Bots (403)"]
}
```

`dropped` lists every candidate you rejected after looking at it closely (not every unrelated event on a
page). This log is public — it is shown on `log.html` — so write it so a reader understands the decision.

## 7. Validate, commit, push

```sh
python3 scripts/validate_shows.py
```

If it reports problems, fix the data and run it again. **Never commit data that does not validate.**
If you cannot make it pass, leave the repo untouched and end with an explanation.

Then:

```sh
git add data/shows.json data/artists.json data/runs.json scraper/bands.md
git commit -m "Update shows: +<added> ~<changed> -<removed> (<n> total)"
git push origin main
```

If `git push` is rejected because `main` moved, `git pull --rebase origin main` and push again (once).

## 8. Report

End with a short summary (this is the routine's log):

- counts: added / updated / removed / total
- sources that failed to load
- candidates you dropped as doubtful (title + why), so the criteria can be refined
- new artists added to the cache
