# Jahgenda

Kommende Reggae-, Dub- und Ska-Konzerte in der Schweiz. Eine statische Seite, gehostet auf GitHub Pages.

**Live:** https://markusbaumg.github.io/jahgenda/

## Aufbau

```
index.html        Seite
style.css         Design (rot / gold / grün auf dunklem Grund)
app.js            Lädt data/shows.json, blendet vergangene Shows aus, gruppiert nach Monat, Kanton-Filter + Suche
data/shows.json   Konzertdaten (aktuell Mock-Daten)
```

Kein Build-Schritt. Jeder Push auf `main` deployt via `.github/workflows/pages.yml`.

## Datenformat

```json
{
  "updated": "2026-10-12T12:00:00+02:00",
  "source": "mock",
  "shows": [
    {
      "id": "2026-10-16-dub-collective-bern",
      "date": "2026-10-16",
      "time": "20:30",
      "title": "Alpine Dub Collective + Support",
      "venue": "Dachstock",
      "city": "Bern",
      "canton": "BE",
      "url": "https://…"
    }
  ]
}
```

| Feld     | Pflicht | Beschreibung                          |
|----------|---------|---------------------------------------|
| `id`     | ja      | Stabile ID (`datum-slug-ort`)         |
| `date`   | ja      | `YYYY-MM-DD`, lokales Datum           |
| `time`   | nein    | `HH:MM`                               |
| `title`  | ja      | Act(s) / Eventname                    |
| `venue`  | ja      | Club / Location                       |
| `city`   | ja      | Ort                                   |
| `canton` | ja      | Kantonskürzel, z. B. `ZH`             |
| `url`    | nein    | Link zum Event / Tickets (`http(s)`)  |

Vergangene Shows werden im Browser ausgeblendet; die JSON-Datei darf sie also enthalten.

## Lokal ansehen

```sh
python3 -m http.server 8000
# http://localhost:8000
```

## Roadmap

Der Scraper, der `data/shows.json` automatisch befüllt, ist noch offen – siehe [Issues](https://github.com/markusbaumg/jahgenda/issues).
