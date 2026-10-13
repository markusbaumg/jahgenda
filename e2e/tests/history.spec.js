// Back button: closes an open panel or the action sheet, returns from a view switch and from a
// calendar-pill jump – never leaves the site with an overlay still open (the reflex on phones).
const { test, expect } = require("@playwright/test");
const { useFixture, openList } = require("./helpers");

test.beforeEach(async ({ page }) => {
  await useFixture(page);
  await page.goto("about:blank"); // a real previous entry, so "leaving the site" would be observable
  await openList(page);
});

const onSite = async (page) => expect(page).toHaveURL(/127\.0\.0\.1:4173/);

test("Back closes the Wo panel instead of leaving the page", async ({ page }) => {
  await page.click("#toggle-where");
  await expect(page.locator("#where-panel")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#where-panel")).toBeHidden();
  await onSite(page);
  await expect(page.locator("#list .show").first()).toBeVisible();
  // Closing with × pops the entry again: one Back now leaves (the entry count is back to the start).
  await page.click("#toggle-when");
  await expect(page.locator("#when-panel")).toBeVisible();
  await page.locator("#when-panel .panel-close").click();
  await expect(page.locator("#when-panel")).toBeHidden();
  await page.waitForTimeout(200);
  await page.goBack();
  await expect(page).toHaveURL("about:blank");
});

test("Back after a calendar pill jump returns to the calendar", async ({ page, isMobile }) => {
  test.skip(isMobile, "the phone grid shows dots and lists the day below; no jump to the list");
  await page.locator('#view-switch [data-view="calendar"]').click();
  await expect(page.locator("#calendar")).toBeVisible();
  await page.locator("#calendar .cal-cell.today .pill").click();
  await expect(page.locator("#list")).toBeVisible();
  await expect(page).toHaveURL(/#[a-z0-9]{5,8}$/); // the short hash the share links use
  await expect(page.locator("#list .show.highlight")).toHaveCount(1);
  await page.goBack();
  await expect(page.locator("#calendar")).toBeVisible();
  await expect(page.locator('#view-switch [data-view="calendar"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page).not.toHaveURL(/#/);
  await page.goBack();
  await expect(page.locator("#list")).toBeVisible();
  await onSite(page);
});

test("Back closes the action sheet on the phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone only");
  await page.locator("#list .show .act.more").first().click();
  await expect(page.locator(".sheet")).toBeVisible();
  await page.goBack();
  await expect(page.locator(".sheet")).toBeHidden();
  await onSite(page);
});
