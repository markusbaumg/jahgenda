# Jahgenda on the phone: the PWA concept (implementation-ready)

Repo: `/Users/markus/dev/reggae` (deployed as `https://markusbaumg.github.io/jahgenda/`). Based on Concept 2 ("Eisern") as the judges' winner, with the "steal" items from Concepts 1 and 3 that add no complexity. Written against the code that is already on `main` (commit `8a1bac6`, "PWA: manifest, service worker, install banner … update toast"): most of Phase 1 exists, so this is a **harden-and-finish** plan, not a rewrite.

## 0. Where you stand today (read this first)

Already on `main`:

| Piece | File | State |
|---|---|---|
| Manifest (relative `start_url`/`scope`, standalone, icons 192/512/maskable) | `manifest.webmanifest` | good |
| Icons from logo #10 (Swiss cross on red/gold/green), rendered with headless Chrome | `img/icons/*.png`, `scripts/make_icons.sh`, `make icons` | good |
| `<link rel=manifest>`, `apple-touch-icon`, `apple-mobile-web-app-*`, `viewport-fit=cover` | `index.html` | nearly complete (see fixes) |
| Service worker: shell precache, `data/*.json` network-first, unpkg cache-first, OSM tiles never cached, old caches deleted on activate | `sw.js` | two real bugs (see fixes) |
| Registration, "Neue Version" toast, `reg.update()` on foreground, Android install button, iOS Share-sheet hint with "Nie mehr fragen" | `pwa.js` | good, needs the toast to actually matter |
| CI stamps `__BUILD__` with a hash of shell files before upload | `.github/workflows/pages.yml` | hash list incomplete |
| Toast and install-banner CSS | `style.css` | toast ignores the home indicator |

**Five things to fix before any phone test** (all judges flagged the first two):

1. `sw.js` `install` calls `self.skipWaiting()` **and** `pwa.js` reloads on `controllerchange`. Result today: every deploy force-reloads the page under the user's thumb; the "Aktualisieren" toast is decorative. Remove `.then(() => self.skipWaiting())` from `install`; keep the `message` handler so the toast button is the only way to skip.
2. `cache.addAll([...])` uses plain URLs. GitHub Pages sends `Cache-Control: max-age=600`, so a new worker can precache a 10-minute-old `app.js` from the browser's HTTP cache and ship an old shell under a new cache name. Use `cache.addAll(urls.map((u) => new Request(u, { cache: "reload" })))`.
3. The CI hash covers `index.html log.html style.css app.js pwa.js manifest.webmanifest` but the precache also holds `img/about.jpg`, `img/logo/jahgenda.svg`, `img/icons/*.png` and 31 `img/cantons/*.svg`. An icon or canton change never reaches installed users. Add them (and `sw.js` itself) to the `cat … | sha256sum` list.
4. `log.html` lacks `viewport-fit=cover`; both pages lack `<meta name="mobile-web-app-capable" content="yes">` (Chrome's current name; keep the `apple-` one for older iOS). `.filters { top: 0 }` and `.toast { bottom: 16px }` ignore the safe areas, so in standalone iOS the sticky bar sits under the clock and the toast under the home indicator.
5. `_ios.html` is tracked at the repo root (an older copy of `index.html` with the data-URI favicon). It deploys to `/jahgenda/_ios.html`. Delete it or move it to `design/` so nobody installs from the wrong page.

## 1. What you get on the phone

**Install, iOS (Safari only):** open the site, tap Share, "Zum Home-Bildschirm", "Hinzufügen". `pwa.js` already shows this as a dismissible hint after 2.5 s (not shown when already standalone, hidden 30 days after "×", forever after "Nie mehr fragen"). Chrome/Firefox on iOS cannot install; the hint checks for Safari. No `beforeinstallprompt` exists on iOS, so the Share sheet is the only path.

**Install, Android (Chrome, Edge, Samsung Internet):** the browser fires `beforeinstallprompt`; `pwa.js` catches it and shows the "Installieren" button in the banner, or the user uses ⋮ → "App installieren". Requirements (manifest with name, icons 192+512, `display: standalone`, a registered service worker with a fetch handler, HTTPS) are all met.

**After install:** own icon (logo #10), splash from `background_color` + icon, no browser chrome, dark status bar area with the stripe below it, portrait lock (`orientation: portrait` in the manifest, Android only; iOS ignores it).

**Offline:** cold start from the home screen in airplane mode renders the full list from the last `shows.json` the phone saw, with canton badges (precached SVGs), search, canton/genre filters, "In Kalender" (the `.ics` is built locally as a Blob), "Link kopieren", WhatsApp (hands over to the app, which queues). The footer says "Stand: 12. Okt 2026, 06:12 · offline". Organiser links and the map (when the views branch lands) need the network. A user who installed but never loaded shows online sees the existing "Kein Empfang" screen; that is fine and documented.

**Updates:**
- *Data* (`shows.json`, daily scraper commit): fetched network-first on every open; the phone always shows today's file when online, the cached one when not. No toast, no new service worker, no re-download of the shell.
- *Shell* (you change `app.js` or `style.css`): CI stamps a new `BUILD`, the browser fetches `sw.js` on the next launch (and on every return to the foreground via `reg.update()`), installs the new worker in the background, and the page shows "Neue Version von Jahgenda · Aktualisieren". Tap → the new worker takes over, the page reloads exactly once. Ignore it → the new version is live on the next cold start.
- *Returning to a long-open app* (iOS keeps standalone apps "open" for days): on foreground after ≥ 30 min, `pwa.js` fetches `shows.json` (4 KB), compares `updated`, and shows "Agenda aktualisiert · Neu laden" only when it changed. No mid-scroll surprises.

**Marks and filters** (localStorage, from the marks branch): untouched by the worker. One honest caveat: an installed iOS web app has its own storage container, so marks made in the Safari tab before installing are not inside the app (Android shares them). The "Liste teilen" URL from the marks branch is the migration path; the install hint should say "Markierungen gelten pro App".

## 2. Architecture

Everything stays at the repo root because the site lives under a project path: `sw.js` at `/jahgenda/sw.js` gets scope `/jahgenda/` for free (GitHub Pages cannot send `Service-Worker-Allowed`, so a worker in `scripts/` would only control `scripts/`). All URLs stay relative (`./`, `img/...`), which is why the same files also work on `make serve` (`/`) and through a tunnel.

### manifest.webmanifest (exists, keep)

`start_url: "./"`, `scope: "./"`, `display: "standalone"`, `lang: "de-CH"`, `background_color`/`theme_color: "#14110e"`, icons 192 any, 512 any, 512 maskable. Two optional lines: `"id": "./"` (keeps Chrome's app identity stable if `start_url` ever changes) and `"shortcuts": [{"name": "Scraper-Log", "url": "./log.html"}]`. Do not add `?src=pwa` to `start_url`; nothing needs it.

### sw.js (exists, ~110 lines after the fixes)

Two cache lifetimes, three names:

```
jahgenda-shell-<BUILD>   immutable per release, deleted on the next activate
jahgenda-data            survives releases; holds data/*.json
jahgenda-lib             survives releases; Leaflet from unpkg (versioned URL), once the map lands
```

- **install:** `caches.open(SHELL_CACHE)` → `addAll(SHELL.map(u => new Request(u, {cache: "reload"})))`. No `skipWaiting()`. SHELL = `./`, `index.html`, `log.html`, `style.css`, `app.js`, `pwa.js`, `manifest.webmanifest`, `img/about.jpg`, `img/logo/jahgenda.svg`, `img/icons/icon-192.png`, `img/icons/icon-512.png`, 31 canton/country SVGs. Total ≈ 450 KB, of which `img/cantons/FL.svg` alone is 144 KB: run it through `svgo` (or a simpler redraw) before it lands in everyone's cache. **`data/` is never in SHELL** (a test enforces this).
- **activate:** delete every `jahgenda-shell-*` except the current one; `clients.claim()`.
- **message:** `"skipWaiting"` → `self.skipWaiting()` (only the toast button sends it).
- **fetch** (GET only):
  1. same origin, `/data/*.json` → **network-first with a 4 s timeout** (`AbortController`), `cache: "no-cache"` so the request is conditional and Pages answers 304 cheaply; `res.ok` → `cache.put`; timeout or offline → cached copy; nothing cached → re-throw so `app.js`'s existing `catch` shows "Kein Empfang". Zero changes to `app.js`'s fetch. This is the judges' steal from Concept 1: it avoids the stale-while-revalidate bridge (`load(data)` split, `postMessage`, "jump after paint") for a 4 KB file.
  2. `unpkg.com` → cache-first into `jahgenda-lib` (when the map lands, prefer vendoring Leaflet's two files into `img/..`/`lib/` and the shell; a cross-origin `<script>` yields an opaque response, so `res.ok` is false and the current code would never cache it).
  3. `*.openstreetmap.org` → pass through, never cached (tile policy, size).
  4. same origin, anything else → cache-first from `SHELL_CACHE` with `ignoreSearch: true`; navigations hit the precached `./`/`index.html`/`log.html`, which is what makes the cold offline launch work. Fallback network, store only `res.ok`. *(Review #49: only the precached shell paths and `img/` stay cache-first; every other same-origin file – the Mischpult and its chunks, the log/review redirects – is network-only, because a file outside the precache list never changes `BUILD` and would otherwise stay stale.)*
  5. everything else (wa.me, organiser sites) → untouched.

The data response could carry an `X-Jahgenda-Cache: hit` header so the footer can say "offline" even when `navigator.onLine` lies; `navigator.onLine === false` plus the `online`/`offline` events is enough for v1.

### Cache versioning (CI, exists, extend)

```yaml
- name: Stamp service worker with a hash of the app shell
  run: |
    BUILD=$(cat index.html log.html style.css app.js pwa.js sw.js manifest.webmanifest \
               img/about.jpg img/logo/jahgenda.svg img/icons/*.png img/cantons/*.svg \
           | sha256sum | cut -c1-10)
    sed -i "s/__BUILD__/$BUILD/" sw.js
    grep -q "$BUILD" sw.js && ! grep -q __BUILD__ sw.js && echo "build $BUILD"
```

Hash the shell files only, never the commit SHA and never `data/`: the daily scraper push must produce a byte-identical `sw.js` so nobody gets a "Neue Version" toast every morning. The placeholder stays in git (`make deploy` does `git commit -am`, so a stamped file must never exist locally; a test checks this). Locally `__BUILD__` is a perfectly valid cache name. `sw.js` is fetched fresh by the browser on every update check regardless of `max-age=600` (the default `updateViaCache: "imports"` already bypasses the HTTP cache for the main script), so no extra option is needed.

### pwa.js (exists, +~25 lines)

Keep: register `sw.js` on `load`; `updatefound` → `statechange` → `installed` with an existing controller → toast; toast button → `reg.waiting.postMessage("skipWaiting")`; `controllerchange` → single guarded `location.reload()`; `reg.update()` on `visibilitychange`; install banner logic. Add:

- `if (location.search.includes("nosw")) skip registration` (3 lines, for local debugging when the cache gets in the way).
- Data refresh on resume (~20 lines): remember `lastHidden`; on `visible` after ≥ 30 min and `navigator.onLine`, `fetch("data/shows.json", {cache: "no-cache"})`, compare `json.updated` with `document.getElementById("updated").dataset.updated`; if different, show the same toast with "Agenda aktualisiert · Neu laden" → `location.reload()`. `app.js` gets one line: `el("updated").dataset.updated = data.updated`.
- `navigator.storage?.persist?.()` once when `display-mode: standalone` (Chrome grants it to installed apps; harmless elsewhere).
- Offline marker (~8 lines): on `offline`/`online` and at start, toggle a ` · offline` suffix on `#updated`.

### Head tags (index.html and log.html)

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<link rel="manifest" href="manifest.webmanifest" />
<link rel="apple-touch-icon" href="img/icons/apple-touch-icon.png" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="Jahgenda" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="theme-color" content="#14110e" />
```

### style.css (+~10 lines)

```css
body { padding-top: env(safe-area-inset-top, 0px); }          /* stripe below the clock */
.filters { top: env(safe-area-inset-top, 0px); }               /* sticky bar not under it */
.toast { bottom: calc(16px + env(safe-area-inset-bottom, 0px)); }
.foot { padding-bottom: env(safe-area-inset-bottom, 0px); }
```

All are 0 in a browser tab, so no media query is needed; wrap in `@media (display-mode: standalone)` only if you want to be strict.

### Icons (exist)

`scripts/make_icons.sh` renders `img/logo/jahgenda.svg` (logo #10) at 192/512 (purpose any, `#14110e` background), 512 maskable (logo at 80 % so Android's circle/squircle never clips the cross), and 180 apple-touch-icon. Check two things on a device: Android's mask preview in DevTools → Application → Manifest, and the iOS corner radius (iOS masks the 180 px icon itself; because the logo already has rounded corners, the corners can show a sliver of the dark background. If it bothers you, render the apple-touch-icon from a copy of the SVG without the `clip-path`, full-bleed stripes).

## 3. Notifications: the honest picture

GitHub Pages serves files. It cannot receive a subscription or wake a phone. Everything that fires while the app is closed needs either a push server (stores subscriptions, sends) or something the phone polls on its own (a calendar subscription, a feed reader).

### Recommended now: (a) "Neu seit deinem letzten Besuch" + (c) calendar feeds

**(a) In-app, no server (~40 lines in app.js, ships with Phase 2).** Keep `jahgenda.seen` = `{updated, ids[]}` in localStorage. On each load, ids in `shows.json` that are not in `seen` get a small "Neu" chip; a one-line banner above the list says "3 neue Konzerte seit deinem letzten Besuch". Once the marks/follow feature exists, intersect with followed acts/venues/cantons ("Neu für dich: Dub Inc · Dachstock Bern"). `navigator.setAppBadge(n)` adds a count on the home-screen icon on Android and on installed iOS 16.4+ apps (iOS needs notification permission for it); clear on open. Honest promise: *when you open the app you see what is new, even offline*. Periodic Background Sync is Chrome-on-Android only, needs engagement score, often never runs, never exists on iOS; not worth code.

**(c) Static `.ics` subscription feeds (~80 lines Python, generated in CI, never committed).** `scripts/build_feeds.py` reuses the VEVENT shape of `icsFor()` in `app.js` and writes `feeds/alle.ics`, `feeds/kanton/BE.ics`, `feeds/band/dub-inc.ics` (one per act in `scraper/bands.md` "Dabei"), each event with a `VALARM` one day before. Runs in `pages.yml` before `upload-pages-artifact`; `feeds/` goes into `.gitignore`, so the CLAUDE.md rule "skills commit only `data/*`" stays true. The UI gets a "Kalender abonnieren" link (`webcal://markusbaumg.github.io/jahgenda/feeds/kanton/BE.ics`). iOS Calendar refreshes on its own schedule (configurable, hourly to weekly); Google Calendar needs "From URL" on the web and refreshes every 12–24 h. **Honest wording for the README:** a subscribed calendar alerts before the show (the VALARM); it does *not* announce newly added events. It is "do not miss the date", not "a band I follow was just announced". Works on every phone, installed or not, no permission dialog.

Optional in the same script: `feeds/neu.atom` with one entry per show added since the previous commit (`git show HEAD~1:data/shows.json`, `fetch-depth: 2`). Niche, but feed readers like NetNewsWire notify per feed, and it is a free input for Telegram/IFTTT bots.

### Only if people ask: (b) Web Push

The only route to "my phone buzzes when Dub Inc is announced". Smallest honest design, 0 CHF/month, roughly a weekend and ~250 lines:

- **Storage:** Cloudflare Worker + KV (free tier), ~50 lines pasted in the dashboard, kept in the repo as `scripts/push_worker.js`. `POST /sub {subscription, topics: ["act:dub-inc", "venue:dachstock", "canton:BE"]}` → `KV.put(sha256(endpoint))`; `DELETE /sub`; `GET /subs` behind a bearer secret; CORS pinned to `https://markusbaumg.github.io`. No logic in the Worker.
- **Sender:** a `notify` job in `pages.yml` with `needs: deploy` (so the deep link resolves when tapped), `fetch-depth: 2`, runs only when `data/shows.json` changed: `scripts/new_shows.py` diffs HEAD~1 vs HEAD (~40 lines, unit-tested), `scripts/push_new_shows.mjs` (~80 lines, `npm i web-push` in CI only) matches topics **server-side**, sends with VAPID keys from secrets, deletes subscriptions on 404/410. Server-side matching matters: Safari revokes push permission after a few pushes that show nothing, and Chrome shows its own "updated in the background" notice.
- **Client:** `sw.js` +25 lines (`push` → `showNotification`, `notificationclick` → focus or open `./#<id>`), `pwa.js` +40 lines ("Benachrichtigen" toggle; `Notification.requestPermission()` from the tap; `pushManager.subscribe({userVisibleOnly: true, applicationServerKey})`; re-POST when follows change; hidden on iOS unless standalone with the hint "Zuerst zum Home-Bildschirm hinzufügen").
- **Costs that are not money:** a Cloudflare account, four GitHub secrets (`VAPID_PUBLIC`, `VAPID_PRIVATE`, `PUSH_WORKER_URL`, `PUSH_SECRET`), subscription pruning, a privacy line in "Über uns" (opaque endpoint + slugs, nothing else). iOS: installed app, 16.4+, permission from a tap, Low Power mode delays. This moves the project from "files in a repo" to "a service with secrets"; do it only when installed users ask.

### For the two owners only: ntfy.sh

Five lines in the Actions job: `curl -d "$text" https://ntfy.sh/jahgenda-<random-suffix>` with the diff of added shows; Kusi and Seraina subscribe in the ntfy app. Topics are public (anyone with the name can post), so it is a monitoring channel, not a public feature. Email digest: more moving parts for less reach; skip.

## 4. Implementation plan

### Phase 1: finish and harden (one evening, ~120 changed lines, no npm)

| # | File | Change | Lines |
|---|---|---|---|
| 1 | `sw.js` | remove `skipWaiting()` from install; `new Request(u, {cache: "reload"})` in `addAll`; 4 s timeout in `networkFirst`; `put` only `res.ok` (already) | ~15 |
| 2 | `pwa.js` | `?nosw` skip; data refresh on resume with toast; `storage.persist()` in standalone; offline suffix | ~30 |
| 3 | `app.js` | `el("updated").dataset.updated = data.updated` | 1 |
| 4 | `index.html`, `log.html` | `mobile-web-app-capable`; `viewport-fit=cover` on log.html | 3 |
| 5 | `style.css` | safe-area on `body`, `.filters`, `.toast`, `.foot` | ~8 |
| 6 | `.github/workflows/pages.yml` | hash list with `sw.js`, images, icons, cantons; `! grep -q __BUILD__` guard | 3 |
| 7 | `Makefile` | `lint`: `node --check app.js pwa.js sw.js`; new target `tunnel` (`cloudflared tunnel --url http://localhost:$(PORT)`, `brew install cloudflared`) | 4 |
| 8 | `tests/test_pwa.py` (new) | regex the `SHELL` array and `CANTONS` string out of `sw.js`, assert every path exists; assert `"__BUILD__"` in `sw.js`; assert no `data/` in SHELL; `json.load` the manifest, assert icon files exist and `start_url`/`scope` are relative; assert both HTML files link the manifest. Picked up by `make test` automatically | ~40 |
| 9 | `img/cantons/FL.svg` | optimise (svgo or redraw) from 144 KB to a few KB | – |
| 10 | `_ios.html` | delete or move to `design/` | – |
| 11 | `README.md` | section "Auf dem Handy": both install paths, offline promise, the two toasts, iOS storage split and the "Liste teilen" migration, the note that `#id` links tapped on iOS open in Safari, not in the installed app (Android captures them) | ~20 |

Then `make check` (lint + validate + tests) and `make deploy`.

### Phase 2: "Neu seit letztem Besuch" and feeds (2–3 h, ~160 lines)

12. `app.js` +40: `jahgenda.seen` diff, "Neu" chips, banner, `setAppBadge`/`clearAppBadge`.
13. `scripts/build_feeds.py` ~80, `tests/test_feeds.py` ~30, one `python3 scripts/build_feeds.py` step in `pages.yml` before upload, `feeds/` in `.gitignore`, "Kalender abonnieren" links in the UI (+10 in `app.js`/`index.html`).

### Phase 3: Web Push (on demand, a weekend, ~250 lines + Cloudflare account)

14–18. Worker, VAPID keys (`npx web-push generate-vapid-keys` once), secrets, `new_shows.py`, `push_new_shows.mjs`, `notify` job, `sw.js` handlers, `pwa.js` toggle, privacy line. See section 3(b).

### Testing

**Desktop first (`make serve`, Chrome):** DevTools → Application → Manifest shows the installability checklist and the maskable preview (this replaced the Lighthouse PWA category, which was removed in Lighthouse 12 / Chrome 128; do not look for a PWA score). Application → Service Workers: tick "Update on reload" while iterating, untick to test the toast; "Offline" checkbox + reload must render the list. Cache Storage: `jahgenda-shell-__BUILD__` holds the shell and **no** `data/`; `jahgenda-data` holds `shows.json`. Change one byte in `app.js`, reload: toast appears once, "Aktualisieren" reloads exactly once, old cache gone. Run Lighthouse's performance/accessibility/best-practices audits as usual.

**iOS without a tunnel:** the free iOS Simulator (Xcode) treats `http://localhost:8000` as a secure context; Safari in the Simulator can "Zum Home-Bildschirm", and Mac Safari → Entwickler → Simulator inspects the installed app (console, storage, service workers).

**Real phones against the Mac:** service workers need HTTPS or localhost. Android: `chrome://inspect` → Port forwarding 8000 → open `http://localhost:8000/` on the phone (console via the same panel). iPhone: `make tunnel` (cloudflared quick tunnel, HTTPS URL, no account) or ngrok. Both serve the site at `/` instead of `/jahgenda/`, which is exactly the test that no absolute path crept in. Mac Safari → Entwickler → iPhone → "Jahgenda" shows the console of the installed app.

**On the real URL after `make deploy` (about a minute):** install on both platforms once; force-quit; airplane mode; open → list renders with "· offline" in the footer; marks still there; back online → nothing jumps; the next morning's scraper push must **not** show a "Neue Version" toast (data only); the next real shell deploy must show it after backgrounding/foregrounding, tapping it reloads once; stripe sits below the clock, filter bar not hidden; toast above the home indicator; "In Kalender" opens the calendar sheet.

## 5. Risks and how they are avoided

- **Stale shows.json forever.** Only happens with cache-first data. Data stays network-first with a 4 s timeout, never in SHELL (test fails if `data/` appears), footer says "Stand … · offline" when served from cache.
- **Precaching an old app.js** from Pages' 10-minute HTTP cache. `cache: "reload"` on every precache request.
- **A 404 in the precache list silently blocks every future update** (`addAll` rejects, the old worker stays forever, the only symptom is "no new worker" in DevTools). `tests/test_pwa.py` asserts every listed path exists; keep the list explicit, re-run `make test` after any image rename.
- **Toast fatigue / hashing the wrong set.** Hash exactly the precached files, never `data/` or the commit SHA. The CI guard fails if the placeholder survives; the test fails if a stamped `sw.js` is ever committed.
- **Update loops and mixed versions.** `skipWaiting()` only on the toast tap, `controllerchange` reload guarded by a boolean, `reg.update()` only on `visibilitychange` (never on an interval), no `register()` in loops.
- **Scope on a project page.** `sw.js` and the manifest at the repo root, every path relative. `start_url: "/"` would open the user page 404. A future custom domain changes the origin: caches and localStorage do not migrate, iOS sees a new app; the optional manifest `id` keeps Chrome's identity.
- **iOS specifics.** Separate storage container for the installed app (document the "Liste teilen" migration); no install prompt API (the hint exists); `black-translucent` needs the safe-area CSS; push only installed + 16.4+ + from a tap; `#id` links tapped elsewhere open Safari, not the app; `target=_blank` links open an in-app sheet with "Fertig"; Safari's 7-day storage eviction applies to tabs, not Home-Screen apps.
- **Storage size.** Shell ≈ 450 KB today (≈ 310 KB after fixing `FL.svg`), data ≈ 4 KB. Only a tile cache could grow, and there is none. Leaflet from unpkg is opaque unless vendored; never cache non-`ok` or opaque responses.
- **Local development confusion.** With a worker active, `make serve` may show cached `app.js`: use DevTools "Update on reload"/"Bypass for network" or `?nosw`.
- **CI ownership rules.** The stamped `sw.js` and generated `feeds/` exist only in the Pages artifact, never in git; the scraper skill still commits only `data/*`.
- **Notifications over-promise.** The README says what each path does: in-app "Neu" on open, calendar alarms before a show (not on announcement), real push only with the Worker, which is documented but not built until someone asks.
