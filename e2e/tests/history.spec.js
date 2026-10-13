// Back button: closes an open panel, returns from a view switch and from a calendar-pill jump – never
// leaves the site with an overlay still open or a view still switched (the reflex on phones).
const { test, expect } = require("@playwright/test");
const { useFixture, openList } = require("./helpers");

test.beforeEach(async ({ page }) => {
  await useFixture(page);
  await page.goto("about:blank"); // a real previous entry, so "leaving the site" would be observable
  await openList(page);
});

const onSite = async (page) => expect(page).toHaveURL(/127\.0\.0\.1:\d+\//);

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
  await expect(page).toHaveURL(/#view=calendar$/); // the view travels in the hash, like the filters
  await page.goBack();
  await expect(page.locator("#list")).toBeVisible();
  await expect(page).not.toHaveURL(/#/);
  await onSite(page);
});

test("Back returns from a view switch on the phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone only");
  // The row actions are inline on the phone (no sheet to close, see phone.spec.js); the one overlay-like
  // step left on a phone is the view switch, which pushes an entry of its own.
  await page.locator('#view-switch [data-view="calendar"]').click();
  await expect(page.locator("#calendar .cal-grid")).toBeVisible();
  await expect(page.locator("#list")).toBeHidden();
  await page.goBack();
  await expect(page.locator("#list .show").first()).toBeVisible();
  await expect(page.locator("#calendar")).toBeHidden();
  await expect(page.locator('#view-switch [data-view="list"]')).toHaveAttribute("aria-pressed", "true");
  await onSite(page);
  // One more Back now leaves (the switch's entry was the only one).
  await page.goBack();
  await expect(page).toHaveURL("about:blank");
});

test("Back closes Meine Shows instead of leaving the page", async ({ page, isMobile }) => {
  const row = page.locator("#list .show").first();
  if (!isMobile) await row.hover();
  await row.locator(".act.star").click();
  await page.click("#toggle-mine");
  await expect(page.locator("body")).toHaveClass(/list-mode/);
  await expect(page.locator("#list-head")).toBeVisible();
  // The list actions are the point of the view: they are on screen right after the tap, not under the bar.
  const link = page.locator('#mine-panel [data-mine="link"]');
  await expect(link).toBeInViewport();
  const bar = await page.locator("#filters").boundingBox();
  const panel = await page.locator("#mine-panel").boundingBox();
  expect(panel.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
  await page.goBack();
  await expect(page.locator("body")).not.toHaveClass(/list-mode/);
  await expect(page.locator("#list-head")).toBeHidden();
  await onSite(page);
  await expect(page.locator("#list .show")).toHaveCount(6);
  await expect(page.locator("#toggle-mine")).toBeFocused();
  // ✕ pops the entry again: one Back now leaves.
  await page.click("#toggle-mine");
  await expect(page.locator("body")).toHaveClass(/list-mode/);
  await page.click("#list-close");
  await expect(page.locator("body")).not.toHaveClass(/list-mode/);
  await page.waitForTimeout(200);
  await page.goBack();
  await expect(page).toHaveURL("about:blank");
});
