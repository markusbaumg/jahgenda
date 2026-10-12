# Jahgenda – Projektregeln für Claude

Jahgenda ist eine statische Agenda für Reggae-, Dub- und Ska-Konzerte in der Schweiz (GitHub Pages).
Die Daten werden nicht von Code, sondern von Claude-Code-Skills recherchiert, die als Routinen laufen.
Lies zuerst `README.md` – dort steht der Aufbau.

## Was wem gehört

- **Menschen gehören:** `scraper/criteria.md`, `scraper/bands.md` (ausser dem Abschnitt «Vorschläge»),
  `scraper/sources.json`, `index.html`, `style.css`, `app.js`, `README.md`, `CLAUDE.md`.
  Skills ändern diese Dateien nie – mit der einen Ausnahme: `/harvest-bands` darf Zeilen unter
  «Vorschläge» in `bands.md` anhängen.
- **Skills gehören:** `data/shows.json`, `data/artists.json`, `data/runs.json`.
  Menschen dürfen sie korrigieren; Skills respektieren Handkorrekturen (siehe SKILL.md).

## Eiserne Regeln für Skills

1. **Nichts erfinden.** Jede Show braucht eine `source_url` – die Seite, auf der sie gefunden wurde.
2. **`scraper/bands.md` schlägt `scraper/criteria.md` schlägt eigenes Urteil.**
3. **Vor jedem Commit:** `python3 scripts/validate_shows.py` muss durchlaufen. Sonst nichts committen.
4. **Jeder Lauf hinterlässt eine Spur:** ein Eintrag in `data/runs.json` (was gefunden, was verworfen und warum,
   welche Quellen nicht geladen werden konnten). Das ist das öffentliche Log – es wird auf `log.html` angezeigt.
5. **Nur `data/*` und `scraper/bands.md` (Vorschläge) committen.** Alles andere ist tabu.
6. **Im Zweifel weglassen.** Lieber eine Show zu wenig als eine erfundene oder falsche.

## Befehle

```sh
python3 scripts/validate_shows.py     # Daten prüfen
python3 -m http.server 8000           # Seite lokal ansehen
```

Skills: `/scrape-shows` (Konzerte aktualisieren), `/harvest-bands` (Bands aus Festival-Line-ups vorschlagen).
