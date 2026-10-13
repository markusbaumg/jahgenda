// Phone layout: every row action sits inline on its own line (no «Mehr» sheet any more) – icon-only
// 44 × 44 targets named by their aria-label, the star in the side column, the feedback word as a plate.
const { test, expect } = require("@playwright/test");
const { useFixture, openList } = require("./helpers");

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone only");
  await useFixture(page);
  await openList(page);
});

// A box read at the end of a transform animation can come back as 43.99997: a 0.05 px tolerance
// swallows that float noise but still fails a target that is really half a pixel short.
const TAP = 44 - 0.05;
const size = async (locator) => {
  const b = await locator.boundingBox();
  return [b.width, b.height];
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
  // The star and the external «Infos» link share the side column: at least 8 px of dead space between
  // their hit boxes, so a low tap on the star never opens the organiser's page. Measured once the rows'
  // staggered enter animation (a scale) is over – a box read mid-way is a few percent short.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
  const starBox = await star.boundingBox();
  const infos = await row.locator('.actions a[href*="example.org/event"]').boundingBox();
  expect(infos.y - (starBox.y + starBox.height)).toBeGreaterThanOrEqual(8);
  // Nothing in the row widens the layout viewport (the 320 px phones shrink the targets instead).
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize().width);
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
  await expect(star.locator(".fb")).toHaveText("Entfernt"); // the star says what happened, too
  // One line, the title ellipsised, never the verb; the clock stops while Rückgängig has the focus.
  const box = await undo.boundingBox();
  expect(box.height).toBeLessThan(60);
  await undo.locator("button").focus();
  await page.waitForTimeout(4500);
  await expect(undo).toBeVisible();
  await undo.locator("button").click();
  await expect(row).toHaveClass(/going/);
  await expect(count).toHaveText("1");
  await expect(undo).toBeHidden();
});

// The hit span of a control: the vertical run of points at its centre that elementFromPoint hands to it
// (the drawn box may stay 32–36 px; the invisible extension has to make up the rest).
const hitSpan = (locator) =>
  locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    let top = null;
    let bottom = null;
    for (let y = Math.floor(r.top) - 12; y <= Math.ceil(r.bottom) + 12; y += 0.5) {
      const e = document.elementFromPoint(x, y);
      if (e && (e === el || el.contains(e))) {
        if (top === null) top = y;
        bottom = y;
      }
    }
    return top === null ? 0 : bottom - top + 0.5;
  });
// A sub-pixel box (339.6 px) loses up to half a pixel at each edge in elementFromPoint: 43 is a full 44.
const HIT = 43;

test("chips, panel ×, view switch and calendar «Heute» have a 44 px hit span on touch", async ({ page }) => {
  expect(await hitSpan(page.locator("#genres .chip").nth(1))).toBeGreaterThanOrEqual(HIT);
  // The row's scroll arrow is a 28 px disc over the last chip: on touch its hit box is 44 × 44.
  const arrow = page.locator(".scroll-btn.right");
  await expect(arrow).toBeVisible();
  expect(await hitSpan(arrow)).toBeGreaterThanOrEqual(HIT);
  expect(
    await arrow.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const y = r.top + r.height / 2;
      let w = 0;
      for (let x = r.left - 12; x <= r.right + 12; x += 0.5)
        if (document.elementFromPoint(x, y) === el) w += 0.5;
      return w;
    }),
  ).toBeGreaterThanOrEqual(HIT);
  for (const btn of await page.locator("#view-switch button").all())
    expect(await hitSpan(btn)).toBeGreaterThanOrEqual(HIT);
  await page.click("#toggle-where");
  const cantons = page.locator("#canton-chips .chip[data-canton]");
  expect(await hitSpan(cantons.first())).toBeGreaterThanOrEqual(HIT);
  // Two chips in consecutive rows: their hit areas touch (44 px pitch) but never overlap.
  const rows = await cantons.evaluateAll((els) => [
    ...new Set(els.map((e) => e.getBoundingClientRect().top)),
  ]);
  expect(rows.length).toBeGreaterThan(1);
  expect(rows[1] - rows[0]).toBeGreaterThanOrEqual(TAP);
  expect(await hitSpan(page.locator("#where-panel .panel-close"))).toBeGreaterThanOrEqual(HIT);
  await page.keyboard.press("Escape");
  await page.click("#toggle-when");
  expect(await hitSpan(page.locator('#when-panel [data-quick="today"]'))).toBeGreaterThanOrEqual(HIT);
  await page.keyboard.press("Escape");
  await page.locator('#view-switch [data-view="calendar"]').click();
  expect(await hitSpan(page.locator(".cal-today"))).toBeGreaterThanOrEqual(HIT);
});

test("the .ics action in the row starts a download and says «Gespeichert»", async ({ page }) => {
  const cal = page.locator('#list .show .actions [data-act="cal"]').first();
  const download = page.waitForEvent("download");
  await cal.click();
  expect((await download).suggestedFilename()).toMatch(/\.ics$/);
  await expect(cal.locator(".fb")).toHaveText("Gespeichert");
});

test("at 320 px the Meine-Shows head keeps its title readable: the ✕ drops the word «Zurück»", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.locator("#list .show .act.star").first().click();
  await page.click("#toggle-mine");
  await expect(page.locator("#list-head")).toBeVisible();
  const title = page.locator("#list-title .t");
  await expect(title).toHaveText("Meine Shows");
  expect(await title.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true); // no ellipsis
  const close = page.locator("#list-close");
  await expect(close).toHaveAttribute("aria-label", "Zurück zur Agenda");
  expect((await close.boundingBox()).width).toBeGreaterThanOrEqual(TAP);
  await expect(close.locator("span")).toBeHidden();
});
