// The callouts (install nudge, calendar subscription): a nudge never covers what the visitor is doing,
// at most one nudge per visit, and the callout opened on purpose behaves like a dialog.
const { test, expect } = require("@playwright/test");
const { useFixture, openList } = require("./helpers");

test.beforeEach(async ({ page }) => {
  await useFixture(page, { callouts: true });
  await page.evaluate(() => {}).catch(() => {});
});

const tall = (page) => page.evaluate(() => (document.querySelector(".foot").style.minHeight = "3000px"));

test("the subscribe nudge waits while a panel is open and comes once it is closed", async ({ page }) => {
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
  await install.locator(".callout-close").click();
  await expect(page.locator(".callout.show")).toHaveCount(0);
  await tall(page);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(2500);
  await expect(page.locator(".callout.show")).toHaveCount(0); // one nudge per visit
});
