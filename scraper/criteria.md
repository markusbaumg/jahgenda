# Was zählt als Reggae?

Diese Datei ist der Teil des Scraper-Prompts, der entscheidet, welche Konzerte in die Agenda kommen.
Sie wird vom Scraper bei jedem Lauf gelesen. Einfach hier anpassen, commiten, fertig.

## Rein kommt

Ein Konzert, eine Party oder eine Session, bei der **mindestens ein Act** klar in einem dieser Genres zuhause ist:

- Reggae (Roots, Modern Roots, Lovers Rock, Reggae Revival)
- Dub, Dub Techno nur wenn klar aus dem Reggae-Sound-System-Umfeld
- Ska, Rocksteady, Early Reggae, 2-Tone
- Ska-Punk / Third-Wave-Ska, solange Ska den Sound klar prägt (Bläser, Offbeat) – z. B. im Stil von Ska-P, The Mighty Mighty Bosstones, Talco
- Dancehall
- Soundsystem-Nächte und Soundclashes
- Nyabinghi

Auch rein kommen:

- Reggae-Festivals und Reggae-Bühnen an grösseren Festivals (als ein Eintrag pro Tag)
- DJ-Nächte, wenn Reggae / Dancehall / Ska der Hauptfokus ist (z. B. «Roots Night», «Selecta Night»)
- Tribute-Abende zu Reggae-Künstlern

## Bleibt draussen

- Mainstream-Clubnächte, bei denen Dancehall nur ein Genre unter vielen ist («Hip-Hop, R&B, Dancehall, Afrobeats»)
- Afrobeats, Amapiano, Reggaeton, Latin ohne klaren Reggae-Bezug
- Punk-, Hardcore- oder Rockbands, bei denen Ska nur ein gelegentliches Stilmittel ist (ein, zwei Songs mit Bläsern machen noch keine Ska-Band)
- Workshops, Vorträge, Filme ohne Live-Musik oder DJ
- Veranstaltungen ausserhalb der Schweiz – ausser an den grenznahen Orten unten

## Im Zweifel

- Künstler mit einem bekannten Reggae-Katalog zählen, auch wenn das aktuelle Album breiter ist.
- Bei unbekannten Acts: kurz nachschlagen (Bandcamp, Website, Veranstaltertext). Steht dort Reggae, Dub, Ska oder Dancehall als Hauptgenre → rein. Sonst → draussen.
- Lieber einen grenzwertigen Eintrag weglassen als drei falsche aufnehmen.

## Grenznah

Diese Orte in den Nachbarländern kommen auch rein (Länderkürzel als «Kanton»: `D`, `F`, `I`, `A`, `FL`):

- **D:** Konstanz, Singen, Friedrichshafen, Lindau, Lörrach, Weil am Rhein, Freiburg im Breisgau
- **F:** Annemasse, Thonon-les-Bains, Évian, Annecy, Saint-Louis, Mulhouse, Pontarlier
- **I:** Como, Varese, Domodossola, Aosta
- **A:** Bregenz, Dornbirn, Feldkirch
- **FL:** Vaduz, Schaan

Alles andere ausserhalb der Schweiz bleibt draussen.

## Genre-Slugs

Nur diese Schlagwörter sind für `genres` erlaubt (der Validator prüft das). Links der Slug, rechts, was darauf abgebildet wird:

- `reggae` – Reggae allgemein, Modern Roots, Reggae Revival, Lovers Rock, Mundart-Reggae
- `roots` – Roots Reggae, Nyabinghi-geprägter Roots, Rastafari-Reggae
- `dub` – Dub, Dub Techno aus dem Soundsystem-Umfeld, Steppers
- `soundsystem` – Soundsystem-Sessions, Soundclashes, Selecta-Nächte
- `dancehall` – Dancehall, Ragga, Bashment
- `ska` – Ska, 2-Tone, Third-Wave-Ska, Early Reggae
- `ska-punk` – Ska-Punk, Ska-Core
- `rocksteady` – Rocksteady
- `nyabinghi` – Nyabinghi-Trommeln
- `festival` – Festival oder Festivaltag mit mehreren Acts
