/* Jahgenda service worker.
 * - App shell (HTML/CSS/JS/icons) is precached and served cache-first; other same-origin files
 *   (canton flags, …) are cached on first use.
 * - data/*.json is network-first with the cached copy as offline fallback, so the agenda is always
 *   fresh when online and still readable offline.
 * - Leaflet from unpkg is cached on first use; map tiles are never cached.
 * BUILD is replaced at build time (vite.config.js, jahgenda-static plugin) with a hash of the shell files,
 * so a new shell gets a new cache and old caches are deleted on activate.
 */
const BUILD = "__BUILD__";
const SHELL_CACHE = `jahgenda-shell-${BUILD}`;
const DATA_CACHE = "jahgenda-data";
const LIB_CACHE = "jahgenda-lib";

// The hashed bundle files of the Vite build (assets/index-….js, assets/index-….css): inserted at build time
// by the jahgenda-static plugin in vite.config.js, together with BUILD.
const BUNDLE = /* __BUNDLE__ */ [];
const SHELL = [
  "./",
  "index.html",
  "log.html",
  "review.html",
  "style.css",
  "store.js",
  "pwa.js",
  "callout.js",
  "manifest.webmanifest",
  "img/about.jpg",
  "img/logo/jahgenda.svg",
  "img/fonts/jahdisplay.woff2",
  "img/icons/icon-192.png",
  "img/icons/icon-512.png",
  ...BUNDLE,
];
// The agenda itself: fetched into the data cache on install, so the first visit (whose own data
// requests ran before this worker controlled the page) already leaves an offline-readable agenda.
// runs.json feeds log.html / review.html, which are in the shell: without it they opened offline to
// «Log konnte nicht geladen werden». The slogans are inline in index.html (no request any more).
// venues.web.json is the venue database trimmed to what the page reads (scripts/format_data.py).
const DATA = ["data/shows.json", "data/genres.json", "data/venues.web.json", "data/runs.json"];
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
