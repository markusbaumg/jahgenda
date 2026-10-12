// Every page loads without an uncaught error or console error – index.html with the real data,
// plus the scraper log, the review page and the owners' hidden Mischpult.
const { test, expect } = require("@playwright/test");
const { watchErrors } = require("./helpers");

const settle = (page) => page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

test("index.html: no console errors with the real data", async ({ page, baseURL }) => {
  const errors = watchErrors(page, baseURL);
  await page.goto("/");
  await expect(page.locator("#list .show, #status .big").first()).toBeVisible();
  await expect(page.locator("#genres .chip").first()).toHaveText("Alle");
  await settle(page);
  // Exercise the interactive bits once, still watching the console.
  await page.fill("#q", "a");
  await page.click("#toggle-where");
  await page.click("#toggle-when");
  await page.keyboard.press("Escape");
  await page.locator('#view-switch [data-view="calendar"]').click();
  await expect(page.locator("#calendar .cal-grid")).toBeVisible();
  expect(errors).toEqual([]);
});

for (const [file, title] of [
  ["log.html", "Scraper-Log"],
  ["review.html", "Aussortiert"],
  ["mischpult.html", "Mischpult"],
]) {
  test(`${file} loads without console errors`, async ({ page, baseURL }) => {
    const errors = watchErrors(page, baseURL);
    await page.goto(`/${file}`);
    await expect(page).toHaveTitle(new RegExp(`^${title} · Jahgenda$`));
    await expect(page.locator("h1.logo")).toBeVisible();
    await settle(page);
    expect(errors).toEqual([]);
  });
}

test("the hidden Mischpult is not linked from the public pages", async ({ page }) => {
  for (const file of ["/", "/log.html", "/review.html"]) {
    await page.goto(file);
    await expect(page.locator('a[href*="mischpult"]')).toHaveCount(0);
  }
  await page.goto("/mischpult.html");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});
