# Jahgenda

**Alle Reggae-, Dub- und Ska-Konzerte der Schweiz an einem Ort.**
Eine statische Seite, gepflegt von KI-Agenten, gehostet auf GitHub Pages.

**Live:** https://markusbaumg.github.io/jahgenda/

## Was es ist

Reggae-Konzerte in der Schweiz sind über Dutzende Club-Websites, Ticketing-Seiten und Facebook-Events verstreut.
Jahgenda sammelt sie in einer einzigen, schnellen Liste:

- nach Monat gruppiert, vergangene Shows verschwinden automatisch (auf Wunsch einblendbar)
- Kantonswappen pro Show (Länderflagge für grenznahe Shows), Acts einzeln, «Kalender» (ICS), «WhatsApp», Direktlink
- Filter nach Kanton und Genre (Chips), Volltextsuche, Ergebniszeile mit Zeitraum, Filter zurücksetzen
- auf Wunsch die Luftlinien-Distanz vom eigenen Standort zu jeder Show
- `log.html`: was die Agenten bei jedem Lauf gefunden, geändert und verworfen haben
- kein Login, keine Werbung, kein Tracking

Die Daten werden täglich von einem Claude-Code-Agenten recherchiert (siehe [Scraper](#scraper)). Was als Reggae
zählt und welche Bands dabei sind, steht in Textdateien, die jede und jeder anpassen kann (siehe
[Mitmachen](#mitmachen-ohne-code)).

Gemacht von Kusi & Seraina.

## Aufbau

```
index.html / style.css / app.js      Die Seite. Kein Build-Schritt, kein Framework. Liest data/shows.json.
log.html                             Das öffentliche Scraper-Log. Liest data/runs.json.
img/cantons/*.svg, img/about.jpg     Kantonswappen + Länderflaggen (D, F, I, A, FL), Foto im «Über»-Teil.
design/logos.html                    Logo-Varianten zum Aussuchen (Designskizze, nicht verlinkt).
design/festival-spec.md              Spezifikation für Festivals (end_date, days) – geplant, noch nicht gebaut.

data/shows.json                      Die Konzerte. Wird vom Scraper geschrieben.
data/venues.json                     Venue-Datenbank: Kanton, Koordinaten, Programm-URL, Scrape-Flag, Hinweise.
data/artists.json                    Genre-Cache pro Act (Wikipedia / Band-Website) + Watchlist-Buchhaltung.
data/runs.json                       Ein Eintrag pro Scraper-Lauf (Zähler, Fehler, Verworfenes mit Begründung).

scraper/criteria.md                  Was zählt als Reggae? Grenznahe Orte («Nearby»), erlaubte Genre-Slugs. Teil des Prompts.
scraper/bands.md                     Welche Bands sind dabei (Included), welche nicht (Excluded)? Von Hand, schlägt alles.
scraper/sources.json                 Agenda-Seiten, Suchanfragen, grenznahe Suchen, Festivals (für den Harvester).
                                     Die drei Scraper-Dateien sind auf Englisch, wie die Skills, die sie lesen.
.claude/skills/scrape-shows/         Der Scraper selbst: eine Claude-Code-Skill (Prompt), kein Code.
.claude/skills/harvest-bands/        Sammelt Bands aus Festival-Line-ups als Vorschläge für bands.md.

scripts/validate_shows.py            Prüft alle data/*.json gegen criteria.md. Läuft in CI und nach jedem Lauf.
scripts/format_data.py               Bringt data/*.json in kanonische Form (Sortierung, Feldreihenfolge).
scripts/launchd/*.plist              Lokaler Fallback: Scraper täglich per launchd auf dem Mac (make cron-install).
tests/                               Unit-Tests für Validator und Formatierer (python3 -m unittest).
Makefile                             Alle Befehle: make zeigt die Hilfe.
.github/workflows/validate.yml       CI: make ci bei jedem Push und Pull Request.
.github/workflows/pages.yml          Validiert die Daten und deployt bei jedem Push auf main.
.prettierrc / .editorconfig          Formatregeln für HTML, CSS, JS (110 Zeichen, 2 Leerzeichen).
pyproject.toml                       ruff-Konfiguration für die Python-Skripte (optional, stdlib-only bleibt).
```

Die Seite lädt beim Öffnen `data/shows.json`, blendet vergangene Shows aus, gruppiert nach Monat und baut Kanton-
und Genre-Filter aus den vorhandenen Daten. Steht in `shows.json` `"source": "mock"`, ergänzt sie den
`Stand: …`-Hinweis im Footer um «Beispieldaten».

## Scraper

Der Scraper ist kein klassisches Programm, sondern eine **Claude-Code-Skill**: `/scrape-shows`. Sie beschreibt
Schritt für Schritt, wie der Agent die Quellen abgrast, entscheidet, was Reggae ist, Genres nachschlägt und das
Ergebnis validiert und committet.

```
            ┌──────────────────────────┐
  täglich → │ Claude Code Routine      │  (Cloud, läuft auf dem Claude-Abo)
   06:00    │ Prompt: "/scrape-shows"  │
            └────────────┬─────────────┘
                         │ klont das Repo
                         ▼
            ┌──────────────────────────┐     scraper/bands.md      (wer ist dabei? – schlägt alles)
            │ Skill scrape-shows       │ ◄── scraper/criteria.md   (was zählt? welche Slugs?)
            │  1 Quellen besuchen      │ ◄── scraper/sources.json  (Agenden, Suchanfragen, grenznah)
            │  2 Bands + Kriterien     │ ◄── data/venues.json      (welche Venues? Koordinaten)
            │  3 Genres nachschlagen   │ ◄── data/artists.json     (Genre-Cache + Watchlist)
            │  4 mergen + schreiben    │ ──► Wikipedia / Band-Websites
            │  5 validieren + loggen   │ ──► scripts/validate_shows.py, data/runs.json
            └────────────┬─────────────┘
                         │
  monatlich ─────────────┼──► Skill harvest-bands: Festival-Line-ups (Summerjam, Reeds, Lakesplash, …)
                         │    → neue Acts als «Suggestions» in bands.md + GitHub-Issue zum Abnicken
                         │ git push main
                         ▼
            ┌──────────────────────────┐
            │ GitHub Pages Workflow    │ validiert nochmals, deployt
            └──────────────────────────┘
```

Warum so?

- **Abo statt API.** Routinen laufen als Claude-Code-Sessions auf dem persönlichen Claude-Abo; es fällt keine
  API-Rechnung an.
- **Prompt statt Parser.** Club-Websites ändern ständig ihr Layout. Ein Agent, der die Seite liest wie ein Mensch,
  bricht nicht bei jedem Redesign. Hinweise zum Aufbau einer Seite stehen als `hint` bei Agenda und Venue.
- **Kriterien als Text.** `scraper/criteria.md` ist Teil des Prompts (auf Englisch, wie der Skill). Wer die
  Definition von «Reggae» ändern will, editiert die Datei – ohne Code. Dort steht auch die Liste der erlaubten
  Genre-Slugs (Abschnitt «Genre slugs»); der Validator liest sie.
- **Bands von Hand auswählen.** `scraper/bands.md` hat drei Listen: _Included_, _Excluded_, _Suggestions_. Was
  unter _Included_ steht, zählt immer; was unter _Excluded_ steht, kommt nie in die Agenda. Der Harvester füllt
  nur _Suggestions_; Menschen verschieben die Zeilen.
- **Venues als Datenbank.** `data/venues.json` kennt jede Venue mit Kanton, Koordinaten und Programm-Seite. Venues
  mit `"scrape": true` liest der Scraper bei jedem Lauf. Neue Venues trägt der Scraper selbst ein (mit
  Koordinaten von OpenStreetMap); jede Show muss eine bekannte Venue haben.
- **Cache für Genres.** Jeder Act wird höchstens alle 180 Tage auf Wikipedia / der eigenen Website nachgeschlagen;
  das Ergebnis liegt in `data/artists.json` und darf von Hand korrigiert werden.
- **Nichts Ungeprüftes geht live.** Der Validator läuft am Ende des Scraper-Laufs (streng) und nochmals vor dem
  Deploy (`--allow-past`, damit ein Push an einem Tag ohne Lauf nicht an gestrigen Shows scheitert). Fällt er
  durch, bleibt die alte Seite online.
- **Grenznah zählt mit.** Konstanz, Lörrach, Annemasse, Como, Bregenz & Co. (Liste in `criteria.md`) werden
  mitgesucht und mit Länderflagge statt Kantonswappen angezeigt.
- **Keine Erfindungen.** Jede gescrapte Show braucht eine `source_url` – die Seite, auf der der Agent sie gefunden
  hat. Der Validator erzwingt das.
- **Alles ist nachvollziehbar.** Jeder Lauf schreibt einen Eintrag in `data/runs.json` – sichtbar auf `log.html`.

### Routinen einrichten (läuft auf dem Claude-Abo)

Die Routinen leben nicht im Repo, sondern unter https://claude.ai/code/routines (Konto markus.baumgartner@gmail.com).
Beide klonen dieses Repo, brauchen Push-Recht auf `main` (GitHub-Verbindung unter https://claude.ai/connect-github)
und Internetzugang für WebFetch/WebSearch.

| Routine          | Zeitplan                      | Prompt           |
| ---------------- | ----------------------------- | ---------------- |
| Jahgenda – Shows | täglich 06:00 (Europe/Zurich) | `/scrape-shows`  |
| Jahgenda – Bands | monatlich, am 1. um 07:00     | `/harvest-bands` |

Anlegen oder ändern: in Claude Code `/schedule` tippen, oder im Web unter Routinen.

Fallback ohne Cloud: `make cron-install` richtet auf diesem Mac einen launchd-Job ein, der täglich um 06:10
`git pull` und `make scrape` ausführt (`scripts/launchd/ch.jahgenda.scrape.plist`, Logs in
`~/Library/Logs/jahgenda/`). `make cron-uninstall` entfernt ihn wieder.

### Wenn ein Lauf fehlschlägt

- **Nichts kaputt:** Ein fehlgeschlagener Lauf committet nichts; die Seite zeigt weiter den letzten guten Stand
  (`Stand: …` im Footer). Vergangene Shows blendet der Browser aus.
- **Nachschauen:** https://claude.ai/code/routines → Routine → letzter Lauf → Log. Oder `log.html` auf der Seite,
  falls der Lauf bis zum Schreiben von `data/runs.json` kam. Lokal: `make status`.
- **Häufigste Ursachen:** eine Quelle blockiert (steht im Log unter «Nicht erreichbar» – Quelle in `sources.json`
  oder `venues.json` anpassen bzw. `"scrape": false` setzen), Validator schlägt fehl (Fehlermeldung nennt Datei
  und Feld), Abo-Limit erreicht (nächster Lauf holt es nach).
- **Von Hand nachholen:** `make scrape`, oder `claude` im Repo starten und `/scrape-shows` eingeben.

### Den Scraper von Hand laufen lassen

```sh
claude               # im Repo
> /scrape-shows      # Konzerte aktualisieren
> /harvest-bands     # Bands aus Festival-Line-ups vorschlagen
```

Oder headless, z. B. aus einem lokalen Cron/launchd-Job: `make scrape` bzw. `make harvest` (entspricht
`claude -p "/scrape-shows" --allowedTools "Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch,Skill"`).

### Den Scraper anpassen

| Ich will …                                         | Datei                                            |
| -------------------------------------------------- | ------------------------------------------------ |
| ändern, was als Reggae zählt                       | `scraper/criteria.md`                            |
| einen grenznahen Ort dazunehmen                    | `scraper/criteria.md` → Nearby                   |
| einen Genre-Slug hinzufügen oder umbenennen        | `scraper/criteria.md` → Genre slugs              |
| eine Band fix aufnehmen oder ausschliessen         | `scraper/bands.md`                               |
| einen Vorschlag des Harvesters annehmen/ablehnen   | `scraper/bands.md` (Zeile verschieben)           |
| eine Venue hinzufügen oder ihre Programm-URL fixen | `data/venues.json`                               |
| eine Venue nicht mehr abgrasen (aber behalten)     | `data/venues.json` → `"scrape": false`           |
| eine Agenda-Seite (wie Skalender) hinzufügen       | `scraper/sources.json` → `agendas`               |
| eine Suchanfrage ändern                            | `scraper/sources.json` → `search_queries`        |
| die grenznahen Suchen ändern                       | `scraper/sources.json` → `nearby.search_queries` |
| ein Festival für die Band-Suche hinzufügen         | `scraper/sources.json` → `festivals`             |
| ein falsches Genre für einen Act korrigieren       | `data/artists.json` (`"source": "manual"`)       |
| eine falsche Show löschen oder korrigieren         | `data/shows.json`                                |
| den Ablauf des Scrapers ändern                     | `.claude/skills/scrape-shows/SKILL.md`           |
| den Ablauf des Harvesters ändern                   | `.claude/skills/harvest-bands/SKILL.md`          |
| eine neue Prüfung für die Daten                    | `scripts/validate_shows.py` + Test in `tests/`   |

## Datenformat

Prüfen: `make validate` (oder `python3 scripts/validate_shows.py --allow-past`). Normalisieren: `make fmt-data`.

### `data/shows.json`

```json
{
  "updated": "2026-10-13T06:12:00+02:00",
  "source": "scraper",
  "shows": [
    {
      "id": "2026-10-16-dub-inc-bern",
      "date": "2026-10-16",
      "time": "20:30",
      "title": "Dub Inc + Mista Sanchez",
      "acts": ["Dub Inc", "Mista Sanchez"],
      "venue": "Dachstock",
      "city": "Bern",
      "canton": "BE",
      "url": "https://www.dachstock.ch/…",
      "tickets": "https://www.petzi.ch/…",
      "source_url": "https://www.dachstock.ch/programm",
      "lat": 46.9496,
      "lon": 7.4385,
      "genres": ["dub", "reggae"]
    }
  ]
}
```

| Feld         | Pflicht       | Beschreibung                                                                    |
| ------------ | ------------- | ------------------------------------------------------------------------------- |
| `id`         | ja            | Stabil, `datum-slug-ort`, nur `a-z0-9-`; muss mit `date` beginnen               |
| `date`       | ja            | `YYYY-MM-DD`, lokales Datum; höchstens zwei Jahre voraus                        |
| `time`       | nein          | `HH:MM` (24 h)                                                                  |
| `title`      | ja            | Act(s) / Eventname                                                              |
| `acts`       | nein          | Acts einzeln, Headliner zuerst – die Seite zeigt sie als eigene Zeile           |
| `venue`      | ja            | Club / Location – bei `source: scraper` muss sie in `data/venues.json` stehen   |
| `city`       | ja            | Ort                                                                             |
| `canton`     | ja            | Kantonskürzel (`ZH`), für grenznahe Orte das Länderkürzel `D`, `F`, `I`, `A`, `FL` |
| `url`        | nein          | Link zur Event-Seite (Venue/Veranstalter, `http(s)://`)                         |
| `tickets`    | nein          | Link zum Ticket-Shop (Petzi, Eventfrog, …), falls die Seite einen hat           |
| `source_url` | bei `scraper` | Seite, auf der die Show gefunden wurde                                          |
| `lat`, `lon` | nein          | Koordinaten der Venue (für die Distanz); beide oder keine, innerhalb CH + Grenzstreifen |
| `genres`     | nein          | Max. 3 Slugs aus «Genre slugs» in `scraper/criteria.md`, keine Duplikate        |

Andere Felder sind nicht erlaubt. `source` ist `mock` (Beispieldaten, die Seite zeigt einen Hinweis; vergangene
Shows erlaubt) oder `scraper`. Der Validator lehnt doppelte `id`s ab und zwei Shows am selben Tag in derselben
Venue zur selben Zeit (fast sicher dieselbe Show zweimal).

### `data/venues.json`

```json
{
  "venues": {
    "Dachstock": {
      "city": "Bern",
      "canton": "BE",
      "lat": 46.9496,
      "lon": 7.4385,
      "url": "https://www.dachstock.ch/",
      "scrape": true,
      "hint": "Programm unter /programm, Genre-Tags pro Event."
    }
  }
}
```

| Feld         | Pflicht | Beschreibung                                                                     |
| ------------ | ------- | -------------------------------------------------------------------------------- |
| Schlüssel    | ja      | Name der Venue, so wie die Venue ihn selbst schreibt (eine Schreibweise pro Venue) |
| `city`       | ja      | Ort                                                                              |
| `canton`     | ja      | Kantons- oder Länderkürzel wie bei den Shows                                     |
| `lat`, `lon` | ja      | Koordinaten (OpenStreetMap); innerhalb CH + Grenzstreifen                        |
| `url`        | nein    | Programm-Seite                                                                   |
| `scrape`     | nein    | `true`: der Scraper liest das Programm bei jedem Lauf                            |
| `hint`       | nein    | Wo auf der Seite die Events stehen, wie sie getaggt sind, was zu beachten ist    |

Namen werden ohne Gross-/Kleinschreibung und Satzzeichen verglichen (`DACHSTOCK` = `Dachstock`); der Validator
meldet Beinahe-Duplikate.

### `data/artists.json`

```json
{
  "artists": {
    "Dub Inc": {
      "genres": ["reggae", "dub"],
      "source": "https://fr.wikipedia.org/wiki/Dub_Inc",
      "checked": "2026-10-13",
      "festivals": ["Summerjam 2026"],
      "tour_checked": "2026-10-13"
    }
  }
}
```

Felder pro Act: `genres` (Pflicht, Slugs aus `criteria.md`, max. 3), `source` (URL oder `manual`), `checked`
(`YYYY-MM-DD`), `festivals` (Liste), `tour_checked` (`YYYY-MM-DD`, wann zuletzt nach Tourdaten gesucht wurde).
Wer ein Genre von Hand korrigiert, setzt `"source": "manual"` – dann lässt der Scraper den Eintrag für immer in
Ruhe. Welche Bands der Scraper aktiv sucht, steht nicht hier, sondern in `scraper/bands.md`.

### `data/runs.json`

Ein Eintrag pro Lauf, neuester zuerst, höchstens 60. Wird auf `log.html` angezeigt.

| Feld                                   | Beschreibung                                                     |
| -------------------------------------- | ---------------------------------------------------------------- |
| `skill`                                | `scrape-shows` oder `harvest-bands`                              |
| `at`                                   | ISO-8601-Zeitstempel mit Offset                                  |
| `added`, `updated`, `removed`, `total` | Zähler (ganze Zahlen)                                            |
| `failed_sources`                       | Liste nicht erreichbarer Quellen (URL + Grund)                   |
| `dropped`                              | Liste `{ "title": …, "why": … }` – verworfene Kandidaten, Deutsch |
| `notes`                                | Freie Hinweise                                                   |

### `scraper/sources.json`

`agendas` (Name, URL, `hint` zum Seitenaufbau), `search_queries` (mit `{monat}` / `{jahr}`), `nearby.search_queries`
(grenznahe Orte) und `festivals` (Name, Ort, URL, Wikipedia, `hint`) – Letzteres nutzt nur `/harvest-bands`.
Venues stehen nicht hier, sondern in `data/venues.json`.

## Entwickeln

Voraussetzungen: `bash`, `python3` (stdlib reicht), `node`/`npx` (für prettier und live-server, nichts wird
installiert). Optional: `ruff` (`pip install ruff`) für den Python-Lint, `gh` für `make status`, `claude` für
`make scrape`.

```sh
make              # zeigt alle Ziele
make serve        # http://localhost:8000  (PORT=8080 make serve für einen anderen Port)
make dev          # mit Auto-Reload (live-server auf 127.0.0.1:5500)
make check        # lint + validate + test + Datenformat – vor jedem Commit
make fmt          # prettier (HTML/CSS/JS), ruff (Python), data/*.json normalisieren
```

| Ziel              | Was es tut                                                                        |
| ----------------- | --------------------------------------------------------------------------------- |
| `serve`, `dev`    | Seite lokal ansehen, `dev` mit Auto-Reload                                        |
| `validate`        | `scripts/validate_shows.py --allow-past` – so läuft es in der CI                  |
| `validate-strict` | ohne `--allow-past` – so läuft es im Scraper (keine vergangenen Shows)            |
| `test`            | `python3 -m unittest discover -s tests -v`                                        |
| `lint`            | `node --check app.js`, ruff (falls installiert, sonst `py_compile`), `prettier --check` |
| `check`           | `lint` + `validate` + `test` + `format_data.py --check`. **Muss vor jedem Commit grün sein.** |
| `ci`              | dasselbe wie `check` – das führt GitHub Actions aus                               |
| `fmt`, `fmt-data` | Code bzw. nur `data/*.json` formatieren                                           |
| `scrape`, `harvest` | die Skills headless ausführen (Claude Code auf dem Abo)                         |
| `deploy`          | `check`, committen (falls nötig), `git push origin main` → Pages deployt          |
| `status`          | letzte GitHub-Actions-Läufe (`gh`) und letzter Scraper-Lauf                       |
| `cron-install`, `cron-uninstall` | launchd-Job «täglich 06:10 make scrape» auf diesem Mac einrichten / entfernen |
| `clean`           | `__pycache__`, `.pytest_cache`, `.ruff_cache` entfernen                           |

**Tests:** `tests/test_validate.py` prüft Validator und Formatierer, auch gegen den echten Datenstand im Repo;
`tests/test_criteria.py` das Parsen der Genre-Slugs (Abschnitt «Genre slugs» in `criteria.md`) und die
Detailregeln des Validators;
`tests/test_format_data.py` die Randfälle des Formatierers. Die Tests laden die Skripte per Pfad – kein Paket, kein pytest nötig.

**Formatierung:** `.prettierrc` (110 Zeichen, doppelte Anführungszeichen, Leerzeichen) für `index.html`,
`log.html`, `style.css`, `app.js`, `design/logos.html`; `pyproject.toml` (ruff, 110 Zeichen) für `scripts/` und
`tests/`; `.editorconfig` für den Editor. `data/*.json` formatiert `scripts/format_data.py` – eine Show pro Zeile,
damit Diffs der Scraper-Commits lesbar bleiben.

**CI:** `.github/workflows/validate.yml` führt `make ci` bei jedem Push und Pull Request aus;
`.github/workflows/pages.yml` validiert die Daten (`--allow-past`) und deployt bei jedem Push auf `main`. Fällt der
Validator durch, wird nicht deployt und die alte Seite bleibt online.

## Mitmachen ohne Code

Für Seraina (und alle, die keinen Code anfassen wollen): drei Textdateien steuern, was in der Agenda landet.
Du änderst sie direkt auf GitHub – Datei öffnen, oben rechts auf den Stift klicken, Text ändern, unten
«Commit changes» drücken. Keine Installation nötig. Die drei Dateien sind auf Englisch geschrieben, weil der
Scraper sie als Teil seines (englischen) Prompts liest – Einträge auf Deutsch versteht er trotzdem.

| Datei                                                                                              | Was du damit machst                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`scraper/bands.md`](scraper/bands.md)                                                             | Bands eintragen: unter **Included** (kommt immer rein), unter **Excluded** (kommt nie rein). Die Zeilen unter **Suggestions** stammen vom Harvester und Scraper – nach oben oder unten verschieben. |
| [`scraper/criteria.md`](scraper/criteria.md)                                                       | Was als Reggae zählt, was draussen bleibt, welche grenznahen Orte mitzählen. Einfach den Text ändern – der Scraper liest ihn bei jedem Lauf. Die Liste **Genre slugs** nur vorsichtig ändern (die Seite und der Validator nutzen sie). |
| [`scraper/sources.json`](scraper/sources.json)                                                     | Wo gesucht wird: Agenda-Seiten, Suchanfragen, Festivals. Format: JSON – Anführungszeichen und Kommas genau wie bei den Nachbarzeilen.                                                   |

Was danach passiert: Der nächste Scraper-Lauf (täglich 06:00) nimmt die Änderung auf. Bei einem Tippfehler in
`sources.json` meldet sich die CI (rotes Kreuz beim Commit) – dann einfach nochmals anschauen oder Kusi fragen.
Eine falsche Show oder ein falsches Genre korrigierst du direkt in `data/shows.json` bzw. `data/artists.json`
(dort `"source": "manual"` setzen, sonst überschreibt der Scraper die Korrektur). Eine neue Venue mit
Programm-Seite kommt in `data/venues.json`. Alles andere (Seite, Skills, Skripte) bitte Kusi überlassen.

## Lokal ansehen

```sh
make serve        # http://localhost:8000   (ohne make: python3 -m http.server 8000)
make dev          # mit Auto-Reload (npx live-server)
```

## Standort

Die Distanz-Funktion fragt den Browser nach dem Standort. Er wird nur im Browser verwendet und nirgends gespeichert
oder verschickt.

## Roadmap

Siehe [Issues](https://github.com/markusbaumg/jahgenda/issues).
