// Phone layout: the row actions collapse into «Mehr», which opens the bottom action sheet.
const { test, expect } = require("@playwright/test");
const { useFixture, openList } = require("./helpers");

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone only");
  await useFixture(page);
  await openList(page);
});

test("«Mehr» opens the action sheet with every action, × and Escape close it", async ({ page }) => {
  const row = page.locator("#list .show").first();
  const more = row.locator(".act.more");
  await expect(more).toBeVisible();
  await expect(row.locator('.act[data-act="cal"]')).toBeHidden(); // collapsed into the sheet
  const title = (await row.locator(".title").textContent()).trim();

  await more.click();
  const sheet = page.locator(".sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator(".sheet-panel")).toHaveAttribute("role", "dialog");
  await expect(sheet.locator(".sheet-title")).toHaveText(title);
  await expect(more).toHaveAttribute("aria-expanded", "true");
  for (const label of [
    "Merken",
    "Kalender (.ics)",
    "Google Kalender",
    "Event-Seite",
    "WhatsApp",
    "Link teilen",
  ])
    await expect(sheet.locator(".sheet-actions .act", { hasText: label })).toBeVisible();

  await sheet.locator(".sheet-close").click();
  await expect(sheet).toBeHidden();
  await expect(more).toHaveAttribute("aria-expanded", "false");

  await more.click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

test("the star in the sheet marks the row and the sheet mirrors it", async ({ page }) => {
  const row = page.locator("#list .show").first();
  await row.locator(".act.more").click();
  const sheet = page.locator(".sheet");
  await sheet.locator(".sheet-actions .act.star").click();
  await expect(sheet.locator(".sheet-panel")).toHaveClass(/interested/);
  await expect(sheet.locator(".sheet-actions .act.star")).toHaveText("Interessiert");
  await expect(row).toHaveClass(/interested/);
  await expect(page.locator("#toggle-mine b")).toHaveText("1");
  await sheet.locator(".sheet-backdrop").click({ position: { x: 10, y: 10 } });
  await expect(sheet).toBeHidden();
});

test("the .ics action in the sheet starts a download", async ({ page }) => {
  await page.locator("#list .show .act.more").first().click();
  const download = page.waitForEvent("download");
  await page.locator('.sheet-actions [data-act="cal"]').click();
  expect((await download).suggestedFilename()).toMatch(/\.ics$/);
  await expect(page.locator(".sheet")).toBeHidden();
});
