// The callouts (install nudge, calendar subscription): a nudge never covers what the visitor is doing,
// at most one nudge per visit, and the callout opened on purpose behaves like a dialog.
const { test, expect } = require("@playwright/test");
const { useFixture, openList } = require("./helpers");

test.beforeEach(async ({ page }) => {
  await useFixture(page, { callouts: true });
});

const tall = (page) => page.evaluate(() => (document.querySelector(".foot").style.minHeight = "3000px"));

test("the subscribe nudge waits while a panel is open and comes once it is closed", async ({ page }) => {
  // (The vanilla page delayed callout.js here; the nudges are in the bundle now, src/components/callout.)
  await openList(page);
  await tall(page);
  await page.click("#toggle-where");
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(2500);
  await expect(page.locator(".callout.show")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("#where-panel")).toBeHidden();
  const callout = page.locator(".callout.show");
  await expect(callout).toBeVisible({ timeout: 4000 });
  await expect(callout).toContainText("in deinem Kalender");
  await expect(callout).toHaveAttribute("role", "region");
  await expect(callout.locator(".callout-never")).toBeVisible();
  // It steps aside when a panel opens over it, and returns after.
  await page.click("#toggle-when");
  await expect(page.locator(".callout.show")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".callout.show")).toBeVisible({ timeout: 4000 });
});

test("«Abonnieren» opens a dialog: focus inside, Escape closes it and returns the focus", async ({
  page,
}) => {
  await openList(page);
  await page.locator('#view-switch [data-view="calendar"]').click();
  const btn = page.locator("#calendar .cal-subscribe");
  await btn.focus();
  await page.keyboard.press("Enter");
  const callout = page.locator(".callout");
  await expect(callout).toBeVisible();
  await expect(callout).toHaveAttribute("role", "dialog");
  await expect(callout.locator(".callout-never")).toHaveCount(0); // opened on purpose: only ×
  expect(await page.evaluate(() => document.activeElement.closest(".callout") !== null)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(callout).toBeHidden();
  expect(await page.evaluate(() => document.activeElement.className)).toContain("cal-subscribe");
});

test("with one canton the subscribe headline names it with the right preposition", async ({ page }) => {
  // One show in the Tessin (the fixture has none there): the calendar of #wo=TI then has a show to subscribe to.
  const d = new Date(Date.now() + 3 * 86_400_000);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const ti = { venue: "Studio Foce", city: "Lugano", canton: "TI", lat: 46.0037, lon: 8.9511 };
  await page.route("**/data/shows.json", (route) =>
    route.fulfill({
      json: {
        updated: new Date().toISOString(),
        source: "scraper",
        shows: [
          {
            id: `${date}-ska-lugano`,
            date,
            time: "21:00",
            title: "Ska Lugano",
            acts: ["Ska Lugano"],
            ...ti,
            url: "https://example.org/event",
            source_url: "https://example.org/agenda",
            genres: ["ska"],
          },
        ],
      },
    }),
  );
  await page.goto("/#wo=TI");
  await page.locator('#view-switch [data-view="calendar"]').click();
  await page.locator("#calendar .cal-subscribe").click();
  await expect(page.locator(".callout")).toContainText("Shows im Tessin im Kalender");
});

test("iPhone: the install sticker waits for the second visit; after a closed nudge no second one follows", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "the iOS install sticker needs the iPhone Safari user agent");
  await openList(page);
  await page.waitForTimeout(3200);
  await expect(page.locator(".callout.show")).toHaveCount(0); // first visit: nothing
  await page.reload();
  await expect(page.locator("#list .show").first()).toBeVisible();
  const install = page.locator(".callout.show");
  await expect(install).toBeVisible({ timeout: 5000 });
  await expect(install).toContainText("als App");
  // A friendly primary («Alles klar» = snooze) carries the sticker; «Nie mehr zeigen» is the quiet text
  // option, not a red button; the × says what it does; and it all sits before the footer in the DOM.
  await expect(install.locator(".callout-btn.primary")).toHaveText("Alles klar");
  await expect(install.locator(".callout-never")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(install.locator(".callout-close")).toHaveAttribute("aria-label", /30 Tagen/);
  expect(await install.evaluate((c) => c.nextElementSibling && c.nextElementSibling.id)).toBe("foot");
  // Closed from the keyboard, the focus does not vanish into <body>.
  await install.locator(".callout-close").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".callout.show")).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
  await tall(page);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(2500);
  await expect(page.locator(".callout.show")).toHaveCount(0); // one nudge per visit
});
