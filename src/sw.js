/* Jahgenda service worker – the source of dist/sw.js (vite-plugin-pwa, strategy injectManifest; story #33 M7).
 * - App shell (HTML/CSS/JS/icons) is precached and served cache-first; other same-origin files
 *   (canton flags, …) are cached on first use.
 * - data/*.json is network-first with the cached copy as offline fallback, so the agenda is always
 *   fresh when online and still readable offline.
 * - Leaflet from unpkg is cached on first use; map tiles are never cached.
 * The build replaces the injection point below with the shell files of dist/ (vite.config.js, globPatterns) and
 * their revisions; BUILD is a hash of that list, so a new shell gets a new cache (and the browser a new
 * worker → «Neue Version»), and old caches are deleted on activate. Plain JS without imports: the
 * bundle is the file itself, registered as a classic worker.
 */
const MANIFEST = self.__WB_MANIFEST;

// FNV-1a over the manifest (urls + revisions): stable for an unchanged shell – the daily data push must
// not give anybody a «Neue Version» toast – and different as soon as one shell file changes.
function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const BUILD = fnv1a(JSON.stringify(MANIFEST));
const SHELL_CACHE = `jahgenda-shell-${BUILD}`;
const DATA_CACHE = "jahgenda-data";
const LIB_CACHE = "jahgenda-lib";

// "./" first: the start URL of the installed app is the directory, not index.html.
const SHELL = ["./", ...MANIFEST.map((e) => (typeof e === "string" ? e : e.url))];
// The agenda itself: fetched into the data cache on install, so the first visit (whose own data
// requests ran before this worker controlled the page) already leaves an offline-readable agenda.
// The slogans are inline in index.html (no request any more). venues.web.json is the venue database
// trimmed to what the page reads (scripts/format_data.py). runs.json is no longer fetched for every
// visitor: only the hidden Mischpult reads it (log.html and review.html are redirects to it now).
const DATA = ["data/shows.json", "data/genres.json", "data/venues.web.json"];
// How long the network gets before the cached agenda is served instead (a stalled mobile connection
// is otherwise worse than airplane mode: nothing at all would appear). The fetch goes on in the
// background and refreshes the cache for the next visit.
const NETWORK_TIMEOUT = 4000;
// Canton flags: only the ones of cantons that occur in data/shows.json are precached (read from the copy
// just fetched into the data cache); the fetch handler stores any other same-origin file on first use.
async function precacheCantons() {
  try {
    const [shell, data] = await Promise.all([caches.open(SHELL_CACHE), caches.open(DATA_CACHE)]);
    const res = await data.match("data/shows.json");
    const json = res ? await res.json() : null;
    const cantons = new Set((json && json.shows ? json.shows : []).map((s) => s.canton).filter(Boolean));
    await Promise.all(
      [...cantons].map((c) =>
        shell
          .add(new Request(`img/cantons/${encodeURIComponent(c)}.svg`, { cache: "reload" }))
          .catch(() => {}),
      ),
    );
  } catch {
    /* best effort: a flag that is missing is fetched on first use */
  }
}

self.addEventListener("install", (event) => {
  // No skipWaiting() here: a new worker waits until the visitor taps «Aktualisieren» (message below),
  // so a deploy never reloads the page under somebody's thumb.
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then((cache) =>
        // cache: "reload" bypasses the HTTP cache, so a new worker never precaches a stale shell.
        cache.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))),
      ),
      // Best effort: a data file that fails to load must not block the shell from installing.
      caches
        .open(DATA_CACHE)
        .then((cache) =>
          Promise.all(DATA.map((u) => cache.add(new Request(u, { cache: "reload" })).catch(() => {}))),
        ),
    ]).then(precacheCantons),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("jahgenda-shell-") && k !== SHELL_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === location.origin && url.pathname.includes("/data/") && url.pathname.endsWith(".json")) {
    event.respondWith(networkFirst(req, DATA_CACHE));
    return;
  }
  if (url.hostname === "unpkg.com") {
    event.respondWith(cacheFirst(req, LIB_CACHE));
    return;
  }
  if (url.hostname.endsWith("openstreetmap.org") || url.hostname.endsWith("cartocdn.com")) return; // tiles: always live
  if (url.origin === location.origin) {
    event.respondWith(cacheFirst(req, SHELL_CACHE));
  }
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const fresh = fetch(req, { cache: "no-cache" }).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(() => resolve("timeout"), NETWORK_TIMEOUT));
  try {
    const res = await Promise.race([fresh, timeout]);
    if (res !== "timeout") return res;
    // Slow network: the cached copy now, the fresh one for next time – only without a copy we wait.
    const hit = await cache.match(req, { ignoreVary: true });
    if (hit) {
      fresh.catch(() => {});
      return hit;
    }
    return await fresh;
  } catch {
    const hit = await cache.match(req, { ignoreVary: true });
    if (hit) return hit;
    throw new Error("offline and not cached");
  }
}

// ignoreVary: every cached file here is same-origin, so a «Vary: Origin» a dev/preview server adds (vite
// preview's CORS middleware) must not turn the precached shell into a miss once offline.
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}
