// The Wann panel: quick picks (Heute / Wochenende / 7 Tage) and the month histogram.
const { test, expect } = require("@playwright/test");
const { FIXTURE, useFixture, openList, results } = require("./helpers");

test.beforeEach(async ({ page }) => {
  await useFixture(page);
  await openList(page);
  await page.click("#toggle-when");
  await expect(page.locator("#when-panel")).toBeVisible();
});

test("quick picks set a range, badge and count; Zurücksetzen clears", async ({ page }) => {
  const badge = page.locator("#toggle-when b");
  const count = page.locator("#when-count");
  await expect(badge).toBeHidden();
  await expect(count).toHaveText(`Alle ${FIXTURE.upcoming} kommenden Konzerte`);

  const panel = page.locator("#when-panel");
  const heute = page.locator('#when-panel [data-quick="today"]');
  await heute.click();
  // A quick pick is a single choice: the panel closes on the tap (the rows are the point), the focus
  // goes to the toggle like after Escape; the month bars below keep the panel open (multi-select).
  await expect(panel).toBeHidden();
  await expect(page.locator("#toggle-when")).toBeFocused();
  await page.click("#toggle-when");
  await expect(panel).toBeVisible();
  await expect(heute).toHaveAttribute("aria-pressed", "true");
  await expect(badge).toHaveText("Heute"); // the badge names the quick pick, not its dates
  await expect(count).toHaveText("1 Konzert im Zeitraum"); // the fixture has exactly one show today
  await expect(page.locator("#list .show")).toHaveCount(1);
  await expect(results(page)).toHaveText(/für diese Auswahl · .* · Heute$/);

  const week = page.locator('#when-panel [data-quick="7"]');
  await week.click();
  await expect(panel).toBeHidden();
  await page.click("#toggle-when");
  await expect(week).toHaveAttribute("aria-pressed", "true");
  await expect(heute).toHaveAttribute("aria-pressed", "false");
  await expect(badge).toHaveText("7 Tage");
  await expect(count).toHaveText("2 Konzerte im Zeitraum"); // today + 3 days

  const weekend = page.locator('#when-panel [data-quick="weekend"]');
  await weekend.click();
  await expect(panel).toBeHidden();
  await page.click("#toggle-when");
  await expect(weekend).toHaveAttribute("aria-pressed", "true");
  await expect(badge).toHaveText("Wochenende");
  await expect(weekend).toHaveAttribute("title", /^Wochenende \d{1,2}\.\d{1,2}\.–\d{1,2}\.\d{1,2}\./); // the dates live in the tooltip

  await page.click("#when-reset");
  await expect(badge).toBeHidden();
  await expect(weekend).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#list .show")).toHaveCount(FIXTURE.upcoming);
});

test("month histogram: a bar per month, click selects the month", async ({ page }) => {
  const bars = page.locator("#when-months .bar");
  expect(await bars.count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator("#when-months .bar.today")).toHaveCount(1);
  // Bar heights follow the counts (4 shows this month, 2 next month: half as tall, not clamped alike).
  const heights = await bars.evaluateAll((els) =>
    els.map((b) => [
      Number(b.querySelector("b").textContent),
      b.querySelector("i").getBoundingClientRect().height,
    ]),
  );
  const [, hMax] = heights.find(([n]) => n === Math.max(...heights.map(([n]) => n)));
  for (const [n, h] of heights)
    if (n && n < Math.max(...heights.map(([n]) => n))) expect(h).toBeLessThan(hMax - 4);
  // Every bar has an accessible name with the unit, e.g. «Oktober 2026, 4 Konzerte».
  await expect(bars.first()).toHaveAttribute("aria-label", /^\S+ \d{4}, \d+ Konzerte?$/);
  // The year suffix appears at most once per year in the labels.
  const labels = await bars.locator("span").allTextContents();
  const years = labels.filter((l) => /’\d\d/.test(l)).map((l) => l.slice(-2));
  expect(new Set(years).size).toBe(years.length);

  const bar = page.locator(`#when-months .bar[data-month="${FIXTURE.nextMonthKey}"]`);
  await expect(bar).toBeVisible();
  const n = Number(await bar.locator("b").textContent());
  expect(n).toBeGreaterThanOrEqual(2);
  const label = (await bar.locator("span").textContent()).trim();

  await bar.click();
  await expect(bar).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#toggle-when b")).toHaveText(label);
  await expect(page.locator("#when-count")).toHaveText(`${n} Konzerte im Zeitraum`);
  await expect(page.locator("#list .show")).toHaveCount(n);
  await expect(page.locator("#when-months .bar.dim").first()).toBeVisible(); // the others dim

  await bar.click(); // off again
  await expect(bar).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#toggle-when b")).toBeHidden();
  await expect(page.locator("#list .show")).toHaveCount(FIXTURE.upcoming);
});
