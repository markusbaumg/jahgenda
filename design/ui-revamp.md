# Jahgenda UI Revamp — «Soundsystem Swiss»

Status: design spec, implementation-ready. Date: 2026-10-12. Scope: index.html, style.css, app.js (log.html shares style.css and must keep rendering). Constraints that do not move: no framework, no build step, one HTML / one CSS / one JS, dense scannable agenda, mobile first, LCP = first row text, offline-first PWA.

Basis: five expert reviews and three judges. Consensus: Direction 1 (Soundsystem Swiss) is the skin, Direction 2 (Selecta-Bar & Abfahrtstafel) supplies the story backlog and the time dimension, Direction 3 supplies the mobile measurements and performance budget, Direction 5 the motion system, Direction 4 the accessibility rules that act as definition of done on every story.

Two corrections to the reviews, verified in the checkout: the Liste / Kalender / Karte switch (`#view-switch.seg`), the month-grid calendar and the lazily loaded Leaflet map already exist in HEAD. Stories restyle and frame them; nothing is rebuilt. design/festival-spec.md explicitly rejected a Tickets button on festival rows; this spec uses a plain link affordance («Infos ↗») and no primary button.

---

## 1. Chosen direction

Swiss grid discipline printed in reggae ink.

Keep the International-Style skeleton that is already there (760 px column, flush left, strict three-column row, tabular numbers) and give it the ink of a screen-printed sound-system poster: one condensed display face used in exactly six places, the tricolor used as structure instead of decoration, the cross-on-stripes mark recurring as a stamp, time awareness (HEUTE / MORGEN / Wochenende), and four sound-system gestures as the only motion. Density goes up, not down: 6–7 rows per 375 px screen instead of 4.

Each stripe colour gets one job:

| Colour | Job | Used for | Never for |
|---|---|---|---|
| Red | Time pressure | HEUTE / MORGEN pill, LÄUFT, Wochenende rule, weekend DOW (as `--red-text`) | Buttons, chips, genre tags |
| Gold | Selection and attention | Active chip, focus ring, primary action, Merken star, highlight, month head | Body text, long runs of text |
| Green | Commitment and proximity | «Ich gehe», «≈ 4 km», canton abbreviation, link colour in prose, success toast | Genre tags, decorative fills |

Genre tags become muted inline words (`· dub · soundsystem`); the tricolor never competes with itself inside a row. The three colours appear together only in the stripe, the logo and `.rule-tri`.

Explicitly rejected (all judges): static canton SVG map (Leaflet exists), Tickets primary button, bottom thumb bar (the existing segmented view switch does the job), spinning record loader / tape loop / stylus / count ticking, genre chips in three colours, paper grain above 4 %, manual light-theme toggle (light palette is defined, ships behind the media query only after a contrast check), always-visible text labels on all four row actions at every width.

---

## 2. Design tokens

All tokens live on `:root` in style.css. Existing names are kept (`--bg`, `--surface`, `--line`, `--text`, `--muted`, `--red`, `--gold`, `--green`, `--green-text`, `--bar-h`); values marked «change» replace the current ones.

### 2.1 Colour (dark, default)

```css
:root {
  color-scheme: dark;
  /* surfaces */
  --bg:        #14110e;
  --surface:   #221c17;   /* change: was #1d1915 (1.08:1) -> 1.35:1, visible as a plate */
  --surface-2: #2a2219;   /* hover / pressed row, sheet header */
  --line:      #4d4036;   /* change: was #2e2822 (1.29:1) -> 3.2:1, controls get edges */
  --line-soft: #2e2822;   /* zebra / hairlines inside rows only, never as a control edge */
  /* text */
  --text:      #f3ead8;
  --muted:     #bcae98;   /* change: was #a39682 -> 8:1 on bg */
  --faint:     #7d7060;   /* only for decorative glyphs that have a text twin */
  /* brand fills (plates, rules, stripes, chip backgrounds) */
  --red:       #d8342f;
  --gold:      #f2b632;
  --green:     #1e8f4e;
  /* brand text variants (words on --bg / --surface, all >= 4.5:1) */
  --red-text:   #ff7a6e;  /* 5.6:1 */
  --gold-text:  #f2b632;  /* 10:1, gold is fine as text on dark */
  --green-text: #4fd08a;  /* change: was #3fbf73 -> 9:1 */
  --on-gold:    #14110e;  /* text on a gold fill */
  --on-red:     #fff5ec;
  --on-green:   #0f2a1a;  /* change: toast text dark on green (was cream, 3.45:1) */
  /* tints (14 % of the fill over --bg) */
  --red-tint:   rgba(216, 52, 47, .14);
  --gold-tint:  rgba(242, 182, 50, .14);
  --green-tint: rgba(30, 143, 78, .14);
  /* atmosphere */
  --sun:   radial-gradient(60vw 40vh at 0% 0%, rgba(242,182,50,.10), transparent 70%);
  --grain-opacity: .035;
}
```

### 2.2 Colour (light, defined now, shipped later)

Ships behind `@media (prefers-color-scheme: light)` only after both palettes pass the contrast table in section 6. No manual toggle until then. Warm paper, same roles.

```css
@media (prefers-color-scheme: light) { :root {
  color-scheme: light;
  --bg: #f7f0e3;  --surface: #fff9ee;  --surface-2: #f1e7d4;
  --line: #b9ab95; --line-soft: #e3d8c4;
  --text: #1b1510; --muted: #5e5347;   --faint: #8d816f;
  --red-text: #b4231e; --gold-text: #8a5f00; --green-text: #15733b;
  --on-gold: #1b1510;
  --sun: radial-gradient(60vw 40vh at 0% 0%, rgba(242,182,50,.18), transparent 70%);
  --grain-opacity: .05;
}}
```

Rule for both schemes: saturated `--red/--gold/--green` are fills and rules; words always use the `*-text` variant.

### 2.3 Typography

```css
:root {
  --font-body: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --font-display: "JahDisplay", Impact, "Arial Narrow Bold", "Helvetica Neue", Arial, sans-serif;
  /* scale, 16 px base; nothing in the agenda below --fs-1 */
  --fs-0: .78rem;    /* 12.5 px: tags only, bold, uppercase, +.06em */
  --fs-1: .8125rem;  /* 13 px: DOW, year, meta on 375 */
  --fs-2: .875rem;   /* 14 px: meta, actions, notice, chips */
  --fs-3: .9375rem;  /* 15 px: acts line, results line */
  --fs-4: 1rem;      /* 16 px: row title (1.0 / 600 on 375, 1.05 / 700 at >= 768) */
  --fs-5: 1.125rem;  /* 18 px: section titles, sheet titles */
  --fs-d1: 1.5rem;   /* 24 px: month head (display face) */
  --fs-d2: 2.1rem;   /* 34 px: day number desktop (1.7rem at < 420 px) */
  --fs-d3: clamp(2.4rem, 8vw, 3.6rem); /* wordmark */
  --lh-tight: 1.1;  --lh-body: 1.4;
  --track-caps: .1em;
}
```

Display face: ONE self-hosted woff2, latin + digits subset, ≤ 20 KB, `font-display: swap`, `<link rel=preload>`; candidates Anton (closest to poster lettering) or Big Shoulders Display 800. A `@font-face` fallback with `size-adjust` / `ascent-override` against Impact / Arial Narrow so there is no layout shift. Used only in: wordmark, day number, month head, HEUTE / MORGEN / LÄUFT pill, empty-state headline, count badge on the ★ button. If the owner wants zero font bytes, `--font-display` falls back to `system-ui` at weight 900 with `letter-spacing: -.03em` and the direction survives.

Tabular numerals everywhere a date or time appears: `.date, .meta time, .dist, .cal-num { font-variant-numeric: tabular-nums }`.

### 2.4 Spacing, layout, radii, shadows

```css
:root {
  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 24px; --s-6: 32px; --s-7: 48px;
  --wrap: 760px;  --gutter: 16px;
  --date-w: 48px;            /* 64px at >= 768 */
  --side-w: 44px;            /* right column: coat of arms + star */
  --tap: 44px;               /* minimum hit area on touch */
  --bar-top: 48px;  --bar-chips: 36px;
  --bar-h: calc(var(--bar-top) + var(--bar-chips)); /* 84 px, frozen; never changes after fetch */
  --month-h: 32px;           /* sticky month head */
  --r-1: 4px;   /* chips, tags, pills */
  --r-2: 8px;   /* inputs, buttons, mark at 40 px */
  --r-3: 12px;  /* cards, install banner, sheet */
  --r-pill: 999px;
  --sh-1: 0 1px 2px rgba(0,0,0,.45);            /* coat of arms, chips when pressed */
  --sh-2: 0 8px 24px rgba(0,0,0,.45);           /* banner, toast, popovers */
  --sh-bar: 0 4px 12px rgba(0,0,0,.35);         /* stuck filter bar */
  --ring: 0 0 0 3px var(--gold), 0 0 0 6px var(--bg); /* focus, double ring */
}
```

### 2.5 Motion tokens

One reggae bar at 75 bpm = 800 ms; every duration is a subdivision.

```css
:root {
  --t-1: 100ms;  /* press, tap feedback */
  --t-2: 200ms;  /* state swaps, chips, hover, fades */
  --t-3: 400ms;  /* row entrance, disclosure open, banner */
  --t-4: 800ms;  /* echo decay, locate pulse */
  --ease-tape: cubic-bezier(.4, 0, .2, 1);     /* everything */
  --ease-skank: cubic-bezier(.2, .9, .3, 1.1); /* presses and the banner only (one overshoot) */
  --stagger: 24ms;                             /* row entrance, capped at 10 rows */
}
@media (prefers-reduced-motion: reduce) {
  :root { --t-1: 0ms; --t-2: 0ms; --t-3: 0ms; --t-4: 0ms; }
}
```

### 2.6 Utilities

```css
.rule-tri { border-bottom: 3px solid; border-image: linear-gradient(90deg,
  var(--red) 33.3%, var(--gold) 33.3% 66.6%, var(--green) 66.6%) 1; }
.sr { /* exists */ }
body::before { /* sun + grain, fixed, pointer-events none, z-index 0 */
  content: ""; position: fixed; inset: 0; pointer-events: none;
  background: var(--sun), url("data:image/svg+xml,…feTurbulence 160x160…");
  opacity: 1; mix-blend-mode: normal; }
body::before { /* grain layer opacity via --grain-opacity on the SVG tile itself */ }
```

Grain: one inline SVG `feTurbulence` tile 160×160 as data URI, ≤ 1 KB, opacity `--grain-opacity` (3.5 % dark, 5 % light), no `backdrop-filter`, gated by `@media (min-resolution: 1.5dppx)`; drop it if scroll jank appears on low-end Android. Never animated.

---

## 3. Component specs

Width notes: desktop frames are the 760 px column inside 1200; mobile frames are 375 px with 16 px gutters (343 px content). Legend: `▌` left tick / fader, `━` tricolor rule, `⛨` coat of arms, `☆/★` Merken star, `▣` Kalender, `⇧` Teilen, `⛓` Link, `↗` external link.

### 3.1 Header and lockup

- Lockup: mark + «JAHGENDA» in the display face, JAH cream / GENDA gold, mark height = cap height × 1.15, mark baseline on the type baseline, 10 px gap, mark radius 8 px at 40 px. Fixes the «Jah genda» gap (cause: `.logo{display:flex;gap:.2em}` treats the text node and the `<span>` as separate flex items; wrap both words in `.logo-word` spans and set `gap:0`).
- The mark is present at every width, including 375 px.
- Tagline on one line: «REGGAE · DUB · SKA — SCHWEIZ», `--fs-1`, uppercase, `--track-caps`, separators as three tiny tricolor dots.
- Notice collapses to a one-line `<details class="note-pill">` in the results row: «ⓘ Von KI-Agenten gesammelt · beim Veranstalter prüfen ▾». Full text moves to About. Opening animates height over `--t-3`.
- Header is a normal scrolling element; only the filter bar sticks.

```
┌──────────────────────────────────────────────────────────────────────┐
│ ████████████ red ████ ▒▒▒▒▒▒▒▒ gold ▒▒▒▒▒ ░░░░░░░░ green ░░░░░ (6px) │
│                                                                      │
│  [✚]  JAHGENDA                 display face · JAH cream / GENDA gold │
│       REGGAE · DUB · SKA — SCHWEIZ   (caps, tracked, tricolor dots)  │
│                                                                      │
```

375 px:

```
┌─────────────────────────────────┐
│ ████ ▒▒▒▒ ░░░░            (6px) │
│ [✚] JAHGENDA                    │
│ REGGAE · DUB · SKA — SCHWEIZ    │
```

### 3.2 Filter bar (sticky, frozen height)

Two rows, 48 + 36 px on mobile, never grows after fetch or on stuck (the mini-brand is absolute inside the first row, not a third row). Chip row has `min-height: var(--bar-chips)` reserved before data arrives. When stuck: `--sh-bar` plus a `.rule-tri` 3 px bottom edge replaces the 2 px `--line`.

Desktop (≥ 768): search field permanent, canton `<select>` with `<optgroup>`s (Deutschschweiz · Romandie · Ticino · Grenznah) and counts («Bern (2)»), cantons with 0 upcoming shows hidden, locate button, always-visible ★ button with count (muted at 0, tooltip «Shows merken · nur in diesem Browser»).

Mobile (≤ 420): search takes the full 343 px (placeholder «Band, Club, Ort …» fits); the canton select and locate button become two chips at the end of the chip row: «Kanton ▾» (focuses / `showPicker()` the real, visually hidden `<select>`, so keyboard and screen-reader behaviour stays native) and «Nähe ◎». The ★ count sits right of the search field.

Chip row order: Wann chips first (Heute · Morgen · Wochenende · 7 Tage), a thin separator, then «Alle» + genre chips, then formats group (Festival), then Kanton ▾ / Nähe ◎ on mobile. The row scroll-snaps (`scroll-snap-type: x proximity`) and the active chip is kept in view with `scrollIntoView({inline:'nearest'})`.

```
desktop
│  [🔍 Band, Club, Ort …              ] [Alle Kantone ▾] [◎ Nähe]  [★ 2]   │ 48
│  (Heute)(Morgen)(Wochenende)(7 Tage) │ (Alle)(reggae)(roots)(dub)(ska)… ›│ 36
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ (stuck) │
│  13 Konzerte · Okt 2026 – Feb 2027  ⓘ KI-gesammelt ▾   Liste|Kalender|Karte│
│  dub ✕ · Bern ✕                                                           │  ← active filter pills (only when any)

375 px
│ ✚ [🔍 Band, Club, Ort …        ] [★2]│ 48   (✚ = mini-brand, absolute, scroll-to-top)
│ (Heute)(Wochenende)│(Alle)(reggae)(dub)…›│ 36   (… Kanton ▾)(Nähe ◎) at the end
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ 13 Konzerte · Okt–Feb   Liste|Kal|Karte│
│ dub ✕ · Bern ✕                         │
```

### 3.3 Chips

- Height 32 px (36 px hit area via padding), `--fs-2`, 1 px `--line` border (now visible), radius `--r-1`, muted text.
- Pressed (`aria-pressed=true`): gold fill, `--on-gold` text, weight 600, 2 px border; `forced-colors: active` adds a 3 px solid border so the state is not colour-only.
- Wann chips are mutually exclusive; genre chips are exclusive as today; format chips (Festival) are a separate group.
- `:active { transform: scale(.96) }` over `--t-1 var(--ease-skank)`.
- Every chip may show a count («dub 4») once the count helper exists (S6); counts never change layout (reserved width via `min-width`).

```
( Heute )  ( Wochenende )  [ dub 4 ]  ( ska 2 )  ( Festival 1 )  ( Kanton ▾ )  ( Nähe ◎ )
 muted        muted          gold,on-gold text, 600     muted
```

### 3.4 Results line and active filter pills

Count + span on the left, note pill, view switch on the right. Active filters render as removable gold pills on a second line («dub ✕ · Bern ✕ · Wochenende ✕»), each removes only that dimension; «Alles zurücksetzen» appears only when ≥ 2 pills. «Vergangene anzeigen (n)» leaves this line and becomes a footer row under the list. `#results` keeps `aria-live="polite"` and gets `tabindex="-1"` as the focus fallback after render.

### 3.5 Month divider

Display face `--fs-d1` uppercase «OKTOBER» + «2026» in `--fs-1` muted, sitting on a 3 px `.rule-tri`. Sticky under the bar at `--month-h`; when stuck, a 1 px gold hairline draws left to right over `--t-2`, the previous head fades to .6. Festivals crossing into the month append a ghost row directly under the head.

```
│  OKTOBER  2026                                                       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  ↳ Reeds Festival läuft noch bis So 1. Aug            (ghost row)    │
```

Inside a month, rows are grouped by day: one date cell per day, rows of that day share it, hairline `--line-soft` between rows of the same day, nothing between days (the new date cell is the separator). A «Wochenende» sub-rule (1 px, `--red`, label `--fs-1` `--red-text`) precedes the first Friday of the coming weekend only.

### 3.6 List row (3-line stack)

Grid `[var(--date-w)] [1fr] [var(--side-w)]` at every width. Whole row has a 3 px left fader track: empty by default, gold when Merken, green when Ich gehe; slides in over `--t-2`. Row min-height 64 px; target 96–104 px at 375 px with acts, 6–7 rows per screen.

Date cell: DOW `--fs-1` uppercase tracked above the day number in the display face (`--fs-d2`, line-height .9), tabular. Weekend DOW in `--red-text` only for Fr/Sa/So of the *coming* weekend (not every weekend row). Today and tomorrow replace the DOW with a red pill HEUTE / MORGEN (`--red` fill, `--on-red`, display face `--fs-1`); the pill is text, so no colour dependency. Computed at render time from the client clock, re-rendered on `visibilitychange`; only rendered when `data.updated` is fresher than 48 h.

`<time datetime="2026-10-16" aria-label="Freitag, 16. Oktober 2026">`.

Content column:
1. Title `--fs-4`, 600/700, cream, wraps (never truncated). With URL: dotted gold underline + «↗» + `<span class="sr">(öffnet externe Seite)</span>`; without URL plain text.
2. Acts line `--fs-3` cream, hairline left tick in `--line`, `· ` separated, only when acts > 1; on 375 px clamp to 2 lines with `-webkit-line-clamp`, expanded when a search hit is inside it (`<mark>` per festival spec) or when the row is expanded.
3. Meta `--fs-2` muted: `20:30 · Dachstock · Bern · ≈ 12 km`; time in cream tabular; distance in `--green-text`; genres appended as muted words `· dub · soundsystem` (no pills) unless a genre chip is active, in which case the active genre is omitted from the suffix.

Side column (44 px): coat of arms 28×32 with `--sh-1` + abbreviation in `--green-text` `--fs-1` (a `<button aria-pressed aria-label="Nur Bern anzeigen">`, abroad: «Deutschland, grenznah»); below it the Merken star (44×44). Past rows: muted text (not opacity), grey left plate, the word «vorbei» appended to the meta line.

Actions (`.actions`): appear on their own 44 px row below the meta at ≤ 420 px, inline at the right on ≥ 768 px: `[▣ Kalender] [⇧ Teilen] [⛓ Link]` plus «Infos ↗» when the show has a URL. Icons 18 px with visible labels at ≥ 768 px; at ≤ 420 px icon-only is allowed only with a 44×44 hit area, `aria-label`, and feedback words rendered as a 1.2 s inline word next to the icon («Kopiert», «Gespeichert», «Ich gehe»). Teilen uses `navigator.share({title,text,url})`, falls back to the WhatsApp link (so WhatsApp never disappears for users without share). `.act span { display:none }` at ≤ 420 px is deleted.

Desktop:

```
│   FR     Alpine Dub Collective + Support ↗                   ⛨      │
│   16     ┆ Alpine Dub Collective · Mista Sanchez             BE     │
│          20:30 · Dachstock · Bern · ≈ 12 km · dub            ☆      │
│                                       ▣ Kalender  ⇧ Teilen  ⛓ Link │
│  ────────────────────────────────────────────── (--line-soft, same day only)
│  ─ Wochenende ────────────────────────────────────────── (red, 1px) │
│▌  SA     Rhein Soundclash                                    ⛨      │
│▌  17     ┆ Rhein Sound · Lion Vibes Hi-Fi · Dub Kartell      BS     │
│▌         22:00 · Kaserne · Basel · soundsystem · dancehall   ★      │  ▌green = Ich gehe
│                                       ▣ Kalender  ⇧ Teilen  ⛓ Link │
│  HEUTE   Lion Steppers ↗                                     ⛨      │  red pill in DOW slot
│   24     21:00 · Bogen F · Zürich · ≈ 4 km · dub             ZH ☆   │
│          Irie Halloween Dance                                ⛨      │  same day, shares cell
│          22:00 · Grabenhalle · St. Gallen · reggae           SG ☆   │
```

375 px:

```
│ FR  Alpine Dub Collective        ⛨ │
│ 16  + Support ↗                  BE│
│     ┆ Alpine Dub Coll. · Mista S.  ☆│
│     20:30 · Dachstock · Bern · dub  │
│     [▣]   [⇧]   [⛓]   [Infos ↗]    │  44 px row
│ ─ Wochenende ────────────────────── │
│▌SA  Rhein Soundclash             ⛨ │
│▌17  ┆ Rhein Sound · Lion Vibes · BS│
│▌    ┆ Dub Kartell                 ★│
│     22:00 · Kaserne · Basel         │
│     soundsystem · dancehall         │
│     [▣]   [⇧]   [⛓]                 │
│HEUTE Lion Steppers ↗             ⛨ │
│ 24  21:00 · Bogen F · Zürich · dub ZH☆│
│     Irie Halloween Dance         ⛨ │
│     22:00 · Grabenhalle · St. G. SG☆│
```

### 3.7 Festival row («dubplate» card, per festival-spec.md)

One row per festival regardless of length, placed in its start month, plus a ghost row at the top of every later month it touches. Surface card with a 3 px `.rule-tri` top edge, radius `--r-3`, the cross mark as an 8 % watermark bottom-right (never animated). Date cell shows «FR–SO» over «16–18» (display face, smaller), `<time datetime="2026-07-16/2026-07-18">`. Running festival: gold pill «LÄUFT» in the DOW slot. Line-up: first 4 acts inline, then `<details>` «▸ Alle 12 Acts nach Tag» with a 40 px summary, days as a definition-style grid. No Tickets button; «Infos ↗» link like any row. `festival` is a format chip, not a genre chip.

```
│ ┌━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┐ │
│ │ FR–SO   Reeds Festival 2027 ↗                             ⛨    │ │
│ │ 16–18   ┆ Alborosie · Dub Inc · Gentleman · Protoje       ZH   │ │
│ │ LÄUFT   ▸ Alle 12 Acts nach Tag                           ☆    │ │
│ │         3 Tage · Seequai · Pfäffikon ZH · festival · reggae    │ │
│ │                                   ▣ Kalender  ⇧ Teilen  ⛓ Link ✚│ │  ✚ = 8 % watermark
│ └────────────────────────────────────────────────────────────────┘ │
```

Festival strip (horizontal row of 140×180 cards under the bar, not sticky) is out of scope for this revamp; it is listed as a later story because the current data has no `end_date` entries yet.

### 3.8 Empty state

Names the cause and offers per-filter removal. Headline in the display face, one inline SVG in brand line weight (sun over mountains, from design/logos.html 05/06) replacing the emoji. The removal that yields the most results is computed and listed first.

```
│              ╭───╮                                                   │
│             ╱ ☼ ╲   (inline SVG, --faint, 48 px)                     │
│   KEIN DUB IM TESSIN                                                 │
│   Für diese Auswahl gibt es gerade nichts.                           │
│   [ Tessin entfernen → 4 Shows ]  [ dub entfernen → 0 Shows ]        │
│   Alles zurücksetzen                                                 │
```

Loading state: six skeleton rows in the final `.show` grid (date block, two bars, badge) using `--surface`, 1.2 s shimmer on opacity only; the chip row keeps its reserved height so `--bar-h` never changes.

### 3.9 Install banner and toast

- Banner shows from the second visit only (first-visit timestamp in localStorage, same pattern as the dismissal); `body.has-banner main { padding-bottom: 120px }`; `role="region" aria-label="App installieren"`; enters from +24 px with `--ease-skank` over `--t-3`; swipe-down to dismiss (translateY follows the finger, snaps away past 40 px). iOS copy adds «Markierungen gelten pro App».
- Update toast docks above the banner when both exist (`bottom: calc(var(--banner-h) + 24px)`), cream text on `--surface`, green «Aktualisieren» pill with `--on-green` text.

```
│ ╭─────────────────────────────────────────╮
│ │ [✚]  Jahgenda als App              ✕    │  --surface, --r-3, --sh-2, 3 px .rule-tri top
│ │      Offline, schnell, mit Markierungen │
│ │      [ Installieren ]   Nie mehr fragen │  44 px
│ ╰─────────────────────────────────────────╯
```

### 3.10 Footer and About

«Vergangene anzeigen (n)» is the last row of the list (`.foot-row`, muted, full width, 44 px). About: section title with the cross mark stamped at 96 px / 12 % behind it, photo ring tricolor (exists), full «Gut zu wissen» text here, update stamp, links in `--green-text`. The bottom stripe stays (it is the only element that closes the page).

```
│  ↑ 1 vergangene Show anzeigen                                        │
│                                                                      │
│  ✚ ÜBER JAHGENDA                 (mark 96 px, 12 %, behind title)    │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  (◎ photo, tricolor ring)  Jahgenda sammelt … Von KI-Agenten …       │
│  Stand: 12. Okt 2026 · Log · GitHub                                  │
│ ████████████ ▒▒▒▒▒▒▒▒▒▒▒▒ ░░░░░░░░░░░░ (6px)                         │
```

### 3.11 Calendar view frame (exists, restyled)

Same filtered set as the list. Month title in the display face with `.rule-tri`; cells 1 px `--line-soft`; today cell gets a gold ring; dots by format: cream show, gold festival, green «Ich gehe»; tapping a day sets Wann = that day (chip «Fr 16. ✕» appears as a pill). Pills inside cells keep `--pill` colour but use `--fs-0` bold.

```
│  OKTOBER 2026                                    ‹  Heute  ›         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  MO   DI   MI   DO   FR   SA   SO                                    │
│                      1    2    3                                     │
│                           ·                                          │
│   5    6    7    8    9   10   11                                    │
│  12   13   14   15  [16]  17   18     [16] = today, gold ring        │
│                      ·    ·                                          │
│  19   20   21   22   23   24   25                                    │
│                           ·●          ● green = Ich gehe             │
```

### 3.12 Map view frame (exists, Leaflet lazy)

Map container with `--r-3`, 1 px `--line`; markers use the three roles (gold festival, cream show, green Ich gehe), popup list rows reuse `.popup-shows` with tabular dates; legend below in `--fs-1`. Offline: «Karte braucht Netz» note in the frame with the list link; Leaflet stays in the `jahgenda-lib` cache and never loads on the agenda path.

```
│ ┌────────────────────────────────────────────────────────────────┐   │
│ │   ·BS                                                          │   │
│ │              ·ZH ●SG                          (tiles)          │   │
│ │       ·BE                                                      │   │
│ │  ·GE      ·VD                                                  │   │
│ │                        ·TI                                     │   │
│ └────────────────────────────────────────────────────────────────┘   │
│  · Show   ● Ich gehe   ◆ Festival          Karte braucht Netz        │
```

---

## 4. Motion guidelines

Four sound-system gestures, each used once, all transform/opacity only, all inside `@media (prefers-reduced-motion: no-preference)`; the reduced path keeps colour-state changes with 0 ms transitions.

1. Fader (mark): the 3 px left track slides in from the left over `--t-2` when a show is marked; gold for Merken, green for Ich gehe.
2. Echo (commit): on «Ich gehe» three ghost stars scale 1 → 1.8 and fade at 0 / 120 / 240 ms. Used nowhere else.
3. Switch-on (load): the top stripe draws in once, `scaleX 0 → 1`, 450 ms `--ease-tape`. No tape loop, no record.
4. Rewind (pull-up): tapping the mini-brand in the stuck bar scrolls to top; no stripe animation (judges rejected it), just `scroll-behavior` respecting reduced motion.

Everything else:
- Press: `.show:active, .chip:active, .act:active { transform: scale(.98) }` over `--t-1 var(--ease-skank)`; `-webkit-tap-highlight-color: transparent`; `touch-action: manipulation` on buttons.
- Filter change: `document.startViewTransition` guard around `render()` (3 lines); rows enter with `--stagger` and `translateY(6px) → 0 + opacity`, capped at 10 rows; fallback is a `--t-2` opacity dip on `#list`. No count ticking.
- Disclosure (note pill, festival line-up): `grid-template-rows 0fr → 1fr` over `--t-3`.
- Sticky month head: 1 px gold hairline draws over `--t-2` when stuck.
- Locate: button box-shadow ring expands over `--t-4`, repeating until a fix; distances fade in per row with `--stagger`.
- Feedback words («Kopiert», «Gespeichert», «Ich gehe»): fade in over `--t-2`, stay 1.2 s.
- Banner / toast: enter from +24 px with `--ease-skank`, `--t-3`.
- Never animate: height of the sticky bar, the grain, the sun glow, the watermark, anything looping (no on-air pulse).
- Performance: `content-visibility: auto; contain-intrinsic-size: 1px 600px` on each month `<section>`; `will-change` nowhere.

---

## 5. Accessibility rules (definition of done on every story)

Contrast (dark): all text ≥ 4.5:1, control edges ≥ 3:1. Required pairs: `--muted` on `--bg` 8:1, `--red-text` 5.6:1, `--green-text` 9:1, `--gold-text` 10:1, `--on-gold` on `--gold` 9:1, `--on-green` on `--green` ≥ 4.5:1, `--line` on `--bg` 3.2:1. Past rows use muted text, never opacity below 1, and the word «vorbei».

Size: no agenda text below 13 px (`--fs-1`); tags 12.5 px only when bold uppercase. Every interactive element ≥ 24×24 CSS px, ≥ 44×44 on touch (`--tap`). Nothing is icon-only without an `aria-label` and a visible feedback word for state changes.

Focus: one global rule `:focus-visible { outline: none; box-shadow: var(--ring) }` on every interactive element (inputs, chips, acts, canton buttons, `.linkish`, title links, install and toast buttons, geo links, seg buttons); per-component variants are removed. After every `render()`, focus is restored to the element with the same `data-id` + `data-act` / `data-canton` / `data-view`; fallback `#results` (`tabindex=-1`). Skip link «Direkt zum Programm» as the first focusable element. Open `<dialog>`s (if any later) are rendered outside `#list`.

Semantics: `<time>` carries `aria-label` with the full German date; canton buttons `aria-pressed` + «Nur Bern anzeigen» / «Deutschland, grenznah»; title links show «↗» and sr text «(öffnet externe Seite)»; the star has `aria-pressed` and sr state text; the segmented Interessiert | Ich gehe is a `role="group"` of two `aria-pressed` buttons; `#results` and the feedback region are `aria-live="polite"`; the geo pin emoji is `aria-hidden` with sr text; the install banner is `role="region"`; decorative SVGs are `aria-hidden`.

Preferences: `prefers-reduced-motion` (all motion tokens 0, `scrollIntoView` behavior auto, chip `scroll-behavior` auto, no flash keyframe, highlight becomes a static 3 s gold edge); `prefers-contrast: more` bumps `--muted` to `--text` and `--line` to `--muted`; `forced-colors: active` gives pressed chips, marked rows and the Ich gehe state a 3 px solid border and keeps SVG icons on `currentColor`.

Zoom and viewport: sticky stack ≤ 84 px bar + 32 px month head at 375 px; at 200 % zoom the bar unsticks (`@media (max-height: 500px) { .filters { position: static } }`); `body` gets bottom padding while the banner is visible; no horizontal scroll at 320 px.

Language: all UI copy in German, `lang="de-CH"`, dates via `Intl.DateTimeFormat('de-CH')`.

---

## 6. Requirements coverage

Owner features mapped to stories so nothing is left out.

| Requirement | Story |
|---|---|
| Search, canton, genre filters | S2 (bar), S6 (optgroups, counts, pills) |
| Month-grouped list, canton coats of arms | S1 (month heads), S3 (day groups), S4 (row) |
| Acts line | S4 |
| Kalender / WhatsApp / Link actions | S4 (plus Teilen via navigator.share, Gespeichert feedback) |
| Geolocation distances | S2 (Nähe chip), S4 (distance in meta), S8 (locate pulse) |
| Install banner (PWA) | S8 |
| About section with photo | S1 (watermark), S2 (notice text moves here) |
| Calendar + map views | S8 (restyle existing views, hash parser from S6) |
| Interessiert / Ich gehe marks | S5 |
| Festival rows | S7 |
| Venue / ticket links | S4 («Infos ↗», title affordance) |
| More character, joy, fast, dense, mobile first | S1, S3, S4, S8 and the quick wins |

---

## 7. Implementation plan (8 sub-stories, each ≤ 1 day, in priority order)

Each story is independently shippable; the a11y rules in section 5 are its definition of done; every story ends with screenshots at 1200 / 768 / true 375 (iframe trick, headless Chrome clamps at 500 px) and a check of log.html.

### S1 — Brand skin: tokens, lockup, display face, month heads (0.5–1 day, CSS only + 1 font file)
- Replace tokens per section 2 (`--surface`, `--line`, `--muted`, add `--red-text`, `--green-text` bump, `--on-*`, tints, spacing, radii, shadows, motion).
- Fix the lockup (gap, baseline, mark present at 375), tagline one line with tricolor dots.
- Add `@font-face` JahDisplay (≤ 20 KB, preload, size-adjusted fallback); apply to wordmark, day number, month head.
- `.rule-tri` utility under `.month`, `.section-title`, `.filters.stuck`, festival cards; month heads `--fs-d1` + muted year.
- `body::before` sun + grain (gated), cross-mark watermark in About.
- Genre tags → muted inline words in the meta line (`.tag-chip` removed from rows, kept for the shared-list panel).
- Done when: no «Jah genda» gap at 1200, mark visible at 375, month head is the loudest element in the list, contrast table passes.

### S2 — Header and sticky bar: notice collapse, frozen height, mobile chips, skeleton (1 day)
- `<details class="note-pill">` in the results row; full text to About; ~90 px recovered at 375.
- Mini-brand absolute inside the toolbar row; chip row `min-height`; `--bar-h` constant 84 px mobile / 96 px desktop; `setBarHeight` only runs once.
- ≤ 420 px: hide the select + locate button visually, add «Kanton ▾» (focus / `showPicker()` on the real select) and «Nähe ◎» chips at the end of the chip row; ★ count always visible right of the search.
- Six skeleton rows in `#status` while fetching; search input debounced 120 ms.
- Done when: first row starts above y = 420 at 375×812; bar height never changes after fetch; placeholder not truncated.

### S3 — Time dimension: Wann chips, HEUTE / MORGEN, Wochenende rule, day grouping, past footer (1 day, app.js render)
- Wann chips Heute · Morgen · Wochenende · 7 Tage (filter on `_day`), exclusive, before genre chips; state in a single `state.wann`.
- Day grouping inside a month: `<section class="day">` per date with one `<time>` cell; rows of the day share it; hairline between same-day rows only.
- HEUTE / MORGEN red pill in the DOW slot, computed at render, re-rendered on `visibilitychange`, gated on `data.updated` < 48 h; weekend `--red-text` only for the coming weekend; «Wochenende» rule before its first Friday.
- «Vergangene anzeigen (n)» moves to `.foot-row` under the list.
- Done when: «what's on this weekend» is one tap; a day with three shows renders one date cell; deep links (`#id`), highlight and zebra still work.

### S4 — Row and actions: 3-line stack, 44 px targets, Teilen, link affordance, feedback (1 day)
- Row grid `[48 | 1fr | 44]` at 375 (`[64 | 1fr | 44]` desktop); coat of arms 28×32 + green abbreviation + star in the side column; acts clamp 2 lines with `<mark>` expansion; meta with time cream tabular, distance green, genres muted suffix; «vorbei» word on past rows.
- Delete `.act span{display:none}`; `.actions` on its own 44 px row at ≤ 420, inline on desktop; `aria-label` on each; feedback words via a helper (`flashWord(btn, 'Kopiert')`) and a page-level `aria-live` region; «Gespeichert» after `.ics` download.
- «Teilen» with `navigator.share`, WhatsApp fallback; «Infos ↗» action and title affordance (dotted underline, ↗, sr text) when `url` exists.
- `:active` states, `touch-action: manipulation`, tap-highlight transparent.
- Done when: 6+ rows per 375×812 screen, every target ≥ 44 px on touch, «Kopiert» visible on a phone, titles with URL distinguishable from titles without.

### S5 — Meine Shows: two explicit states, always-visible ★, fader + echo, undo (1 day)
- Star = Merken on/off (`aria-pressed`); inside marked rows a 2-segment toggle «Interessiert | Ich gehe» (role group, `aria-pressed`), also inline in the Mine panel; long-press on the star as a shortcut to Ich gehe only as an addition.
- Fader track (gold / green) with `--t-2` slide; echo stars on Ich gehe; toast «Entfernt · Rückgängig» 4 s on un-mark.
- Mine panel header «Meine Shows · 2 · nur in diesem Browser» with Kalender (.ics) · Teilen · Link; shared lists (`#m=`) keep the banner; `tag-chip «geht hin»` becomes green text.
- Done when: no accidental un-mark through cycling; state readable without colour (sr text + labels); `saveMarks` schema unchanged so existing marks survive.

### S6 — Filters, empty state, focus restore, hash parser (1 day)
- Canton `<select>` with `<optgroup>`s and counts, 0-count cantons hidden; counts helper reused for chips.
- Active filters as removable pills on the results line; «Alles zurücksetzen» only with ≥ 2.
- Empty state computes the single-filter removal with the most results and offers it first; inline SVG replaces emoji (also install icon and loading).
- `render()` remembers `document.activeElement` (`data-id` + `data-act` / `data-canton` / `data-view`) and refocuses after `innerHTML` replace; fallback `#results`.
- One `parseHash()` returning `{id, mine, view}`; `revealFromHash`, `showShared`, `setView` consume it; order stable; `#view=` written by the segmented control.
- Done when: keyboard user never lands on `<body>` after a filter; `#k3f9zq`, `#m=…` and `#view=calendar` all resolve from one function.

### S7 — Festival rows: dubplate card, LÄUFT, line-up details, ghost row, format chip (1 day)
- Implement festival-spec.md rendering inside `renderShow` for shows with `end_date`: `.show.festival` card with `.rule-tri` top, FR–SO / 16–18 date cell, LÄUFT pill, 4 inline acts + `<details>` by day, watermark, no Tickets button.
- Ghost row «↳ … läuft noch bis So 1. Aug» at the top of each later month section (derived in `render()` from the same filtered array).
- «Festival» moves from genre chips to a format chip group; calendar dots and map markers use the gold festival role.
- Done when: a 30.7.–1.8. fixture shows in July as a card and in August as a ghost; Kalender export spans the full range; search hits inside the line-up expand the details.

### S8 — Views, motion system, performance and PWA polish (1 day)
- Restyle calendar and map frames to tokens (section 3.11 / 3.12); map offline note; Leaflet stays lazy.
- Motion: tokens, one `prefers-reduced-motion` block, `startViewTransition` guard, row stagger, stripe switch-on, locate pulse, sticky month hairline, banner `--ease-skank` + swipe-dismiss, toast docking.
- Performance: `content-visibility: auto` per month section; `svgo` over `img/cantons` (FL.svg 143 KB → 2-rect flag, TG, VD), sw.js precaches only cantons present in `data/shows.json`; preload the display font.
- Install banner from the 2nd visit, `body.has-banner` padding, iOS «Markierungen gelten pro App» copy; `prefers-contrast` and `forced-colors` rules; skip link; `@media (max-height: 500px)` unstick.
- Done when: shell ≤ 30 KB gz + ≤ 20 KB font, cantons ≤ 3 KB each, no layout shift from the bar, Lighthouse a11y ≥ 95, map still loads only on the Karte tab.

Later backlog (not in this revamp): light theme shipped behind `prefers-color-scheme` after a contrast check; festival strip under the bar once `end_date` data exists; Wo bottom sheet with regions as chips (keep the native select until then); long-list virtualisation if the season passes ~300 rows.

---

## 8. Quick wins today (each ≤ 1 hour, CSS/JS only, no data changes)

1. Lockup: wrap «Jah» and «genda» in `.logo-word` spans, set `.logo{gap:0}`, align the mark with `vertical-align:-.12em; height:1.05em`, and show the mark at 375 px.
2. Tokens: `--line #4d4036`, `--muted #bcae98`, add `--red-text #ff7a6e` for `.show.weekend .dow`, dark text on the green toast.
3. `.rule-tri` utility applied to `.month`, `.section-title` and `.filters.stuck`; month heads 1.3rem / 900 / `.04em` with the year as a muted span.
4. Delete `.act span{display:none}` at ≤ 420 px; give `.act` `min-height:44px; min-width:44px; padding:10px` and move `.actions` to its own row there.
5. Collapse the notice into a one-line `<details>` in the results row; move the full text to About.
6. Freeze the bar: `.mini-brand` absolute inside the toolbar row, `.genres{min-height:36px}`.
7. Global `:focus-visible { box-shadow: var(--ring) }`, remove per-component rings; add the `prefers-reduced-motion` block (flash keyframe, smooth scroll, banner slide).
8. `render()`: remember and restore focus by `data-id` + `data-act` / `data-canton`; fallback `#results` with `tabindex=-1`.
9. `.today` class with a red HEUTE pill in the DOW slot (gated on `data.updated` < 48 h) and a «Wochenende» rule before the coming weekend; stop colouring every Fr/Sa/So red.
10. `:active { transform: scale(.98) }` on `.show, .chip, .act` with a 100 ms transition; `-webkit-tap-highlight-color: transparent`.
11. «Gespeichert» feedback after `downloadIcs`, reusing the «Kopiert» pattern; «Teilen» via `navigator.share` with the WhatsApp link as fallback.
12. `aria-label` with the full German date on `<time>`, «Nur Bern anzeigen» on canton buttons, visible «↗» + sr text on title links, `aria-hidden` on the geo emoji.
13. Genre tags as muted inline words after the venue instead of green pills.
14. `chip.scrollIntoView({inline:'nearest'})` on genre tap; 120 ms debounce on the search input; `content-visibility:auto` on month sections.
15. `svgo img/cantons/*.svg` and replace FL.svg with a two-rect flag; precache only cantons present in shows.json.
