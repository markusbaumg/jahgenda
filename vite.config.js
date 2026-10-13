/* Vite build of the Jahgenda page (story #33). Static files live in public/ (img, fonts, the three
 * static pages and the plain scripts); the styles in src/styles/index.css (cascade order) and next to the
 * components; the manifest and dist/sw.js come from vite-plugin-pwa; data/ stays at
 * the repo root as the scraper's contract and is copied into dist/data by the plugin below. */
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";

// Files beside the bundle that the build copies into dist/ (and the dev server serves from the root):
// the data contract, the scraper's source list (mischpult.html reads scraper/sources.json for its Portale,
// Suchen and Festivals tables, as on the vanilla site that published the whole repo) and the design pages
// (design/logos.html is a recorded URL on the live site).
const COPIES = [
  ["data", "data", (f) => f.endsWith(".json")],
  ["scraper/sources.json", "scraper/sources.json"],
  ["design", "design", (f) => /\.(html|png)$/.test(f)],
];

// The static pages (log, review, mischpult, design/logos.html) link one plain style.css: the page's own
// stylesheets, concatenated in the order src/styles/index.css imports them – the same cascade as the bundle.
// The sources say url("/img/…") so Vite finds the files in public/; next to img/ the plain copy needs relative
// urls (an absolute /img/… would miss the /jahgenda/ prefix on GitHub Pages).
const STYLE_INDEX = path.resolve("src/styles/index.css");
export function plainStylesheet({ relativeUrls = true } = {}) {
  const imports = [...fs.readFileSync(STYLE_INDEX, "utf8").matchAll(/^@import "([^"]+)";/gm)].map(
    (m) => m[1],
  );
  const css = imports
    .map((rel) => fs.readFileSync(path.resolve(path.dirname(STYLE_INDEX), rel), "utf8"))
    .join("\n");
  return relativeUrls ? css.replace(/url\((["']?)\/img\//g, "url($1img/") : css;
}

const copyInto = (outDir, from, to, keep) => {
  const src = path.resolve(from);
  if (!fs.existsSync(src)) return;
  if (fs.statSync(src).isFile()) {
    fs.mkdirSync(path.dirname(path.join(outDir, to)), { recursive: true });
    fs.copyFileSync(src, path.join(outDir, to));
    return;
  }
  fs.mkdirSync(path.join(outDir, to), { recursive: true });
  for (const f of fs.readdirSync(src)) {
    if (!keep || keep(f)) fs.copyFileSync(path.join(src, f), path.join(outDir, to, f));
  }
};

function jahgendaStatic() {
  let outDir = "dist";
  return {
    name: "jahgenda-static",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    // Dev: /data/*.json straight from the repo (no-cache, as the page fetches it) and the static pages'
    // style.css put together on every request; the design pages are plain files under the root, which Vite
    // serves by itself.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || "").split("?")[0];
        if (url === "/style.css") {
          res.setHeader("Content-Type", "text/css; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          res.end(plainStylesheet({ relativeUrls: false }));
          return;
        }
        if (!url.startsWith("/data/") || !url.endsWith(".json")) return next();
        const file = path.resolve("data", url.slice("/data/".length));
        if (!file.startsWith(path.resolve("data") + path.sep) || !fs.existsSync(file)) return next();
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        fs.createReadStream(file).pipe(res);
      });
    },
    // Build: copy the data and the static extras and write style.css – before vite-plugin-pwa globs dist/
    // for the shell (style.css is a shell file), hence order "pre".
    closeBundle: {
      order: "pre",
      sequential: true,
      handler() {
        for (const [from, to, keep] of COPIES) copyInto(outDir, from, to, keep);
        fs.writeFileSync(path.join(outDir, "style.css"), plainStylesheet());
      },
    },
  };
}

// The PWA (story #33 M7): vite-plugin-pwa writes manifest.webmanifest (and links it in index.html) and builds
// src/sw.js into dist/sw.js with the precache list of the shell injected (strategy injectManifest – the
// caching rules are our own: data network-first with a 4 s timeout, flags of the current shows, unpkg
// cache-first, tiles never). The registration, the «Neue Version» toast and the install nudge live in
// src/stores/pwa.svelte.js and src/components/pwa/, so the plugin injects no register script.
const pwa = VitePWA({
  strategies: "injectManifest",
  srcDir: "src",
  filename: "sw.js",
  injectRegister: false,
  manifestFilename: "manifest.webmanifest",
  manifest: {
    name: "Jahgenda – Reggae, Dub & Ska in der Schweiz",
    short_name: "Jahgenda",
    description: "Kommende Reggae-, Dub- und Ska-Konzerte in der Schweiz.",
    lang: "de-CH",
    id: "./",
    start_url: "./",
    scope: "./",
    display: "standalone",
    background_color: "#14110e",
    theme_color: "#14110e",
    icons: [
      { src: "img/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "img/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "img/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  },
  // The shell is exactly the list below (plus the manifest): no manifest icons beyond these, no data/
  // (network-first, its own cache), no canton flags (precached by the worker from data/shows.json).
  includeManifestIcons: false,
  injectManifest: {
    globPatterns: [
      "index.html",
      "log.html",
      "review.html",
      "style.css",
      "*.js",
      "assets/**/*.{js,css}",
      "img/about.jpg",
      "img/logo/jahgenda.svg",
      "img/fonts/jahdisplay.woff2",
      "img/icons/icon-{192,512}.png",
    ],
    globIgnores: ["sw.js", "data/**", "design/**"],
  },
});

export default defineConfig({
  base: "./",
  publicDir: "public",
  plugins: [svelte(), jahgendaStatic(), pwa],
  build: { outDir: "dist", emptyOutDir: true },
  // 127.0.0.1, not "localhost" (which may bind IPv6 only): the e2e suite, smoke.sh and the screenshots all
  // talk to 127.0.0.1; *.localhost names still reach it (pwa.spec.js uses jah.localhost).
  server: { host: "127.0.0.1", port: 5173 },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
});
