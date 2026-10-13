/* Vite build of the Jahgenda page (story #33). Static files live in public/ (img, fonts, manifest, the three
 * static pages, the service worker and the PWA glue until vite-plugin-pwa takes over in M7); data/ stays at
 * the repo root as the scraper's contract and is copied into dist/data by the plugin below. */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

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
  let bundleFiles = [];
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
    generateBundle(_, bundle) {
      bundleFiles = Object.keys(bundle).filter((f) => f.startsWith("assets/"));
    },
    // Build: copy the data and the static extras, then stamp the service worker – its precache list gets
    // the hashed bundle files and BUILD a hash of the whole shell, so a new shell gets a new cache
    // (this used to be the sed step in pages.yml).
    closeBundle() {
      for (const [from, to, keep] of COPIES) copyInto(outDir, from, to, keep);
      // style.css says url("/img/…") so Vite finds the files in public/ for the bundled copy; the plain copy
      // the static pages link (log/review/mischpult, design/logos.html) sits next to img/, and an absolute
      // /img/… would miss the /jahgenda/ prefix on GitHub Pages – so it gets relative urls.
      const cssPath = path.join(outDir, "style.css");
      if (fs.existsSync(cssPath)) {
        const css = fs.readFileSync(cssPath, "utf8");
        fs.writeFileSync(cssPath, css.replace(/url\((["']?)\/img\//g, "url($1img/"));
      }
      const swPath = path.join(outDir, "sw.js");
      if (!fs.existsSync(swPath)) return;
      let sw = fs.readFileSync(swPath, "utf8");
      sw = sw.replace("/* __BUNDLE__ */ []", JSON.stringify(bundleFiles));
      const shell = (sw.match(/const SHELL = \[(.*?)\];/s) || ["", ""])[1].match(/"([^"]+)"/g) || [];
      const hash = createHash("sha256");
      for (const quoted of shell) {
        const f = JSON.parse(quoted);
        const p = path.join(outDir, f === "./" ? "index.html" : f);
        if (fs.existsSync(p) && fs.statSync(p).isFile()) hash.update(fs.readFileSync(p));
      }
      hash.update(sw);
      const build = hash.digest("hex").slice(0, 10);
      fs.writeFileSync(swPath, sw.replace("__BUILD__", build));
      console.log(`sw.js stamped: build ${build}, ${bundleFiles.length} bundle files in the shell`);
    },
  };
}

export default defineConfig({
  base: "./",
  publicDir: "public",
  plugins: [svelte(), jahgendaStatic()],
  build: { outDir: "dist", emptyOutDir: true },
  // 127.0.0.1, not "localhost" (which may bind IPv6 only): the e2e suite, smoke.sh and the screenshots all
  // talk to 127.0.0.1; *.localhost names still reach it (pwa.spec.js uses jah.localhost).
  server: { host: "127.0.0.1", port: 5173 },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
});
