// Phone layout: every row action sits inline on its own line (no «Mehr» sheet any more) – icon-only
// 44 × 44 targets named by their aria-label, the star in the side column, the feedback word as a plate.
const { test, expect } = require("@playwright/test");
const { useFixture, openList } = require("./helpers");

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone only");
  await useFixture(page);
  await openList(page);
});

const TAP = 44;
// Whole pixels: a box read at the end of a transform animation can come back as 43.99997.
const size = async (locator) => {
  const b = await locator.boundingBox();
  return [Math.round(b.width), Math.round(b.height)];
};

test("every row action is reachable inline: icon-only 44 px targets with names", async ({ page }) => {
  const row = page.locator("#list .show").first();
  await expect(row.locator(".act.more")).toHaveCount(0); // nothing collapses into a sheet
  await expect(page.locator(".sheet")).toHaveCount(0);

  // Kalender (.ics) · Google · Teilen (WhatsApp without navigator.share) · Link · Infos (the show has a URL).
  const actions = row.locator(".actions .act");
  await expect(actions).toHaveCount(5);
  const names = await actions.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  for (const re of [
    /^In Kalender speichern/,
    /^In Google Kalender/,
    /teilen$/,
    /^Link zu dieser Show/,
    /^Infos beim Veranstalter/,
  ])
    expect(
      names.some((n) => re.test(n)),
      String(re),
    ).toBe(true);
  await expect(row.locator('.actions a[href*="calendar.google.com"]')).toBeVisible();
  await expect(row.locator('.actions a[href*="example.org/event"]')).toHaveAttribute("target", "_blank");

  // Icon-only, but never smaller than a fingertip; the label lives in the name (and from 768 px on screen).
  for (const act of await actions.all()) {
    await expect(act).toBeVisible();
    await expect(act.locator(".lbl")).toBeHidden();
    const [w, h] = await size(act);
    expect(w, await act.getAttribute("aria-label")).toBeGreaterThanOrEqual(TAP);
    expect(h, await act.getAttribute("aria-label")).toBeGreaterThanOrEqual(TAP);
  }
  const star = row.locator(".side .act.star");
  await expect(star).toBeVisible();
  const [sw, sh] = await size(star);
  expect(sw).toBeGreaterThanOrEqual(TAP);
  expect(sh).toBeGreaterThanOrEqual(TAP);
  const [cw, ch] = await size(row.locator(".side .canton"));
  expect(cw).toBeGreaterThanOrEqual(TAP);
  expect(ch).toBeGreaterThanOrEqual(TAP);
});

test("the star marks the row; the state toggle and the ★ count mirror it; a second tap un-marks with Rückgängig", async ({
  page,
}) => {
  const row = page.locator("#list .show").first();
  const star = row.locator(".act.star");
  const count = page.locator("#toggle-mine b");

  await star.click();
  await expect(row).toHaveClass(/interested/);
  await expect(star).toHaveAttribute("aria-pressed", "true");
  await expect(star.locator(".fb")).toHaveText("Gemerkt"); // the feedback word next to the icon
  await expect(count).toHaveText("1");
  const seg = row.locator(".mark-seg");
  await expect(seg).toBeVisible();
  await expect(seg.locator('[data-state="interested"]')).toHaveAttribute("aria-pressed", "true");

  await seg.locator('[data-state="going"]').click();
  await expect(row).toHaveClass(/going/);
  await expect(seg.locator('[data-state="going"]')).toHaveAttribute("aria-pressed", "true");
  await expect(star.locator(".lbl")).toHaveText("Gemerkt: Ich gehe");

  // The star never cycles: the second tap removes the mark, and the toast offers Rückgängig for 4 s.
  await star.click();
  await expect(row).not.toHaveClass(/interested|going/);
  await expect(count).toHaveText("0");
  const undo = page.locator("#undo");
  await expect(undo).toBeVisible();
  await expect(undo).toContainText("entfernt");
  await undo.locator("button").click();
  await expect(row).toHaveClass(/going/);
  await expect(count).toHaveText("1");
  await expect(undo).toBeHidden();
});

test("the .ics action in the row starts a download and says «Gespeichert»", async ({ page }) => {
  const cal = page.locator('#list .show .actions [data-act="cal"]').first();
  const download = page.waitForEvent("download");
  await cal.click();
  expect((await download).suggestedFilename()).toMatch(/\.ics$/);
  await expect(cal.locator(".fb")).toHaveText("Gespeichert");
});
