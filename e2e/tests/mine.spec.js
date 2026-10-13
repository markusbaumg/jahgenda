// Meine Shows: star → toolbar counter → own list → share link (#m=…) → .ics export.
const { test, expect, devices } = require("@playwright/test");
const { useFixture, openList } = require("./helpers");

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("marks a show, filters to it, shares it and exports .ics", async ({ page, browser, isMobile }) => {
  await useFixture(page);
  await openList(page);
  const row = page.locator("#list .show").first();
  const star = row.locator(".act.star");
  if (!isMobile) await row.hover(); // desktop reveals the actions on hover
  const toggle = page.locator("#toggle-mine");
  await expect(toggle).toBeHidden();

  await star.click();
  await expect(row).toHaveClass(/interested/);
  await expect(star).toHaveText("Interessiert");
  await expect(toggle).toBeVisible();
  await expect(toggle.locator("b")).toHaveText("1");

  await star.click();
  await expect(row).toHaveClass(/going/);
  await expect(star).toHaveText("Ich gehe");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const panel = page.locator("#mine-panel");
  await expect(panel).toBeVisible();
  await expect(page.locator("#list .show")).toHaveCount(1);

  // Share link: the WhatsApp button carries the same #m=<short>g link that «Liste teilen» copies.
  const wa = await page.locator("#mine-wa").getAttribute("href");
  expect(decodeURIComponent(wa)).toMatch(/#m=[a-z0-9]+g$/);
  const share = panel.locator('[data-mine="share"]');
  await share.click();
  await expect(share.locator("span")).toHaveText(/^Kopiert|Kopieren nicht möglich/);
  const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  if (copied) expect(copied).toMatch(/#m=[a-z0-9]+g$/);

  // The shared link opens a read-only view of exactly those shows – for a friend, i.e. in another
  // browser (in the own browser the same link is just «Meine Shows» again).
  const link = decodeURIComponent(wa).replace(/^.*(?=#m=)/, "");
  const friend = await browser.newContext({ ...devices[isMobile ? "iPhone 13" : "Desktop Chrome"] });
  const fp = await friend.newPage();
  await useFixture(fp);
  await fp.goto(`/${link}`);
  await expect(fp.locator("#list .show")).toHaveCount(1);
  await expect(fp.locator("#list .show .tag-chip.going")).toHaveText("geht hin");
  await expect(fp.locator("#results-text")).toHaveText(/^Geteilte Liste · 1 Show/);
  await expect(fp.locator("body")).toHaveClass(/list-shared/);
  await fp.click("#list-close"); // «Zurück zur Agenda» in the list-mode header
  await expect(fp.locator("#list .show")).toHaveCount(6);
  await friend.close();

  // .ics export of the own list (the first page is still in «Meine Shows»).
  await expect(page.locator("#mine-panel")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.locator('#mine-panel [data-mine="ics"]').click();
  expect((await download).suggestedFilename()).toBe("meine-shows.ics");
});

test("the per-show calendar button downloads one .ics", async ({ page, isMobile }) => {
  test.skip(isMobile, "the phone keeps this action in the sheet (see phone.spec.js)");
  await useFixture(page);
  await openList(page);
  const row = page.locator("#list .show").first();
  await row.hover();
  const download = page.waitForEvent("download");
  await row.locator('[data-act="cal"]').click();
  expect((await download).suggestedFilename()).toMatch(/\.ics$/);
});
