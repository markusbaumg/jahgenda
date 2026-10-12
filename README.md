# Jahgenda

**Alle Reggae-, Dub- und Ska-Konzerte der Schweiz an einem Ort.**
Eine statische Seite, gepflegt von KI-Agenten, gehostet auf GitHub Pages.

**Live:** https://markusbaumg.github.io/jahgenda/

## Was es ist

Reggae-Konzerte in der Schweiz sind über Dutzende Club-Websites, Ticketing-Seiten und Facebook-Events verstreut. Jahgenda sammelt sie in einer einzigen, schnellen Liste:

- nach Monat gruppiert, vergangene Shows verschwinden automatisch
- Filter nach Kanton und Genre, Volltextsuche
- Genre-Chips pro Show (z. B. `roots`, `dub`, `ska`)
- auf Wunsch die Luftlinien-Distanz vom eigenen Standort zu jeder Show
- kein Login, keine Werbung, kein Tracking

Die Daten werden täglich von einem Claude-Code-Agenten recherchiert (siehe [Scraper](#scraper)). Was als Reggae zählt, steht in einer Textdatei, die jede und jeder anpassen kann.

Gemacht von Markus & Seraina.

## Aufbau

```
index.html / style.css / app.js      Die Seite. Kein Build-Schritt, kein Framework.
data/shows.json                      Die Konzerte. Wird vom Scraper geschrieben.
data/artists.json                    Genre-Cache pro Act (Wikipedia / Band-Website).
scraper/criteria.md                  Was zählt als Reggae? – der editierbare Teil des Scraper-Prompts.
scraper/bands.md                     Welche Bands sind dabei, welche nicht? Von Hand gepflegt, schlägt alles.
scraper/sources.json                 Agenda-Seiten, Venues (mit Kanton + Koordinaten), Festivals, Suchanfragen.
.claude/skills/scrape-shows/         Der Scraper selbst: eine Claude-Code-Skill (Prompt), kein Code.
.claude/skills/harvest-bands/        Sammelt Bands aus Festival-Line-ups als Vorschläge für bands.md.
scripts/validate_shows.py            Prüft die JSON-Dateien. Läuft in CI und am Ende jedes Scraper-Laufs.
.github/workflows/pages.yml          Validiert und deployt bei jedem Push auf main.
.github/workflows/validate.yml       Validiert auf Branches und Pull Requests.
```

Die Seite lädt beim Öffnen `data/shows.json`, blendet vergangene Shows aus, gruppiert nach Monat und baut Kanton- und Genre-Filter aus den vorhandenen Daten.

## Scraper

Der Scraper ist kein klassisches Programm, sondern eine **Claude-Code-Skill**: `/scrape-shows`. Sie beschreibt Schritt für Schritt, wie der Agent die Quellen abgrast, entscheidet, was Reggae ist, Genres nachschlägt und das Ergebnis validiert und committet.

```
            ┌──────────────────────────┐
  täglich → │ Claude Code Routine      │  (Cloud, läuft auf dem Claude-Abo)
   06:00    │ Prompt: "/scrape-shows"  │
            └────────────┬─────────────┘
                         │ klont das Repo
                         ▼
            ┌──────────────────────────┐     scraper/bands.md      (wer ist dabei? – schlägt alles)
            │ Skill scrape-shows       │ ◄── scraper/criteria.md   (was zählt?)
            │  1 Quellen besuchen      │ ◄── scraper/sources.json  (wo suchen?)
            │  2 Bands + Kriterien     │ ◄── data/artists.json     (Genre-Cache + Watchlist)
            │  3 Genres nachschlagen   │ ──► Wikipedia / Band-Websites
            │  4 mergen + schreiben    │
            │  5 validieren            │ ──► scripts/validate_shows.py
            └────────────┬─────────────┘
                         │
  monatlich ─────────────┼──► Skill harvest-bands: Festival-Line-ups (Summerjam, Reeds, Lakesplash, …)
                         │    → neue Acts als «Vorschläge» in bands.md + GitHub-Issue zum Abnicken
                         │ git push main
                         ▼
            ┌──────────────────────────┐
            │ GitHub Pages Workflow    │ validiert nochmals, deployt
            └──────────────────────────┘
```

Warum so?

- **Abo statt API.** Routinen laufen als Claude-Code-Sessions auf dem persönlichen Claude-Abo; es fällt keine API-Rechnung an.
- **Prompt statt Parser.** Club-Websites ändern ständig ihr Layout. Ein Agent, der die Seite liest wie ein Mensch, bricht nicht bei jedem Redesign.
- **Kriterien als Text.** `scraper/criteria.md` ist Teil des Prompts. Wer die Definition von «Reggae» ändern will, editiert die Datei – ohne Code.
- **Bands von Hand auswählen.** `scraper/bands.md` hat drei Listen: *Dabei*, *Nicht dabei*, *Vorschläge*. Was unter *Dabei* steht, zählt immer; was unter *Nicht dabei* steht, kommt nie in die Agenda. Der Harvester füllt nur *Vorschläge*; Menschen verschieben die Zeilen.
- **Cache für Genres.** Jeder Act wird höchstens alle 180 Tage auf Wikipedia / der eigenen Website nachgeschlagen; das Ergebnis liegt in `data/artists.json` und darf von Hand korrigiert werden.
- **Nichts Ungeprüftes geht live.** Der Validator läuft am Ende des Scraper-Laufs und nochmals vor dem Deploy. Fällt er durch, bleibt die alte Seite online.
- **Keine Erfindungen.** Jede gescrapte Show braucht eine `source_url` – die Seite, auf der der Agent sie gefunden hat. Der Validator erzwingt das.

### Den Scraper von Hand laufen lassen

```sh
claude            # im Repo
> /scrape-shows      # Konzerte aktualisieren
> /harvest-bands     # Bands aus Festival-Line-ups vorschlagen
```

Oder headless, z. B. aus einem lokalen Cron/launchd-Job:

```sh
claude -p "/scrape-shows" --allowedTools "Bash,Read,Write,Edit,WebFetch,WebSearch"
```

### Den Scraper anpassen

| Ich will …                                   | Datei                                   |
|----------------------------------------------|-----------------------------------------|
| ändern, was als Reggae zählt                 | `scraper/criteria.md`                   |
| eine Band fix aufnehmen oder ausschliessen   | `scraper/bands.md`                      |
| ein Festival für die Band-Suche hinzufügen   | `scraper/sources.json` → `festivals`    |
| eine Venue oder Agenda-Seite hinzufügen      | `scraper/sources.json`                  |
| ein falsches Genre für einen Act korrigieren | `data/artists.json`                     |
| den Ablauf des Scrapers ändern               | `.claude/skills/scrape-shows/SKILL.md`  |
| eine neue Prüfung für die Daten              | `scripts/validate_shows.py`             |

## Datenformat

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
      "venue": "Dachstock",
      "city": "Bern",
      "canton": "BE",
      "url": "https://www.dachstock.ch/…",
      "source_url": "https://www.dachstock.ch/programm",
      "lat": 46.9496,
      "lon": 7.4385,
      "genres": ["dub", "reggae"]
    }
  ]
}
```

| Feld         | Pflicht        | Beschreibung                                                |
|--------------|----------------|-------------------------------------------------------------|
| `id`         | ja             | Stabil: `datum-slug-ort`                                    |
| `date`       | ja             | `YYYY-MM-DD`, lokales Datum                                 |
| `time`       | nein           | `HH:MM`                                                     |
| `title`      | ja             | Act(s) / Eventname                                          |
| `venue`      | ja             | Club / Location                                             |
| `city`       | ja             | Ort                                                         |
| `canton`     | ja             | Kantonskürzel, z. B. `ZH`                                   |
| `url`        | nein           | Link zum Event / Tickets                                    |
| `source_url` | bei `scraper`  | Seite, auf der die Show gefunden wurde                      |
| `lat`, `lon` | nein           | Koordinaten der Venue (für die Distanz), beide oder keine   |
| `genres`     | nein           | Kleingeschriebene Slugs, max. 3, z. B. `["roots", "dub"]`   |

`source` ist `mock` (Beispieldaten, die Seite zeigt einen Hinweis) oder `scraper`.

`data/artists.json`:

```json
{
  "artists": {
    "Dub Inc": { "genres": ["reggae", "dub"], "source": "https://fr.wikipedia.org/wiki/Dub_Inc", "checked": "2026-10-13" }
  }
}
```

Prüfen: `python3 scripts/validate_shows.py`

## Lokal ansehen

```sh
python3 -m http.server 8000      # http://localhost:8000
```

oder mit Auto-Reload: `npx live-server`

## Standort

Die Distanz-Funktion fragt den Browser nach dem Standort. Er wird nur im Browser verwendet und nirgends gespeichert oder verschickt.

## Roadmap

Siehe [Issues](https://github.com/markusbaumg/jahgenda/issues).
