// Playwright configuration for the Jahgenda end-to-end tests (`make e2e` or `npx playwright test`).
// A plain python http.server serves the repo root on port 4173 – the page needs no build step.
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
    // Serves THIS checkout (the parent of e2e/), never the live-server on 5500.
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1 --directory ..`,
    url: `${BASE}index.html`,
    reuseExistingServer: false,
    timeout: 15_000,
    stderr: "ignore", // http.server logs every request to stderr
  },
});
