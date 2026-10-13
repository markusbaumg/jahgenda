// Meine Shows: star → toolbar counter → own list → share link (#m=…) → .ics export.
const { test, expect, devices } = require("@playwright/test");
const { FIXTURE, useFixture, openList } = require("./helpers");

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("marks a show, filters to it, shares it and exports .ics", async ({ page, browser, isMobile }) => {
  await useFixture(page);
  await openList(page);
  const row = page.locator("#list .show").first();
  const star = row.locator(".act.star");
  if (!isMobile) await row.hover(); // desktop reveals the actions on hover
  // The ★ is always in the toolbar: muted and «disabled» until something is marked.
  const toggle = page.locator("#toggle-mine");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveClass(/empty/);
  await expect(toggle).toHaveAttribute("aria-disabled", "true");
  await expect(toggle.locator("b")).toHaveText("0");

  await star.click();
  await expect(row).toHaveClass(/interested/);
  await expect(star).toHaveAttribute("aria-pressed", "true");
  await expect(star.locator(".lbl")).toHaveText("Gemerkt: Interessiert");
  await expect(toggle).not.toHaveClass(/empty/);
  await expect(toggle.locator("b")).toHaveText("1");

  // The state is a two-segment toggle inside the marked row (the star never cycles: a second tap un-marks).
  const seg = row.locator(".mark-seg");
  await expect(seg.locator('[data-state="interested"]')).toHaveAttribute("aria-pressed", "true");
  await seg.locator('[data-state="going"]').click();
  await expect(row).toHaveClass(/going/);
  await expect(seg.locator('[data-state="going"]')).toHaveAttribute("aria-pressed", "true");
  await expect(star.locator(".lbl")).toHaveText("Gemerkt: Ich gehe");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const panel = page.locator("#mine-panel");
  await expect(panel).toBeVisible();
  await expect(page.locator("#list .show")).toHaveCount(1);

  // Share link: «Teilen» is the WhatsApp link where navigator.share is missing (the test browser) and
  // carries the same #m=<short>g link that «Link» copies.
  const wa = await page.locator("#mine-wa").getAttribute("href");
  expect(decodeURIComponent(wa)).toMatch(/#m=[a-z0-9]+g$/);
  // The message names the shows (date · title, city), not just «Meine Reggae-Shows» + link.
  expect(decodeURIComponent(wa)).toMatch(/Meine Reggae-Shows\n\S+ \d+\.\d+\. Roots Night, Bern\nhttp/);
  const copy = panel.locator('[data-mine="link"]');
  await copy.click();
  await expect(copy.locator(".fb")).toHaveText(/^Kopiert|Link in Adresszeile/);
  const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  if (copied) expect(copied).toMatch(/#m=[a-z0-9]+g$/);

  // The shared link opens a read-only view of exactly those shows – for a friend, i.e. in another
  // browser (in the own browser the same link is just «Meine Shows» again).
  const link = decodeURIComponent(wa).replace(/^[\s\S]*(?=#m=)/, ""); // the last line of the message
  const friend = await browser.newContext({ ...devices[isMobile ? "iPhone 13" : "Desktop Chrome"] });
  const fp = await friend.newPage();
  await useFixture(fp);
  await fp.goto(`/${link}`);
  await expect(fp.locator("#list .show")).toHaveCount(1);
  await expect(fp.locator("#list .show .goes")).toHaveText("geht hin"); // the friend's «Ich gehe», green words
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
  test.skip(isMobile, "the phone's inline action is covered in phone.spec.js");
  await useFixture(page);
  await openList(page);
  const row = page.locator("#list .show").first();
  await row.hover();
  const download = page.waitForEvent("download");
  await row.locator('[data-act="cal"]').click();
  expect((await download).suggestedFilename()).toMatch(/\.ics$/);
});

test("a stale #m= link opened while in Meine Shows leaves the list mode and says so", async ({
  page,
  isMobile,
}) => {
  await useFixture(page);
  await openList(page);
  const row = page.locator("#list .show").first();
  if (!isMobile) await row.hover();
  await row.locator(".act.star").click();
  await page.click("#toggle-mine");
  await expect(page.locator("body")).toHaveClass(/list-mode/);
  await page.evaluate(() => {
    location.hash = "#m=zzzzzzzi,yyyyyyyg"; // a friend's old link, tapped in this tab
  });
  await expect(page.locator("body")).not.toHaveClass(/list-mode/);
  await expect(page.locator(".link-note")).toContainText("Die Shows aus diesem Link sind vorbei");
  await expect(page.locator(".link-note")).toBeInViewport();
  await expect(page.locator("#list .show")).toHaveCount(FIXTURE.upcoming); // «hier ist alles, was kommt»
  await expect(page).not.toHaveURL(/#/);
});

test("a show link that replaces a friend's list lands in the agenda without clearing the filters", async ({
  page,
}) => {
  await useFixture(page);
  await openList(page);
  const first = await page.locator("#list .show").first().getAttribute("data-id");
  await page.fill("#q", "Ska");
  const ska = page.locator("#list .show").first();
  await expect(ska).toContainText("Ska");
  const skaId = await ska.getAttribute("data-id");
  // The friend's list is dropped before the landing (app.js revealFromHash), so the search stays.
  await page.evaluate((h) => (location.hash = h), `m=${encodeURIComponent(first)}:i`);
  await expect(page.locator("body")).toHaveClass(/list-shared/);
  await page.evaluate((h) => (location.hash = h), skaId);
  await expect(page.locator(`#list .show[data-id="${skaId}"]`)).toBeVisible();
  await expect(page.locator("body")).not.toHaveClass(/list-mode/);
  await expect(page.locator("#q")).toHaveValue("Ska");
});
