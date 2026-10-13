---
name: scrape-shows
description: Research upcoming reggae, dub and ska shows in Switzerland (and just across the border) and update data/shows.json plus the artist genre cache. Run by the daily routine; can also be run by hand with /scrape-shows.
---

# Scrape shows

You update the concert data of Jahgenda. The result of this run is one commit on `main` that changes
`data/shows.json`, `data/artists.json`, `data/venues.json` (new venues only), `data/runs.json` and — only
new lines under **Suggestions** — `scraper/bands.md`. Nothing else in the repo is touched.

Work from the repository root. Today's date is what `TZ=Europe/Zurich date +%F` prints — use it, do not
guess; timestamps are `TZ=Europe/Zurich date -Iseconds` (always with an offset).

## 1. Load the inputs

1. `scraper/criteria.md` — what counts as reggae and which places across the border count ("Nearby").
   **This file is authoritative** for those two questions; the allowed genre slugs come from
   `data/genres.json` (step 4).
2. `scraper/bands.md` — the hand-curated band list. It overrides everything: an act under **Included**
   always counts, an act under **Excluded** never does. Read the setting line
   `Search suggestions automatically: yes|no` — it decides whether acts under **Suggestions** are part of
   the watchlist (step 2.4). Match names case-insensitively, ignoring punctuation and anything after ` — `.
3. `scraper/sources.json` — agenda pages, nearby regions and search queries; `festivals` is used by
   `/harvest-bands` **and** by step 2.5 (the Swiss and nearby ones).
4. `data/venues.json` — the venue database: city, canton, coordinates, programme `url`, `scrape` flag and a
   parsing `hint` per venue. Venues with `"scrape": true` are crawled in step 2.2. **Every show's `venue`
   must exist here** (the validator checks, matching case-insensitively and ignoring punctuation) and the
   show's `lat`/`lon` are copied from here.
5. `data/shows.json` — the current state.
   - If `"source"` is `"mock"`: ignore every existing show. Mock entries are examples, not data; the list is
     built from scratch.
   - Otherwise keep every existing *future* show that has a `source_url`, unless you find clear evidence that
     it was cancelled or moved (a «cancelled» on the venue or ticket page beats an aggregator that still
     lists it), or step 3 says it is out. Existing `id`s stay stable. An existing show
     without `source_url` is dropped (it can never validate).
6. `data/artists.json` — the genre cache. Look here before researching an act. Entries with
   `"source": "manual"` were written by a human: use them, never change them.

## 2. Collect candidates

Keep a scratch list of candidates (title, acts, date, time, venue, city, canton, url, tickets, source_url).
`url` is the event page (venue or promoter), `tickets` the ticket-shop link when the page has one (Petzi,
Eventfrog, Ticketcorner, Starticket, Eventim, See Tickets, the venue's own shop). Budget:
the whole run should stay under roughly **120 page fetches and 40 web searches** — the steps below are sized
for that (≈ 21 search queries + 15 watchlist searches; the run is daily, so the rest comes around by
rotation). When a source is huge, take the next 6 months, not everything.

1. **Agendas** (`agendas`): open each one, read its `hint` (it says which page and how the events are
   written), collect everything that could match `criteria.md`, in Switzerland or in the nearby regions,
   from today up to 6 months ahead.
2. **Venues** (`data/venues.json`, those with `"scrape": true` — the venues with high or medium reggae
   relevance, see the `hint`): open each venue's programme page (`url`; `hint` says where the events are and
   how they are tagged) and pick matching events. If there are more than ~60 such venues, take the ones whose
   hint says "high" every run and rotate through the "medium" ones (about 20 per run, by name order starting
   where the previous run's log says it stopped). Use the venue's
   name as the key is written, plus its `city`, `canton`, `lat`, `lon` for the entry.
3. **Web search** (`search_queries`): run each distinct query once per month for the current and the next
   month (two months; the third month ahead is covered by the agendas, the venue pages and later runs). `{monat}` is the month name in the language of the query, `{jahr}` the year; a query without
   `{monat}` runs once. Open at most 3 promising results per query.
4. **Band watchlist**: the acts under **Included** in `bands.md`, plus the acts under **Suggestions** if the
   setting says `yes`. Pick the 15 of them whose `tour_checked` in `data/artists.json` is oldest or missing.
   For each, search `"<name>" konzert schweiz <year> OR <year+1>` (French variant for Romandie acts) and open
   the act's tour-dates page if there is one. Keep Swiss and nearby-region dates. Afterwards set
   `tour_checked` to today for every act you checked, found or not; if the act has no cache entry yet,
   create a complete one (step 4.3) — never an entry with only `tour_checked`.
5. **Festivals** (`scraper/sources.json` → `festivals`, only those whose `where` is in Switzerland or a
   nearby place from `criteria.md`; festivals abroad stay with `/harvest-bands`): open each festival's
   line-up page from its `hint` once (budget: at most 8 festival pages per run, on top of the limits
   above). Extract in this order and stop as soon as a step is not possible:

   a. **Dates.** Only an explicit range of days counts («16.–18. Juli 2027», ticket dates). If the page
      only says «Sommer 2027» or «Juli 2027» → write NO entry; put one line into `runs.json` → `notes`
      («Reeds 2027: Datum noch nicht publiziert»). That is the existing rule «date not determinable →
      leave it out»; there is no TBA state.
   b. **Place.** `venue` = the grounds, as the festival names them. It must be in `data/venues.json` —
      like every new venue, create it with `city`, `canton`, `lat`, `lon`, `"scrape": false` (coordinates
      of the grounds, else the town centre plus a `hint`). Copy the show's `lat`/`lon` from there.
   c. **Line-up.** `acts` = every act name on the line-up page, exactly as written, in page order. Strip
      country suffixes «(JM)», «(FR)»; «Sound System» stays when it is part of the name. Normalise names
      through `artists.json` (step 4.2), so the same act is spelled the same in `acts`, `days` and the
      cache. Leave out acts whose headliner is under **Excluded**.
   d. **Days.** `days` ONLY when the page names a day next to the act (date, weekday or «Day 1» →
      `date` + offset). Never guess a day. Ignore stages.
   e. **Genres.** `festival` + the 3 most frequent genres of the acts (cache as in step 4). Per festival
      and run research at most 8 acts that are not cached yet; the rest keeps the previous genres and
      comes around next run. With empty `acts`: `["festival", "reggae"]`.

   Detection outside sources.json: every candidate from agendas, venue pages or search that covers 2–14
   consecutive days under ONE name at ONE place (festival, open air, weekender, «2 Nächte») is also
   written as one entry with `end_date` — never as one entry per day. Slug for `id` and merge: `name`
   from sources.json if the festival is listed there (so the key stays stable even when the page says
   «REEDS 27»); otherwise the festival name without the year, ASCII, lowercase.

Rules while collecting:

- **Never invent a show.** Every candidate must come from a page you actually opened. Record that page as
  `source_url`.
- If a page does not load (timeout, 403, bot wall), skip it after one retry and list it in the run log.
  Do not try to get around bot protection — use the other sources for that venue instead.
- Dates: `YYYY-MM-DD` local date. If only a weekday and day are given, resolve them against the page's
  month/year context. If you cannot pin the date, drop the candidate.
- Time: `HH:MM` (24h), door or start time if shown; otherwise omit.
- Venue not in `data/venues.json`: add it — `city`, `canton`, `lat`, `lon` (venue website address →
  OpenStreetMap/Nominatim or Google Maps; if the exact spot cannot be found, use the city centre and write
  `"hint": "Koordinaten: Stadtmitte"`), `url` of its programme page if known, `"scrape": false`. Use the
  venue name as the venue itself writes it; if a venue has several rooms that are listed in venues.json
  (e.g. Dachstock in the Reitschule), use the room's entry. Never invent coordinates for a specific street
  address — city centre is the honest fallback.
- Across the border: only the places listed in `criteria.md` → "Nearby" count. `canton` is then the
  country code `D`, `F`, `I`, `A` or `FL`. Everything else outside Switzerland is dropped.

## 3. Decide what counts

Decision order for each candidate:

0. **Cancelled before?** Look through the `dropped` entries of the `scrape-shows` runs in `data/runs.json`
   from the last 60 days. If one has the same date and the same venue (compare as in step 5.1) and its
   `why` says it was cancelled (abgesagt / cancelled / annulé / verschoben), keep the candidate out — unless
   the venue's or the ticket shop's own page, opened in this run, lists it as on sale again. Log it under
   `dropped` again with the same reason. An aggregator listing (Skalender, Eventfrog, Petzi's agenda list,
   a search hit) never overrides a «cancelled» on the venue or ticket page: an aggregator is often the last
   to notice a cancellation, so a shortened run that only reaches the aggregator must not bring a rejected
   show back.
1. Its headliner (first/main act) is under **Excluded** in `bands.md`, or it is the only act → drop.
   An **Excluded** act as one of several acts: keep the show, ignore that act for the genres.
2. An act under **Included** → keep.
3. Otherwise decide with `criteria.md`. When unsure about an act, research it (step 4) and then decide.
   Drop candidates that stay doubtful — the criteria file says so.

Apply rule 1 to existing shows as well: an existing show whose headliner is now under **Excluded** is
removed (count it under `removed`).

Acts you researched, decided to keep, and that are not in `bands.md` yet: append them under
**Suggestions** as `- Name — <genres>, found via <venue or source>` so a human can confirm or reject them.
Do not add acts you dropped. Change nothing else in `bands.md`.

## 4. Genres per act (with cache)

Each show gets `genres`: 1–3 slugs **from `data/genres.json`** — no other slugs, the
validator rejects them (a festival entry with `end_date`: `festival` + up to 3 music slugs). Build the
list from the acts:

1. Split the title into acts and store **all of them** in `acts`, headliner first: main act, every named
   support band, guest DJs and sound systems — look on the event page for lines like "Support: …",
   "Special Guest", "+", "feat.", "w/" and add those names. Only unnamed placeholders are left out
   (`Dub Inc + Support` with no name given → `["Dub Inc"]`; "& Friends", "DJs" without names → dropped).
   Fill `acts` whenever there is more than one act or the title is an event name rather than the act.
2. For each act, look it up in `data/artists.json`: compare names case-insensitively and ignoring
   punctuation (`DUB INC.` = `Dub Inc`). If present and (`source` is `manual` or `checked` is less than
   180 days ago), use its `genres`.
3. Otherwise research: first the act's Wikipedia page (any language), then the act's own website or
   Bandcamp. Map the stated genres to slugs with the `maps` column of `data/genres.json` and write the entry back:
   ```json
   "Dub Inc": { "genres": ["reggae", "dub"], "source": "https://fr.wikipedia.org/wiki/Dub_Inc", "checked": "2026-10-13" }
   ```
   Use the spelling of the Wikipedia title or the band's own site as the key, without trailing punctuation
   or guest suffixes (`feat. …`, `& …`). If nothing reliable is found, write
   `{ "genres": [], "source": "", "checked": "<today>" }` so the next run does not repeat the search.
4. The show's `genres` is the union of its acts' genres (deduplicated, max 3, most common first). If that is
   empty (no identifiable act, or acts without known genres), take the genres from the event description
   or the agenda's own genre tag; if there is none, use `reggae`.

Never remove an artist. Keep `festivals`, `tour_checked` and the top-level `note` of existing entries.
Only these fields are allowed per artist: `genres, source, checked, festivals, tour_checked`.

## 5. Merge and write

1. **Merge candidates among themselves first.** Same date and same venue (compare after lowercasing and
   stripping punctuation) = the same show, even if the titles differ (`DUB INC (FR) + Support` vs
   `Dub Inc`) — unless the venue clearly lists two separate events that night (e.g. a concert at 19:00 and
   an afterparty at 22:00). Keep the most complete record; prefer the venue's or ticket page as `url`.
2. **Merge with existing shows** by the same rule (date + venue). A match keeps the existing `id` and takes
   the fresher fields. No match → new show with
   `id` = `<date>-<slug of headliner or title>-<slug of city>` (ASCII, lowercase, hyphens).
3. Drop past shows: gone when `(end_date or date) < today` — a running festival stays. Sort by date,
   then time, then title.
4. Set `"source": "scraper"` and `"updated"` to the current time in ISO 8601 with offset.

Festival entries (with `end_date`) are NOT merged by date + venue but by the key
`slug(name) + year of date` (dates shift by a day, venue names vary):

- Match → keep the existing `id`. If `date` moved, write a new `id` (it must start with `date`), the old
  one goes, note «Datum verschoben» in `notes`.
- **Line-up page loaded** → `acts` = the page's list in page order. If the new list is SHORTER than the
  existing one, keep the existing list and log it («Reeds 2027: Line-up kürzer als zuvor, nicht
  übernommen») — this protects against half-loaded pages; a real cancellation is corrected by a human or
  the next stable run.
- **Line-up page NOT loaded (timeout, 403, bot wall) → leave `acts` and `days` untouched, only log it in
  `failed_sources`. Never shrink a line-up because of a load error.**
- `days`: union per day, never shrink — unless an act is no longer in `acts`; then remove it from `days`
  too (the validator requires days ⊆ acts).
- Keep `end_date` when the new page does not show the dates.
- **Agenda day lines** (Petzi «Reeds Festival – Samstag», Skalender day entries, Eventfrog ticket lines)
  whose normalised title contains the name of a known festival and whose date lies within its
  `[date, end_date]` are NOT shows of their own: take their acts into `acts` and — because the agenda line
  carries a concrete date — into `days[<date>]`. Before the official running order this is the main
  source of day assignments.
- A show of its own at the same venue inside the range does not exist (validator error); an afterparty
  in another club stays a normal show.
- A festival counts as 1 in added/updated/removed/total. `notes` gets one line per festival touched:
  «Reeds 2027: 12 Acts, 3 Tage, 2 ohne Tag».

Allowed fields per show — nothing else:
`id, date, end_date, time, title, acts, days, venue, city, canton, url, tickets, source_url, lat, lon,
genres`. `end_date` (last day, after `date`, at most 14 days later) marks a range entry — a festival, open
air or weekender; `days` (`{"YYYY-MM-DD": ["Act", …]}`, only with `end_date`) lists the acts per day when
the source names the day; both per design/festival-spec.md.

Write the files, then run `python3 scripts/format_data.py` — it sorts shows, artists and venues and fixes
the layout, so you need not care about formatting.

## 6. Log the run

Prepend one entry to `data/runs.json` → `runs` (newest first, keep at most 60):

```json
{
  "skill": "scrape-shows",
  "at": "2026-10-13T06:14:00+02:00",
  "runner": "cloud",
  "added": 3, "updated": 1, "removed": 2, "total": 41,
  "failed_sources": ["https://www.example.ch/programm (timeout)"],
  "dropped": [ { "title": "Afro Night @ Plaza", "date": "2026-11-07", "venue": "Plaza", "city": "Zürich",
                 "url": "https://…/afro-night", "why": "Afrobeats, kein Reggae-Bezug (criteria.md)" } ],
  "notes": ["Exil: Seite blockiert Bots (403), Events via Skalender übernommen"],
  "sources": [
    { "name": "Skalender", "url": "https://skalender.net/", "status": "ok", "found": 41, "kept": 23 },
    { "name": "Exil", "url": "https://exil.club/", "status": "failed", "found": 0, "kept": 0, "error": "403" },
    { "name": "Bogen F", "url": "https://www.bogenf.ch/", "status": "empty", "found": 0, "kept": 0 }
  ]
}
```

`runner` is where the run happened — `cloud` (the routine), `local` (`make scrape` on a Mac) or `launchd`
(the Mac fallback job); take it from the environment variable `JAHGENDA_RUNNER`, default `cloud`.
`sources` has one line for **every** source you touched this run (each agenda, every venue you opened,
each web-search query as `"search: <query>"`, the watchlist as `"watchlist"`): `status` is `ok` (loaded,
events read), `empty` (loaded, nothing matching), `failed` (could not load — put the reason in `error`),
`skipped` (not opened this run, e.g. medium-relevance venue not in this rotation); `found` = candidates
seen there, `kept` = how many ended up in shows.json. This is what makes the public log honest: a reader
sees which sources were covered, which failed and where the shows come from.

`dropped` lists every candidate you rejected after looking at it closely (not every unrelated event on a
page) — always with `date`, `venue`, `city` and the `url` you looked at, so a human can re-check the
decision in the Mischpult (tab «Aussortiert») and flag false negatives. `data/runs.json` is public and the owners read it in the
Mischpult (tab «Läufe») — so write it in German (the site's language), so
a reader understands the decision.

Also overwrite `data/status.json` — the heartbeat the watchdog (`.github/workflows/watchdog.yml`) reads:

```json
{ "ok": true, "skill": "scrape-shows", "at": "2026-10-13T06:14:22+02:00", "runner": "cloud",
  "counts": { "added": 3, "updated": 1, "removed": 2, "total": 41 }, "failed_sources": 1, "error": null }
```

`runner` is `$JAHGENDA_RUNNER` if that variable is set, else `cloud`.

## 7. Validate, commit, push

Run exactly this, as one command, so nothing is committed when validation fails:

```sh
python3 scripts/format_data.py && python3 scripts/validate_shows.py \
  && git add data/shows.json data/artists.json data/venues.json data/runs.json data/status.json scraper/bands.md \
  && git commit -m "Update shows: +<added> ~<updated> -<removed> (<total> total)" \
  && git push origin main
```

Commit even when no show changed (message `Scraper run: no changes (<total> total)`) — the heartbeat in
`status.json` and the `runs.json` entry must move every day, that is how the watchdog knows you ran.

If the validator reports problems, fix the data and run the command again. **Never commit data that does
not validate.** If you cannot make it pass, or anything else stops the run: revert the data
(`git checkout -- data/shows.json data/artists.json data/venues.json scraper/bands.md`), write
`data/status.json` with `"ok": false` and a one-line `"error"`, prepend a `runs.json` entry with the same
error in `notes`, validate, and commit + push only those two files — so the failure is visible on
the Mischpult (tab «Status») and the watchdog, and the site keeps the last good data.
If the push is rejected because `main` moved: `git pull --rebase origin main`, then push again (once).

## 8. Report

End with a short summary (this is the routine's log):

- counts: added / updated / removed / total
- sources that failed to load
- candidates you dropped as doubtful (title + why), so the criteria can be refined
- new artists added to the cache and new lines under Suggestions
