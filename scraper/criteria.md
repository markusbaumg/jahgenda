# What counts as reggae?

This file is the part of the scraper prompt that decides which shows make it into the agenda.
The scraper reads it on every run. Edit it, commit, done — no code involved.

## Included

A concert, party or session where **at least one act** clearly belongs to one of these genres:

- Reggae (roots, modern roots, lovers rock, reggae revival)
- Dub — dub techno only when it clearly comes from the reggae sound-system scene
- Ska, rocksteady, early reggae, 2-tone
- Ska-punk / third-wave ska, as long as ska clearly shapes the sound (horns, offbeat) — think Ska-P,
  The Mighty Mighty Bosstones, Talco
- Dancehall
- Sound-system nights and sound clashes
- Nyabinghi

Also included:

- Reggae festivals and reggae stages at bigger festivals (one entry per day)
- DJ nights where reggae / dancehall / ska is the main focus (e.g. "Roots Night", "Selecta Night")
- Tribute nights to reggae artists

## Excluded

- Mainstream club nights where dancehall is just one genre among many ("hip-hop, R&B, dancehall, afrobeats")
- Afrobeats, amapiano, reggaeton, latin without a clear reggae connection
- Punk, hardcore or rock bands that use ska only occasionally (one or two songs with horns do not make
  a ska band)
- Workshops, talks, films without live music or a DJ
- Events outside Switzerland — except in the nearby places listed below

## When in doubt

- Artists with a well-known reggae catalogue count, even if the current album is broader.
- Unknown acts: look them up briefly (Bandcamp, website, promoter text). If reggae, dub, ska or
  dancehall is stated as the main genre → in. Otherwise → out.
- Better to leave out one borderline entry than to include three wrong ones.

## Nearby

These places in the neighbouring countries are included too (country code instead of a canton:
`D`, `F`, `I`, `A`, `FL`):

- **D:** Konstanz, Singen, Friedrichshafen, Lindau, Lörrach, Weil am Rhein, Freiburg im Breisgau
- **F:** Annemasse, Thonon-les-Bains, Évian, Annecy, Saint-Louis, Mulhouse, Pontarlier
- **I:** Como, Varese, Domodossola, Aosta
- **A:** Bregenz, Dornbirn, Feldkirch
- **FL:** Vaduz, Schaan

Everything else outside Switzerland stays out.

## Genre slugs

Only the slugs in `data/genres.json` are allowed in `genres` (the validator checks this). That file also defines
the display order of the genre filter and what each slug covers. Edit it there, not here.
