# Bands: who is in?

Here we decide by hand which acts the scraper follows. This file beats everything else: a band under
**Included** counts no matter what `criteria.md` says; a band under **Excluded** never gets its shows into
the agenda.

`/harvest-bands` adds new acts from festival line-ups under **Suggestions** (with genre and reason), and
`/scrape-shows` adds acts it kept after researching them. We then move the line up or down.
One line per act, format: `- Name — comment (optional)`.

Setting: **Search suggestions automatically: yes**
(`yes` = the scraper also searches for shows of acts under Suggestions, as long as they pass `criteria.md`;
`no` = only bands under Included.)

## Included

- Dub Inc
- Alborosie
- Gentleman
- The Skatalites
- Ska-P
- Talco

## Excluded

- Seeed — too pop, not really reggae
- Jan Delay — funk / hip-hop

## Suggestions

