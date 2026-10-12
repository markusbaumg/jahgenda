---
name: harvest-bands
description: Collect acts from the line-ups of the big reggae and ska festivals in scraper/sources.json and add them as suggestions to scraper/bands.md (with genres cached in data/artists.json). Run monthly by a routine or by hand with /harvest-bands.
---

# Harvest bands from festival line-ups

Goal: a list of acts that tour Europe and are likely to play Switzerland, so `/scrape-shows` can search for
them by name. The result of this run is a commit on `main` that changes `data/artists.json` (genres) and
`scraper/bands.md` (new names under **Suggestions**), plus a GitHub issue listing the new suggestions.

Work from the repository root. Today's date is what `TZ=Europe/Zurich date +%F` prints — use it, do not
guess; timestamps are `TZ=Europe/Zurich date -Iseconds` (always with an offset).

## 1. Load the inputs

1. `scraper/criteria.md` — what counts. Apply it to every act; festival line-ups also contain hip-hop,
   afrobeats and pop acts that stay out.
2. `scraper/sources.json` → `festivals`: name, website, Wikipedia page.
3. `scraper/bands.md` — the hand-curated list. Acts already under **Included**, **Excluded** or
   **Suggestions** are known; do not suggest them again. Match case-insensitively, ignoring text after ` — `.
4. `data/artists.json` — the existing genre data. Never remove anything; only add or enrich.

## 2. Collect line-ups

For every festival, get the line-ups of the current year and the previous two editions:

1. Festival website (line-up / artists / history page).
2. The Wikipedia page listed (often has a line-up table per year).
3. If both fail, one web search `"<festival> line-up <year>"` and open the best result.

Collect every act name exactly as written, together with the festival name and year. Skip pages that fail
to load after two tries and note them in the summary.

## 3. Decide and classify

For each new act (not yet in `data/artists.json`, compare case-insensitively):

1. Apply `criteria.md`. Acts that stay out are simply not added — do not add them with empty genres.
2. Find its genres: Wikipedia page (any language) first, then the act's website or Bandcamp. Map them with
   the `maps` column of `data/genres.json` — only those slugs are allowed — max 3, most specific first.
   Use the Wikipedia title / band-site spelling as the key, without trailing punctuation or guest suffixes
   (`feat. …`, `& …`); compare existing keys case-insensitively ignoring punctuation (`DUB INC.` = `Dub Inc`).
3. Add the entry:
   ```json
   "Alborosie": { "genres": ["reggae", "roots"], "source": "https://en.wikipedia.org/wiki/Alborosie", "checked": "2026-10-13", "festivals": ["Summerjam 2026", "Rototom Sunsplash 2025"] }
   ```
   Research budget: at most 60 new acts per run. If there are more, take the ones that appear at the most
   festivals first and stop; the next run continues.

4. Append the act to `scraper/bands.md` under **Suggestions**, one line:
   `- Alborosie — reggae, roots · Summerjam 2026, Rototom 2025`
   Keep the rest of the file byte-for-byte unchanged; the humans own it.

For acts already in `data/artists.json`: append missing `festivals` entries, leave everything else untouched.

## 4. Log, write, validate, commit

Overwrite `data/status.json` (`{"ok": true, "skill": "harvest-bands", "at": "<TZ=Europe/Zurich date -Iseconds>", "runner": "<$JAHGENDA_RUNNER if set, else cloud>", "counts": {"added": <n>, "total": <total>}, "error": null}`)
and prepend one entry to `data/runs.json` → `runs` (newest first, max 60):

```json
{ "skill": "harvest-bands", "at": "2026-11-01T05:10:00+01:00", "added": 12, "total": 57,
  "failed_sources": [], "dropped": [ { "title": "Burna Boy", "why": "Afrobeats (criteria.md)" } ], "notes": [] }
```

Write `data/artists.json` with 2-space indentation, artists sorted by key. Keep the top-level `note`.

Run exactly this, as one command, so nothing is committed when validation fails:

```sh
python3 scripts/format_data.py && python3 scripts/validate_shows.py \
  && git add data/artists.json data/runs.json data/status.json scraper/bands.md \
  && git commit -m "Harvest bands: +<added> new, <total> total" \
  && git push origin main
```

Then, if you added at least one suggestion, open a GitHub issue so the humans get pinged:

```sh
gh issue create --title "Band-Vorschläge <today>: <n> neue Acts" --label bands \
  --body "<list: one line per act with genres and festivals>

Bitte in scraper/bands.md nach **Included** oder **Excluded** verschieben."
```

If `gh` is unavailable or not authenticated, skip the issue and say so in the report.

If validation fails and you cannot fix it, leave the repo untouched and explain. If the push is rejected,
`git pull --rebase origin main` and push once more.

## 5. Report

- acts added (name + genres), acts skipped by the criteria (name + why), festivals that failed to load,
  and how many acts are still unresearched (if you hit the budget).
