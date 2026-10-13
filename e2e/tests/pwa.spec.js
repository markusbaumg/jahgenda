// The service worker: the agenda is readable offline right after the first visit, and the
// «Aktualisieren» toast really reloads the page. pwa.js unregisters the worker on 127.0.0.1/localhost,
// so these tests visit the same server as jah.localhost (Chromium resolves *.localhost to loopback).
const { test, expect } = require("@playwright/test");

const HOST = `http://jah.localhost:${Number(process.env.E2E_PORT) || 4173}/`; // the preview port (playwright.config.js)
test.use({ serviceWorkers: "allow", baseURL: HOST });

async function workerReady(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  // The data precache runs in install(); wait until shows.json is in the data cache.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const c = await caches.open("jahgenda-data");
          return Boolean(await c.match("data/shows.json"));
        }),
      { timeout: 15_000 },
    )
    .toBe(true);
}

test("after the first visit the agenda loads offline, with an «Offline» stamp", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.locator("#list .show, #status .big").first()).toBeVisible();
  const online = await page.locator("#list .show").count();
  test.skip(online === 0, "no upcoming shows in data/shows.json today");
  await workerReady(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#list .show").first()).toBeVisible();
  expect(await page.locator("#list .show").count()).toBe(online);
  await expect(page.locator("#updated")).toHaveText(/^Offline · Stand: /);
  await context.setOffline(false);
});

test("«Aktualisieren» after a new worker installs reloads the page", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#list .show, #status .big").first()).toBeVisible();
  await workerReady(page);

  // A deploy: the browser treats a worker registered under a new script URL (same scope) as a new
  // version – it installs it and pwa.js gets its updatefound event, like after a real deploy.
  await page.evaluate(() => navigator.serviceWorker.register("sw.js?e2e=two"));
  // By its text, not by .toast: the (hidden) «Rückgängig» toast of Meine Shows shares the class.
  const toast = page.getByText("Neue Version von Jahgenda");
  await expect(toast).toBeVisible({ timeout: 15_000 });
  await expect(toast).toContainText("Neue Version");
  await Promise.all([page.waitForNavigation({ timeout: 15_000 }), toast.locator("button").click()]);
  expect(await page.evaluate(() => performance.getEntriesByType("navigation")[0].type)).toBe("reload");
  await expect(page.locator("#list .show, #status .big").first()).toBeVisible();
  // (The reloaded page registers plain sw.js again – for the browser yet another version, so a second
  // toast may follow; that is the test set-up, not the page.)
});
