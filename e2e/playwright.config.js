// Playwright configuration for the Jahgenda end-to-end tests (`make e2e` or `npx playwright test`).
// `vite preview` serves the production build (dist/ of the repo root, built by `make build` /
// `npm run build` first) on port 4173 – the same files GitHub Pages serves.
// Two projects: a 1280×800 desktop Chrome and an iPhone 13 (emulated in Chromium, so CI needs one browser).
// @ts-check
const { defineConfig, devices } = require("@playwright/test");

const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}/`;

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  // Four workers locally: the suite stays fast (~10 s) and no longer starves itself – or a second
  // Playwright run on the same machine – into 30 s test timeouts.
  workers: process.env.CI ? 2 : 4,
  // Locally the list is enough; in CI the HTML report is uploaded on failure.
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE,
    locale: "de-CH",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    // The service worker would cache pages across tests; the PWA itself is not under test here.
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "Desktop Chrome",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "iPhone 13",
      use: { ...devices["iPhone 13"], browserName: "chromium" },
    },
  ],
  webServer: {
    // Serves THIS checkout's build (dist/ in the parent of e2e/), never the dev server on 5173. The
    // preview binds 127.0.0.1 (vite.config.js); the fixture route on data/shows.json works as before.
    command: `cd .. && npx vite preview --port ${PORT} --strictPort`,
    url: `${BASE}index.html`,
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
