/* Jahgenda service worker.
 * - App shell (HTML/CSS/JS/icons) is precached and served cache-first.
 * - data/*.json is network-first with the cached copy as offline fallback, so the agenda is always
 *   fresh when online and still readable offline.
 * - Leaflet from unpkg is cached on first use; map tiles are never cached.
 * BUILD is replaced at deploy time (see .github/workflows/pages.yml) with a hash of the shell files,
 * so a new shell gets a new cache and old caches are deleted on activate.
 */
const BUILD = "__BUILD__";
const SHELL_CACHE = `jahgenda-shell-${BUILD}`;
const DATA_CACHE = "jahgenda-data";
const LIB_CACHE = "jahgenda-lib";

const SHELL = [
  "./",
  "index.html",
  "log.html",
  "review.html",
  "style.css",
  "store.js",
  "lib.js",
  "app.js",
  "pwa.js",
  "manifest.webmanifest",
  "img/about.jpg",
  "img/logo/jahgenda.svg",
  "img/icons/icon-192.png",
  "img/icons/icon-512.png",
];
const CANTONS =
  "AG AI AR BE BL BS FR GE GL GR JU LU NE NW OW SG SH SO SZ TG TI UR VD VS ZG ZH D F I A FL".split(" ");

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // cache: "reload" bypasses the HTTP cache, so a new worker never precaches a stale shell.
      cache.addAll(
        [...SHELL, ...CANTONS.map((c) => `img/cantons/${c}.svg`)].map(
          (u) => new Request(u, { cache: "reload" }),
        ),
      ),
    ),
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
  try {
    const res = await fetch(req, { cache: "no-cache" });
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw new Error("offline and not cached");
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}
