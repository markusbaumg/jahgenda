// The Wo panel: opens under the sticky bar, cantons multi-select, «Alle», closing, one panel at a time.
const { test, expect } = require("@playwright/test");
const { FIXTURE, useFixture, openList, results, chipCount, pill } = require("./helpers");

test.beforeEach(async ({ page }) => {
  await useFixture(page);
  await openList(page);
});

test("opens under the sticky bar and closes with ×, Escape and the button", async ({ page }) => {
  const btn = page.locator("#toggle-where");
  const panel = page.locator("#where-panel");
  await expect(panel).toBeHidden();

  await btn.click();
  await expect(panel).toBeVisible();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  const bar = await page.locator("#filters .toolbar").boundingBox();
  const box = await panel.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1);

  await panel.locator(".panel-close").click();
  await expect(panel).toBeHidden();
  await expect(btn).toHaveAttribute("aria-expanded", "false");

  await btn.click();
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  await btn.click();
  await expect(panel).toBeVisible();
  await btn.click();
  await expect(panel).toBeHidden();
});

test("cantons are a multi-select with counts; «Alle» resets", async ({ page }) => {
  const { ZH, BE } = FIXTURE.perCanton;
  await page.click("#toggle-where");
  const chip = (c) => page.locator(`#canton-chips .chip[data-canton="${c}"]`);
  const badge = page.locator("#toggle-where b");
  await expect(chip("ZH").locator("small")).toHaveText(chipCount(ZH));
  await expect(chip("BE").locator("small")).toHaveText(chipCount(BE));

  await chip("ZH").click();
  await expect(chip("ZH")).toHaveAttribute("aria-pressed", "true");
  await expect(chip("")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#list .show")).toHaveCount(ZH);
  await expect(badge).toHaveText("ZH");

  await chip("BE").click();
  await expect(page.locator("#list .show")).toHaveCount(ZH + BE);
  await expect(results(page)).toHaveText(new RegExp(`^${ZH + BE} Konzerte für diese Auswahl`));
  await expect(badge).toHaveText("ZH · BE");
  await expect(page.locator("#where-panel")).toBeVisible(); // choosing does not close the panel

  await chip("").click(); // Alle
  await expect(chip("")).toHaveAttribute("aria-pressed", "true");
  await expect(chip("ZH")).toHaveAttribute("aria-pressed", "false");
  await expect(badge).toBeHidden();
  await expect(page.locator("#list .show")).toHaveCount(FIXTURE.upcoming);
  await expect(results(page)).not.toHaveText(/für diese Auswahl/);
});

test("a canton badge in a row toggles the same filter", async ({ page }) => {
  const badge = page.locator("#list .show .canton").first();
  const code = await badge.getAttribute("data-canton");
  await badge.click();
  await expect(page.locator("#toggle-where b")).toHaveText(code);
  await expect(page.locator("#list .show .canton").first()).toHaveAttribute("aria-pressed", "true");
  await expect(results(page)).toHaveText(/für diese Auswahl/);
  // One active filter = one gold pill on the results row; its ✕ removes exactly that filter.
  await expect(pill(page, "canton", code)).toBeVisible();
  await expect(page.locator('#results [data-remove="all"]')).toHaveCount(0); // «Alles zurücksetzen» needs two
  await pill(page, "canton", code).click();
  await expect(page.locator("#toggle-where b")).toBeHidden();
  await expect(page.locator("#list .show .canton").first()).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#list .show")).toHaveCount(FIXTURE.upcoming);
});

test("only one panel is open at a time", async ({ page }) => {
  await page.click("#toggle-where");
  await expect(page.locator("#where-panel")).toBeVisible();
  await page.click("#toggle-when");
  await expect(page.locator("#when-panel")).toBeVisible();
  await expect(page.locator("#where-panel")).toBeHidden();
  await expect(page.locator("#toggle-where")).toHaveAttribute("aria-expanded", "false");
  await page.click("#toggle-where");
  await expect(page.locator("#where-panel")).toBeVisible();
  await expect(page.locator("#when-panel")).toBeHidden();
});

test("the open panel never runs past the fold – also at the top of the page and in landscape", async ({
  page,
}) => {
  // At scrollY 0 the bar is not stuck yet (it sits under the header): the panel's height counts from the
  // bar's real bottom edge, not from --bar-h.
  const probe = async () => {
    const panel = page.locator("#where-panel");
    await expect(panel).toBeVisible();
    const bar = await page.locator("#filters").boundingBox();
    const box = await panel.boundingBox();
    const vh = page.viewportSize().height;
    expect(box.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
    expect(box.y + box.height).toBeLessThanOrEqual(vh);
    const maxH = await panel.evaluate((p) => parseFloat(getComputedStyle(p).maxHeight));
    expect(Math.round(maxH)).toBe(Math.round(vh - box.y - 24));
    // The inner scroll reaches the last chip.
    await panel.evaluate((p) => (p.scrollTop = p.scrollHeight));
    await expect(panel.locator(".chip:not([hidden])").last()).toBeInViewport();
  };
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.click("#toggle-where");
  await probe();
  await page.keyboard.press("Escape");
  // Landscape / 200 % zoom (viewport under 500 px high): the bar unsticks but stays the panel's anchor –
  // the panel hangs from the bar, not from the end of the page, and nothing widens the document.
  await page.setViewportSize({ width: 568, height: 320 });
  await page.click("#toggle-where");
  await probe();
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw).toBe(cw);
});
