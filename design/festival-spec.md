# Jahgenda — Festival-Spezifikation (final)

Synthese aus Design 3 (bestes Gesamtergebnis bei allen drei Juroren) plus den «steal»-Punkten, die keine neue Komplexität bringen: Feldname `end_date` (Design 1), `artist_key()`-tolerante Subset-Prüfung und `acts ≤ 40` (Design 1), Slug aus `sources.json` und der wörtliche «Seite nicht geladen ⇒ nichts anfassen»-Satz (Design 2), eigene Aufklapp-Zeile als Tap-Target und «LÄUFT»-Zustand (Design 4), `<time datetime="a/b">` + `aria-label` (Design 2), Festival-Boden muss in `venues.json` (Juror 3). Verworfen: Stages, `lineup_final`, Jahres-Id, Tickets-Button, Kalender pro Tag, Kicker, Spine.

Leitsatz: **Ein Festival ist eine normale Show mit zwei optionalen Feldern.** Kein zweiter Datentyp, kein zweiter Render-Pfad, kein Framework, kein Build. Alles Neue hängt an `if (s.end_date)` bzw. `acts.length > 5`; Shows ohne die Felder rendern und validieren byte-identisch wie heute.

---

## 1. Datenmodell

### 1.1 Felder

Erlaubte Felder pro Show (13 → 15):
`id, date, end_date, time, title, acts, days, venue, city, canton, url, source_url, lat, lon, genres`

| Feld | Status | Bedeutung bei Festivals |
|---|---|---|
| `end_date` | neu, optional | Letzter Tag, `YYYY-MM-DD`, strikt nach `date`. **Vorhanden = «Range-Eintrag»** (Festival, Open Air, Weekender, 2 Nächte). Alles Festival-Verhalten hängt an diesem einen Feld. |
| `days` | neu, optional, nur mit `end_date` | `{ "YYYY-MM-DD": ["Act", …] }` – Acts pro Tag, **nur** wenn die Quelle den Tag nennt. Darf unvollständig sein. Acts ohne Tag stehen nur in `acts` («Tag offen»). Ganzer Key weglassen, solange kein Running Order existiert. |
| `date` | wie heute | Erster Tag. Treibt Sortierung, Monatsgruppe, Id-Präfix – unverändert. |
| `time` | wie heute | Türöffnung Tag 1; bei Festivals meist weglassen, bei Weekendern erlaubt. |
| `title` | wie heute | `<Festivalname> <Jahr>`, z. B. `Reeds Festival 2027`. |
| `acts` | wie heute | **Kanonische, flache Line-up-Liste** in Billing-Reihenfolge der Website (Headliner zuerst). Suche, Chip-Genres und die eingeklappte Zeile lesen nur dieses Feld. Darf leer sein (`[]` = «Line-up folgt»). |
| `genres` | wie heute | Muss `festival` enthalten; Limit **4** statt 3 (festival + max. 3 Musik-Slugs, häufigste zuerst). |
| `id` | wie heute | `<date>-<slug>-<stadt>`; Slug = `name` aus `sources.json`, falls das Festival dort steht (sonst Titel ohne Jahr). Startet weiterhin mit `date`. |
| `venue/city/canton/url/source_url/lat/lon` | wie heute | `venue` = Festivalgelände, **muss in `data/venues.json` stehen** (Validator-Regel `venue_key`), `lat/lon` von dort. `url` = Festival-Startseite, `source_url` = Line-up-Seite. |

Nicht modelliert: Stages, Zeiten pro Tag. Beides sind die unzuverlässigsten Dinge auf einer Festivalseite; `url` führt zum Running Order. `days`-Werte könnten später zu Objekten werden, ohne dass Bestehendes bricht.

Ein **eintägiges** Open Air / eine Soundclash-Nacht mit vielen Acts ist eine normale Show (kein `end_date`) mit Genre `festival` und langer `acts`-Liste; die UI klappt sie trotzdem zusammen (Regel: `acts > 5`).

### 1.2 Beispiel Reeds Festival 2027 (Fr 16. – So 18. Juli 2027; Acts illustrativ)

```json
{
  "id": "2027-07-16-reeds-festival-pfaeffikon",
  "date": "2027-07-16",
  "end_date": "2027-07-18",
  "title": "Reeds Festival 2027",
  "acts": ["Alborosie", "Dub Inc", "Gentleman", "Protoje", "Mellow Mood", "Phenomden",
           "Dubblestandart", "Jahcoustix", "Elijah", "Open Season", "Iration", "Jah Prayzah"],
  "days": {
    "2027-07-16": ["Dub Inc", "Mellow Mood", "Phenomden", "Jahcoustix"],
    "2027-07-17": ["Alborosie", "Protoje", "Dubblestandart"],
    "2027-07-18": ["Gentleman", "Elijah", "Open Season"]
  },
  "venue": "Seequai Pfäffikon",
  "city": "Pfäffikon ZH",
  "canton": "ZH",
  "url": "https://www.reeds-festival.ch/",
  "source_url": "https://www.reeds-festival.ch/line-up",
  "lat": 47.3604, "lon": 8.7861,
  "genres": ["festival", "reggae", "dub", "dancehall"]
}
```

«Iration» und «Jah Prayzah» sind angekündigt, aber ohne Tag → nicht in `days` → UI zeigt sie unter «Tag offen».

Früh in der Saison ist derselbe Eintrag legitim nur:
`{id, date, end_date, title, acts: [], venue, city, canton, url, source_url, lat, lon, genres: ["festival","reggae"]}` – kein `days`. Der Scraper reichert ihn Lauf für Lauf an.

**Dubquake Weekender** (2 Nächte, ein Club) – gleiche Form:

```json
{
  "id": "2027-03-12-dubquake-weekender-geneve",
  "date": "2027-03-12", "end_date": "2027-03-13", "time": "22:00",
  "title": "Dubquake Weekender 2027",
  "acts": ["Jah Shaka Sound System", "Iration Steppas", "OBF", "Dubkasm", "Mungo's Hi Fi", "Stand High Patrol"],
  "days": { "2027-03-12": ["Jah Shaka Sound System", "OBF", "Stand High Patrol"],
            "2027-03-13": ["Iration Steppas", "Dubkasm", "Mungo's Hi Fi"] },
  "venue": "L'Usine", "city": "Genève", "canton": "GE",
  "url": "https://…", "source_url": "https://…", "lat": 46.2058, "lon": 6.1404,
  "genres": ["festival", "dub", "soundsystem"]
}
```

Lakesplash (`end_date` = date+1) und Plein-les-Watts (3 Tage) ebenso.

### 1.3 Validator-Regeln (`scripts/validate_shows.py`, ≈ 40 Zeilen)

Alle Meldungen bleiben Fehler (kein Warn-Level) und nennen die Festival-Id.

1. `SHOW_OPTIONAL += {"end_date": str, "days": dict}`. Alles andere bleibt «unknown field».
2. `end_date`: parst als `YYYY-MM-DD`; `end_date > date`; `end_date − date ≤ 14 Tage` («länger ist eine Saison, kein Event» – fängt Monats-Tippfehler).
3. Vergangenheits-Check (strict mode): `(end_date or date) < today` → Fehler. Die Zwei-Jahres-Grenze prüft weiterhin `date`. Ein laufendes Festival wird so nie als «past» abgelehnt.
4. `days` ohne `end_date` → Fehler «'days' braucht 'end_date'». Jeder Key ist ein gültiges Datum in `[date, end_date]`; jeder Wert eine nicht-leere Liste nicht-leerer Strings; kein Act zweimal am selben Tag (ein Act an zwei Tagen ist erlaubt – Resident Sounds am Weekender).
5. **Subset-Check, tolerant:** jeder Act in `days` muss in `acts` vorkommen, verglichen über das bestehende `artist_key()`. Trifft nichts, nenne den nächstähnlichen Kandidaten: `shows[7] (2027-07-16-reeds-…): days-Act 'DUB INC.' nicht in acts – gemeint: 'Dub Inc'?` (Ähnlichkeit = gleicher `artist_key`-Präfix oder `difflib.get_close_matches`, 1 Zeile).
6. `acts` (alle Shows): keine Near-Duplikate via `artist_key()`; mehr als **40** Einträge → Fehler (Sicherheitsnetz gegen eingefügte Festival-Historien).
7. Genres: `end_date` vorhanden ⇒ `genres` muss `festival` enthalten, Limit **4** (`check_genres(where, genres, allowed, limit=4)`); sonst Limit 3 wie heute. `festival` ohne `end_date` bleibt erlaubt (eintägiges Open Air).
8. **Festival-Dedupe:** zwei Range-Einträge mit gleichem `slug(title ohne 4-stellige Jahreszahl)` und gleichem Jahr von `date` → Fehler «doppeltes Festival».
9. **In-Range-Check (verhindert das alte «ein Eintrag pro Tag»):** eine Show **ohne** `end_date`, deren `venue_key` gleich dem eines Range-Eintrags ist und deren `date` in dessen `[date, end_date]` liegt → Fehler `shows[12] (…): liegt im Zeitraum von 2027-07-16-reeds-festival-pfaeffikon am selben Ort – in dessen acts/days mergen`. Zeitunabhängig (anders als der Slot-Check). Eine offizielle Afterparty in einem anderen Club ist davon nicht betroffen (anderes `venue`).
10. Unverändert: Id-Regex, «id beginnt mit date», Slot-Check (date, venue, time), `source_url` bei Scraper-Daten, `venue` muss in `venues.json` sein, Kantone, Koordinaten-Box, doppelte Ids.

---

## 2. Scraper-Anweisungen (Ergänzungen zu `SKILL.md` und `criteria.md`)

### 2.1 `criteria.md` – eine Zeile ersetzen

> Reggae-Festivals und Reggae-Bühnen an grösseren Festivals (als ein Eintrag pro Tag)

wird zu

> Reggae-Festivals, Open Airs und Weekender über mehrere Tage **als EIN Eintrag mit `end_date`** – nie ein Eintrag pro Tag. Reggae-Bühnen an gemischten Festivals (Afro-Pfingsten) ebenso ein Eintrag mit `end_date`, `acts` = nur die Reggae-Acts.

### 2.2 `SKILL.md` – neuer Abschnitt «2.5 Festivals» (nach 2.4 Band watchlist)

```
5. **Festivals** (`scraper/sources.json` → `festivals`, nur die mit einem `where` in der Schweiz oder
   an einem Grenznah-Ort; Festivals im Ausland bleiben Sache von /harvest-bands): öffne pro Festival
   einmal die Line-up-Seite aus dem `hint` (Budget: max. 8 Festival-Seiten pro Lauf, zusätzlich zu den
   bestehenden Limits). Extrahiere in dieser Reihenfolge und brich ab, sobald ein Schritt nicht geht:

   a. **Daten.** Nur ein ausdrücklicher Tages-Bereich zählt («16.–18. Juli 2027», Ticket-Daten).
      Steht nur «Sommer 2027» oder «Juli 2027» → KEINEN Eintrag schreiben; stattdessen eine Zeile in
      `runs.json` → `notes` («Reeds 2027: Datum noch nicht publiziert»). Das ist die bestehende Regel
      «Datum nicht bestimmbar → weglassen»; es gibt keinen TBA-Zustand.
   b. **Ort.** `venue` = Gelände, wie das Festival es nennt. Es muss in `data/venues.json` stehen –
      wie bei jedem neuen Venue mit `city`, `canton`, `lat`, `lon`, `"scrape": false` anlegen
      (Koordinaten vom Gelände, sonst Stadtmitte + `hint`). `lat`/`lon` der Show von dort kopieren.
   c. **Line-up.** `acts` = alle Act-Namen der Line-up-Seite, exakt wie geschrieben, in Seiten-
      Reihenfolge. Länder-Suffixe «(JM)», «(FR)» streichen; «Sound System» bleibt, wenn Teil des Namens.
      Namen über `artists.json` normalisieren (Regel 4.2), damit derselbe Act in `acts`, `days` und im
      Cache gleich geschrieben ist. Acts, deren Headliner unter **Nicht dabei** steht, weglassen.
   d. **Tage.** `days` NUR, wenn die Seite neben dem Act einen Tag nennt (Datum, Wochentag oder
      «Day 1» → `date` + Offset). Nie einen Tag raten. Stages ignorieren.
   e. **Genres.** `festival` + die 3 häufigsten Genres der Acts (Cache wie in Schritt 4). Pro Festival
      und Lauf höchstens 8 noch nicht gecachte Acts recherchieren; der Rest bleibt bei den bisherigen
      Genres und kommt im nächsten Lauf dran. Bei leerem `acts`: `["festival", "reggae"]`.

   Erkennung ausserhalb von sources.json: Jeder Kandidat aus Agendas, Venue-Seiten oder Suche, der
   unter EINEM Namen an EINEM Ort 2–14 aufeinanderfolgende Tage umfasst (Festival, Open Air, Weekender,
   «2 Nächte»), wird ebenfalls als ein Eintrag mit `end_date` geschrieben – nie als ein Eintrag pro Tag.
   Slug für `id` und Merge: `name` aus sources.json, falls dort gelistet (so bleibt der Schlüssel stabil,
   auch wenn die Seite «REEDS 27» schreibt); sonst Festivalname ohne Jahr, ASCII, Kleinbuchstaben.
```

### 2.3 `SKILL.md` – Ergänzungen in «5. Merge and write»

```
Festival-Einträge (mit `end_date`) werden NICHT über Datum + Venue gemerged, sondern über den
Schlüssel `slug(name) + Jahr von date` (Daten verschieben sich um einen Tag, Venue-Namen variieren):

- Treffer → bestehende `id` behalten. Hat sich `date` verschoben, neue `id` schreiben (sie muss mit
  `date` beginnen), die alte fällt weg, Notiz «Datum verschoben» in `notes`.
- **Line-up-Seite geladen** → `acts` = Liste der Seite in Seiten-Reihenfolge. Ist die neue Liste
  KÜRZER als die bisherige, bisherige Liste behalten und loggen («Reeds 2027: Line-up kürzer als
  zuvor, nicht übernommen») – schützt vor halb geladenen Seiten; eine echte Absage korrigiert ein
  Mensch oder der nächste stabile Lauf.
- **Line-up-Seite NICHT geladen (Timeout, 403, Bot-Wall) → `acts` und `days` unverändert lassen,
  nur in `failed_sources` loggen. Nie ein Line-up wegen eines Ladefehlers verkleinern.**
- `days` pro Tag vereinigen (Union), nie verkleinern – ausser ein Act steht nicht mehr in `acts`;
  dann auch aus `days` entfernen (der Validator verlangt days ⊆ acts).
- `end_date` behalten, wenn die neue Seite die Daten nicht zeigt.
- **Agenda-Tageszeilen** (Petzi «Reeds Festival – Samstag», Skalender-Tageseinträge, Eventfrog-
  Ticketzeilen), deren normalisierter Titel den Namen eines bekannten Festivals enthält und deren
  Datum in dessen `[date, end_date]` liegt, sind KEINE eigenen Shows: ihre Acts in `acts` übernehmen
  und – weil die Agenda-Zeile ein konkretes Datum trägt – in `days[<datum>]`. Das ist vor dem
  offiziellen Running Order die Hauptquelle für Tageszuordnungen.
- Eine eigene Show am selben Ort innerhalb des Zeitraums gibt es nicht (Validator-Fehler); eine
  Afterparty in einem anderen Club bleibt eine normale Show.
- Schritt 5.3 «Drop past shows» heisst neu: weg, wenn `(end_date oder date) < heute`.
- Ein Festival zählt in added/updated/removed/total als 1. `notes` bekommt pro berührtem Festival
  eine Zeile: «Reeds 2027: 12 Acts, 3 Tage, 2 ohne Tag».
```

Erlaubte-Felder-Zeile in SKILL.md ergänzen um `end_date, days`. Ebenfalls Schritt 1.3 anpassen: «`festivals` wird von `/harvest-bands` **und** Schritt 2.5 genutzt».

---

## 3. UI-Spezifikation

Ziel: ein Festival ist **eine** Zeile im selben 3-Spalten-Grid (Datum | Inhalt | Kanton), erkennbar als Zeitspanne, mit Acts/Tagen auf Abruf, ohne neue Komponenten ausser nativem `<details>`.

Zeilen-Reihenfolge bleibt wie bei normalen Shows: **Titel → Acts → Meta → Chips/Aktionen** (Juror 2).

### 3.1 Sichtbare Unterschiede (vier, alle klein)

1. **Datumsspalte als Spanne:** `.dow` «FR–SO» (rot, wenn ein Tag der Spanne Fr/Sa/So ist), `.day` «16» wie heute, darunter neue dritte Zeile `.day-end` «–18» (0.85rem, muted; über Monatsgrenze «–2.8.»). Während `date ≤ heute ≤ end_date` zeigt `.dow` stattdessen **«LÄUFT»** in Gold.
2. **Karte:** `<li class="show range">` bekommt `background: var(--surface); border-radius: 10px; padding: 12px 10px; margin: 6px -10px`. Der `festival`-Chip wird gold statt grün (`.tag-chip.fest`). Das ist das ganze Festival-Signal – kein Badge, kein Kicker.
3. **Acts-Vorschau + Aufklapp-Zeile:** Für **jede** Show mit `acts.length > 5` (Festival oder nicht): `.acts` zeigt die ersten 4 Acts; darunter ein `<details class="lineup">`, dessen `<summary>` eine eigene, volle Zeile ist: «▸ Alle 12 Acts nach Tag» (ohne `days`: «▸ Alle 12 Acts»), offen: «▾ Weniger». Volle Zeilenbreite, min-height 32px, muted → klares Tap-Target. ≤ 5 Acts: `.acts` wie heute, kein Toggle. `acts` leer bei `end_date`: `.acts` zeigt «Line-up folgt» (muted), kein Toggle.
4. **Meta-Zeile:** `3 Tage · [HH:MM ·] Venue · Stadt [· ≈ km]` – «3 Tage» (bzw. «2 Tage») vorne statt der Zeit; `time` bleibt, falls gesetzt (Weekender).

Aufgeklappter Inhalt (`.days`-Grid, 2 Spalten `5.5ch | 1fr`): eine Zeile pro Tag in Datumsreihenfolge, Label «FR 16.», Acts mit Punkt-Trenner; danach «Tag offen» für Acts aus `acts`, die in keinem Tag stehen; Tage ohne Acts werden weggelassen. Ohne `days`: die komplette flache Liste (eine Zeile, umbrechend).

### 3.2 Desktop (760px), eingeklappt, zwischen zwei normalen Zeilen

```
JULI 2027
──────────────────────────────────────────────────────────────────────────────
 SA    Rhein Soundclash                                                  [⛨] BS
 11    Rhein Sound · Lion Vibes Hi-Fi · Dub Kartell
       22:00 · Kaserne · Basel
       [soundsystem] [dancehall]                       ▣ Kalender  ◎ WhatsApp  ⛓ Link
╭────────────────────────────────────────────────────────────────────────────╮
│ FR–SO  Reeds Festival 2027                                            [⛨] ZH │
│  16    Alborosie · Dub Inc · Gentleman · Protoje                             │
│  –18   ▸ Alle 12 Acts nach Tag                                               │
│        3 Tage · Seequai Pfäffikon · Pfäffikon ZH · ≈ 23 km                   │
│        [FESTIVAL] [reggae] [dub] [dancehall]       ▣ Kalender  ◎ WhatsApp  ⛓ Link │
╰────────────────────────────────────────────────────────────────────────────╯
 SA    Lion Steppers                                                     [⛨] ZH
 24    21:00 · Bogen F · Zürich
       [dub]                                           ▣ Kalender  ◎ WhatsApp  ⛓ Link
```

### 3.3 Desktop, aufgeklappt

```
╭────────────────────────────────────────────────────────────────────────────╮
│ FR–SO  Reeds Festival 2027                                            [⛨] ZH │
│  16    Alborosie · Dub Inc · Gentleman · Protoje                             │
│  –18   ▾ Weniger                                                             │
│        FR 16.   Dub Inc · Mellow Mood · Phenomden · Jahcoustix               │
│        SA 17.   Alborosie · Protoje · Dubblestandart                         │
│        SO 18.   Gentleman · Elijah · Open Season                             │
│        Tag offen  Iration · Jah Prayzah                                      │
│        3 Tage · Seequai Pfäffikon · Pfäffikon ZH · ≈ 23 km                   │
│        [FESTIVAL] [reggae] [dub] [dancehall]       ▣ Kalender  ◎ WhatsApp  ⛓ Link │
╰────────────────────────────────────────────────────────────────────────────╯
```

### 3.4 Phone 375px, eingeklappt (bestehender 420px-Breakpoint: 44px Datumsspalte, Aktions-Labels versteckt)

```
╭─────────────────────────────────────╮
│FR–SO  Reeds Festival 2027    [⛨] ZH │
│ 16    Alborosie · Dub Inc ·         │
│ –18   Gentleman · Protoje           │
│       ▸ Alle 12 Acts nach Tag       │
│       3 Tage · Seequai Pfäffikon ·  │
│       Pfäffikon ZH · ≈ 23 km        │
│       [FESTIVAL][reggae][dub]       │
│       [dancehall]          ▣  ◎  ⛓  │
╰─────────────────────────────────────╯
```

### 3.5 Phone 375px, aufgeklappt nach Suche «protoje» (automatisch offen, Treffer markiert)

```
╭─────────────────────────────────────╮
│FR–SO  Reeds Festival 2027    [⛨] ZH │
│ 16    Alborosie · Dub Inc ·         │
│ –18   Gentleman · ▌Protoje▐         │
│       ▾ Weniger                     │
│       FR 16. Dub Inc · Mellow Mood ·│
│              Phenomden · Jahcoustix │
│       SA 17. Alborosie · ▌Protoje▐ ·│
│              Dubblestandart         │
│       SO 18. Gentleman · Elijah ·   │
│              Open Season            │
│       Tag    Iration · Jah Prayzah  │
│       offen                         │
│       3 Tage · Seequai Pfäffikon ·  │
│       Pfäffikon ZH · ≈ 23 km        │
│       [FESTIVAL][reggae][dub]       │
│       [dancehall]          ▣  ◎  ⛓  │
╰─────────────────────────────────────╯
```

Kein horizontales Scrollen: Karte liegt in `.wrap` (16px Gutter), negative Margins (-10px) bleiben innerhalb des Gutters, `.days`-Grid bricht Acts unter ihrem Tag um.

### 3.6 Markup der Festival-Zeile (Referenz)

```html
<li class="show range weekend" id="2027-07-16-reeds-festival-pfaeffikon" data-id="…">
  <time class="date" datetime="2027-07-16/2027-07-18">
    <span class="dow">FR–SO</span>
    <span class="day">16</span>
    <span class="day-end">–18</span>
  </time>
  <div>
    <h3 class="title"><a href="…" target="_blank" rel="noopener">Reeds Festival 2027</a></h3>
    <p class="acts"><span>Alborosie</span><span>Dub Inc</span><span>Gentleman</span><span>Protoje</span></p>
    <details class="lineup">
      <summary aria-label="Line-up anzeigen (12 Acts)"><span class="open">Alle 12 Acts nach Tag</span><span class="close">Weniger</span></summary>
      <div class="days">
        <span class="d">FR 16.</span><span class="a"><span>Dub Inc</span><span>Mellow Mood</span>…</span>
        …
        <span class="d">Tag offen</span><span class="a"><span>Iration</span><span>Jah Prayzah</span></span>
      </div>
    </details>
    <p class="meta">3 Tage · Seequai Pfäffikon · Pfäffikon ZH<span class="dist">…</span></p>
  </div>
  <span class="canton">…</span>
  <div class="foot-row">
    <div class="tags"><span class="tag-chip fest">festival</span><span class="tag-chip">reggae</span>…</div>
    <div class="actions">… wie heute …</div>
  </div>
</li>
```

---

## 4. Verhalten

| Bereich | Verhalten |
|---|---|
| **Sortierung / Monatsliste** | Nach `date` (Tag 1) wie heute. Reeds steht im «Juli 2027» zwischen dem 11. und dem 24. Ein Festival 30.7.–1.8. steht nur im Juli. Erscheint genau einmal. |
| **Zähler** | `12 Konzerte · 1 Festival · Juli 2027` – Festivals (`end_date`) separat gezählt, wenn ≥ 1 sichtbar; sonst Text wie heute. |
| **Vergangene** | `_past = (_end ?? _day) < today`. Während des Festivals bleibt die Zeile oben und ungedimmt, `.dow` zeigt «LÄUFT»; nach dem letzten Tag dimmt sie wie jede Show und wandert hinter «Vergangene anzeigen». |
| **Wochenend-Tint** | `.weekend`, wenn irgendein Tag in `[date, end_date]` Fr/Sa/So ist (kleine Schleife). |
| **Kanton-Select** | Unverändert (`canton`). |
| **Genre-Chips** | Unverändert (any-match auf `genres`). Der `festival`-Chip erscheint automatisch in der Leiste (Chips werden aus den Daten gebaut) = «nur Festivals». `dub`/`ska` treffen, weil Festivals bis zu 3 Musik-Slugs tragen. Chip-Zählung zählt ein Festival einmal. |
| **Suche** | Unverändert: `acts` ist schon im Haystack, «protoje» findet Reeds. Zusatz: `render()` reicht `q` an `renderShow(s, q)` weiter; trifft `q` einen Act, wird `<details>` mit `open` gerendert und jeder treffende Act-Name in `<mark>` gehüllt (in Vorschau und Tagesblock). |
| **Aufklappzustand** | Nativ im `<details>`, kein JS-State. Weil `render()` den DOM bei jedem Tastendruck neu baut: 5 Zeilen `openIds`-Set via Capture-`toggle`-Listener auf `#list`; `renderShow` setzt `open`, wenn `openIds.has(s.id)` oder Suchtreffer. |
| **Kalender** | `icsFor`: bei `end_date` ganztägiger Mehrtages-Termin `DTSTART;VALUE=DATE:20270716` / `DTEND;VALUE=DATE:20270719` (exklusiv = end+1). `time` wird für Range-Einträge ignoriert. `DESCRIPTION` = Tageszeilen («Fr 16.: Dub Inc, Mellow Mood, …») bzw. flache Act-Liste, dann `url`, dann Deep-Link. Ohne `end_date` unverändert. |
| **WhatsApp** | `Reeds Festival 2027 – Fr 16.7. – So 18.7.2027 · Seequai Pfäffikon, Pfäffikon ZH\nmit Alborosie, Dub Inc, Gentleman, Protoje +8\n<Deep-Link>`. Ohne `end_date` unverändert. |
| **Link / Direktlink** | Unverändert (`#id`). `revealFromHash` setzt zusätzlich `row.querySelector("details.lineup")?.open = true`, damit ein geteilter Link auf dem offenen Line-up landet. |
| **Distanz** | Unverändert: `lat/lon` = Gelände, haversine, «≈ 23 km» in der Meta-Zeile. «Am nächsten bei dir» kann ein Festival nennen (Titel enthält «Festival»; Datum = Tag 1). |
| **Eintägiges Open Air** | Kein `end_date` → normale Datumsspalte, keine Karte; nur die Vorschau/Aufklapp-Regel greift (`acts > 5`). |
| **Datum unbekannt** | Kein Eintrag (Scraper-Regel). Nichts im UI. |
| **Accessibility** | `<summary aria-label="Line-up anzeigen (12 Acts)">`, `<time datetime="2027-07-16/2027-07-18">`, Tastatur/Screenreader via natives `<details>`. |

---

## 5. Änderungsliste

### 5.1 `app.js` (≈ 85 Zeilen; Zeilennummern = heutiger Stand)

| Stelle | Änderung |
|---|---|
| `init()` map, Z. 289–297 | `_end: s.end_date ? parseDay(s.end_date) : null`; `_past: (s._end \|\| s._day) < today`; `_now: s._end && s._day <= today && today <= s._end`. (3 Zeilen) |
| neuer Helfer `dateText(s)` (≈ 8) | Liefert «Fr 16.7.» bzw. «Fr 16.7. – So 18.7.2027»; genutzt von `shareText` und ggf. `geoStatus`. |
| neuer Helfer `isWeekendRange(s)` (≈ 4) | Schleife von `_day` bis `_end`, true bei Fr/Sa/So. |
| `shareText`, Z. 123–125 (≈ 6) | `if (s.end_date)`-Zweig mit `dateText` + «mit A, B, C, D +n». |
| `icsFor`, Z. 128–168 (≈ 10) | Vor dem bestehenden `if (s.time)`: `if (s.end_date) when = DTSTART;VALUE=DATE … DTEND;VALUE=DATE:<end+1>`; `DESCRIPTION` um Line-up ergänzen. |
| `renderShow(s, q)`, Z. 181–214 (≈ 40) | (a) `range`-Klasse + `datetime="a/b"` + `.dow` «FR–SO»/«LÄUFT» + `.day-end`; (b) Acts-Zweig: ≤ 5 wie heute; > 5 → 4er-Vorschau + `<details class="lineup">` mit Tagesblock (`days`) / flacher Liste / «Tag offen»; leer + `end_date` → «Line-up folgt»; (c) `open` bei Suchtreffer oder `openIds`; `<mark>` um Treffer; (d) Meta «n Tage ·» vorne; (e) `fest`-Klasse auf dem `festival`-Chip. |
| `render()`, Z. 216–278 (≈ 5) | `q` an `renderShow` durchreichen; Zähler mit «· n Festival(s)». Filter selbst unverändert. |
| `openIds`-Set (≈ 5) | `const openIds = new Set(); list.addEventListener("toggle", e => { if (!e.target.matches("details.lineup")) return; const id = e.target.closest(".show").dataset.id; e.target.open ? openIds.add(id) : openIds.delete(id); }, true);` |
| `revealFromHash`, Z. 387–399 (1) | `row.querySelector("details.lineup")?.setAttribute("open", "")`. |
| Geo-Hinweis, Z. 424 | Optional `dateText(n.s)` statt der Inline-Formatierung. |

Nicht angefasst: Filterlogik, Kanton-Select, Chip-Bau, Drag/Scroll, Geolocation, Sticky-Bar.

### 5.2 `style.css` (≈ 40 Zeilen)

```css
.show.range { background: var(--surface); border-radius: 10px; padding: 12px 10px; margin: 6px -10px; border-bottom: 0; }
.date .day-end { display: block; margin-top: 2px; font-size: 0.85rem; font-weight: 700; color: var(--muted); font-variant-numeric: tabular-nums; }
.show.now .date .dow { color: var(--gold); }
.tag-chip.fest { color: var(--gold); background: rgba(242, 182, 50, 0.14); }
.lineup { margin: 2px 0 0; }
.lineup summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 6px; min-height: 32px; font-size: 0.85rem; color: var(--muted); }
.lineup summary::-webkit-details-marker { display: none; }
.lineup summary::before { content: "▸"; color: var(--gold); }
.lineup[open] summary::before { content: "▾"; }
.lineup summary .close, .lineup[open] summary .open { display: none; }
.lineup[open] summary .close { display: inline; }
.lineup summary:hover { color: var(--text); }
.lineup summary:focus-visible { outline: 2px solid var(--gold); border-radius: 4px; }
.days { display: grid; grid-template-columns: 5.5ch minmax(0, 1fr); gap: 4px 10px; font-size: 0.92rem; }
.days .d { color: var(--muted); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding-top: 2px; }
.days .a span + span::before { content: " · "; color: var(--muted); }
.acts.none { color: var(--muted); font-style: italic; }
mark { background: rgba(242, 182, 50, 0.25); color: var(--gold); border-radius: 3px; padding: 0 2px; }
.show.past.range { opacity: 0.45; }
@media (max-width: 420px) { .show.range { margin: 6px -6px; padding: 10px 6px; } .date .day-end { font-size: 0.8rem; } }
```

`.show.highlight` (Flash + Goldstreifen) funktioniert auf der Karte unverändert.

### 5.3 `scripts/validate_shows.py` (≈ 40 Zeilen)

- `SHOW_OPTIONAL` + `end_date`, `days`.
- In `check_show`: Regeln 2–7 aus Abschnitt 1.3 (`end_date`-Parse/Range, past-by-`end_date`, `days`-Keys/Werte/Subset via `artist_key` mit «gemeint: …?», `acts`-Near-Duplikate und ≤ 40, `festival`-Pflicht + Limit 4 → `check_genres(where, genres, allowed, limit)`).
- In `check_shows`: zweiter Pass nach der Schleife für Regel 8 (Festival-Dedupe über `slug(title ohne Jahr)+Jahr`) und Regel 9 (In-Range-Check über `venue_key`).

### 5.4 Prosa und Daten

- `scraper/criteria.md`: 1 Zeile (Abschnitt 2.1).
- `.claude/skills/scrape-shows/SKILL.md`: Schritt 1.3 (ein Halbsatz), neuer Schritt 2.5 (≈ 25 Zeilen), Ergänzungen in Schritt 5 (≈ 15 Zeilen), erlaubte Felder + `end_date, days`.
- `data/venues.json`: Festivalgelände (Reeds, Lakesplash, Plein-les-Watts, Afro-Pfingsten) als Venues mit Koordinaten, `"scrape": false` – Voraussetzung, sonst lehnt der Validator den ersten echten Festival-Eintrag ab. Der Scraper legt sie beim ersten Lauf an, ein Mensch kann sie auch vorab eintragen.
- `data/shows.json` (mock): zwei Beispiel-Festivals (Reeds mit `days`, Dubquake Weekender) zum lokalen Prüfen bei 375px.
- Keine neuen Dateien, kein Build, kein Framework, keine Assets.

### 5.5 Risiko und Testplan

Risiko: **niedrig** für UI und Validator (rein additiv, alte Daten validieren unverändert, `<details>` läuft überall inkl. iOS Safari). **Mittel** für die Scraper-Disziplin in der ersten Saison (alte Acts, falscher Tag aus einem «Day 1»-Label) – begrenzt durch Subset-/In-Range-/Dedupe-Checks, die das alte Ein-Eintrag-pro-Tag-Muster zum harten Fehler machen, und durch das menschlich gepflegte JSON.

Test: Validator-Fälle für jede neue Fehlermeldung (end vor date, days ausserhalb Range, Act in days nicht in acts, > 40 Acts, Festival ohne `festival`-Slug, Tageszeile am selben Venue im Zeitraum, doppeltes Festival); `index.html` bei 375px mit beiden Mock-Festivals (eingeklappt/aufgeklappt, kein horizontales Scrollen); `.ics` als 3-Tages-Ganztagstermin in Apple/Google Calendar importieren; Suche nach einem Act im Tagesblock (auto-open + mark); Chip «festival»; Kanton-Filter; geteilter Link landet auf der offenen Karte; Mock mit `date` = gestern und `end_date` = morgen zeigt «LÄUFT» und bleibt ungedimmt.
