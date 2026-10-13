/* Vite build of the Jahgenda page (story #33). Static files live in public/ (img, fonts, the three
 * static pages and the plain scripts); the manifest and dist/sw.js come from vite-plugin-pwa; data/ stays at
 * the repo root as the scraper's contract and is copied into dist/data by the plugin below. */
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";
import de from "./src/i18n/de.js";
import fr from "./src/i18n/fr.js";
import en from "./src/i18n/en.js";

// Files beside the bundle that the build copies into dist/ (and the dev server serves from the root):
// the data contract, the global stylesheet the static pages link, and the design pages (design/logos.html
// is a recorded URL on the live site).
const COPIES = [
  ["data", "data", (f) => f.endsWith(".json")],
  ["design", "design", (f) => /\.(html|png)$/.test(f)],
  ["style.css", "style.css"],
];

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
    // Dev: /data/*.json straight from the repo (no-cache, as the page fetches it); style.css and the design
    // pages are plain files under the root, which Vite serves by itself.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || "").split("?")[0];
        if (!url.startsWith("/data/") || !url.endsWith(".json")) return next();
        const file = path.resolve("data", url.slice("/data/".length));
        if (!file.startsWith(path.resolve("data") + path.sep) || !fs.existsSync(file)) return next();
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        fs.createReadStream(file).pipe(res);
      });
    },
    // Build: copy the data and the static extras – before vite-plugin-pwa globs dist/ for the shell
    // (style.css is a shell file), hence order "pre".
    closeBundle: {
      order: "pre",
      sequential: true,
      handler() {
        for (const [from, to, keep] of COPIES) copyInto(outDir, from, to, keep);
        // style.css says url("/img/…") so Vite finds the files in public/ for the bundled copy; the plain copy
        // the static pages link (log/review/mischpult, design/logos.html) sits next to img/, and an absolute
        // /img/… would miss the /jahgenda/ prefix on GitHub Pages – so it gets relative urls.
        const cssPath = path.join(outDir, "style.css");
        if (fs.existsSync(cssPath)) {
          const css = fs.readFileSync(cssPath, "utf8");
          fs.writeFileSync(cssPath, css.replace(/url\((["']?)\/img\//g, "url($1img/"));
        }
      },
    },
  };
}

// One manifest per language (story #48): the plugin writes the German manifest.webmanifest; this copies it
// as manifest.fr.webmanifest / manifest.en.webmanifest with the name, description and lang of that table.
// src/i18n/i18n.svelte.js points <link rel="manifest"> at the one of the page's language.
function jahgendaManifests() {
  let outDir = "dist";
  return {
    name: "jahgenda-manifests",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle: {
      order: "post",
      sequential: true,
      handler() {
        const base = path.join(outDir, "manifest.webmanifest");
        if (!fs.existsSync(base)) return;
        const manifest = JSON.parse(fs.readFileSync(base, "utf8"));
        for (const [lang, table, tag] of [
          ["fr", fr, "fr-CH"],
          ["en", en, "en-GB"],
        ]) {
          const out = {
            ...manifest,
            name: table["manifest.name"],
            description: table["manifest.description"],
            lang: tag,
          };
          fs.writeFileSync(path.join(outDir, `manifest.${lang}.webmanifest`), JSON.stringify(out));
        }
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
    // Name and description from the German message table (src/i18n/de.js); fr / en: jahgendaManifests().
    name: de["manifest.name"],
    short_name: "Jahgenda",
    description: de["manifest.description"],
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
  plugins: [svelte(), jahgendaStatic(), pwa, jahgendaManifests()],
  build: { outDir: "dist", emptyOutDir: true },
  // 127.0.0.1, not "localhost" (which may bind IPv6 only): the e2e suite, smoke.sh and the screenshots all
  // talk to 127.0.0.1; *.localhost names still reach it (pwa.spec.js uses jah.localhost).
  server: { host: "127.0.0.1", port: 5173 },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
});
