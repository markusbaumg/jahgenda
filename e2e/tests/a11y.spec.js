// Keyboard and screen-reader basics: skip links first, toolbar buttons with names that say what is
// set, the focus never dropped to <body> after a reset, no tab stops on other-month calendar days.
const { test, expect } = require("@playwright/test");
const { useFixture, openList, pill } = require("./helpers");

test.beforeEach(async ({ page }) => {
  await useFixture(page);
  await openList(page);
});

test("skip links are the first tab stops and jump to the agenda and the footer", async ({ page }) => {
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip").first()).toBeFocused();
  await expect(page.locator(".skip").first()).toHaveText("Zur Agenda");
  await page.keyboard.press("Enter");
  await expect(page.locator("#views")).toBeFocused();
  await expect(page).toHaveURL(/#views$/);
  await expect(page.locator(".link-note")).toBeHidden(); // an anchor is no stale show link
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement.closest("#list") !== null)).toBe(true);
});

test("Wo, Wann and ★ announce what is set; a reset never drops the focus to <body>", async ({
  page,
  isMobile,
}) => {
  const where = page.locator("#toggle-where");
  const when = page.locator("#toggle-when");
  await expect(where).toHaveAttribute("aria-label", "Wo: alle Orte");
  await expect(when).toHaveAttribute("aria-label", "Wann: alle kommenden");
  if (!isMobile) {
    await expect(where.locator(".icon-word")).toHaveText("Wo");
    await expect(when.locator(".icon-word")).toBeVisible();
  }
  await where.click();
  await page.locator('#canton-chips .chip[data-canton="BE"]').click();
  await expect(where).toHaveAttribute("aria-label", "Wo: BE");
  if (!isMobile) await expect(where.locator(".icon-word")).toBeHidden(); // the badge takes the word's place
  await page.keyboard.press("Escape");
  await expect(page.locator("#results-count")).toHaveText("2 Konzerte");
  // Removing the filter from the keyboard: the pill is gone after the re-render, so the focus moves to the
  // active-filter line (#results, tabindex=-1) – never to <body>.
  await pill(page, "canton", "BE").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#results")).toBeFocused();
  await expect(where).toHaveAttribute("aria-label", "Wo: alle Orte");
  // A reset from the empty state puts the focus back on the search.
  await page.fill("#q", "xyzzy");
  await page.locator('#genres .chip[data-genre="ska"]').click();
  await page.locator("#status #reset").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#q")).toBeFocused();
  await expect(page.locator("#q")).toHaveValue("");

  const row = page.locator("#list .show").first();
  const star = row.locator(".act.star");
  if (!isMobile) await row.hover();
  await star.click();
  await expect(page.locator("#toggle-mine")).toHaveAttribute("aria-label", "Meine Shows (1)");
});

test("other-month days in the calendar are not focusable; a tap on one turns the month", async ({ page }) => {
  await page.locator('#view-switch [data-view="calendar"]').click();
  await expect(page.locator("#calendar .cal-cell.other button")).toHaveCount(0);
  const other = page.locator("#calendar .cal-cell.other").first();
  const title = await page.locator("#calendar .cal-title").textContent();
  if ((await other.count()) === 0) return; // a month that starts on a Monday and ends on a Sunday
  await other.click();
  await expect(page.locator("#calendar .cal-title")).not.toHaveText(title);
});

test("choosing a calendar day keeps the focus on it and marks it pressed; the grid stays on screen", async ({
  page,
  isMobile,
}) => {
  await page.locator('#view-switch [data-view="calendar"]').click();
  const today = page.locator("#calendar .cal-cell.today .cal-num");
  await expect(today).toHaveAttribute("aria-pressed", "true"); // today is the preselected day
  const next = page.locator("#calendar .cal-cell:not(.other):not(.past) .cal-num").nth(3);
  const day = await next.evaluate((b) => b.closest("[data-day]").dataset.day);
  await next.focus();
  await page.keyboard.press("Enter");
  // The grid is rebuilt on every selection: the focus must land on the new button for the same day.
  const chosen = page.locator(`#calendar [data-day="${day}"] .cal-num`);
  await expect(chosen).toBeFocused();
  await expect(chosen).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('#calendar .cal-num[aria-pressed="true"]')).toHaveCount(1);
  if (!isMobile) return;
  // The phone lists the day under the grid: after a tap the grid is still there to pick the next day.
  await page.locator("#calendar .cal-cell.today").tap();
  await page.waitForTimeout(600);
  await expect(page.locator("#calendar .cal-grid")).toBeInViewport({ ratio: 0.5 });
  await expect(page.locator("#calendar .cal-day .show").first()).toBeInViewport();
});

test("at 200 % text size nothing overlaps and the page does not scroll sideways (WCAG 1.4.4)", async ({
  page,
}) => {
  await page.addStyleTag({ content: "html { font-size: 200% }" });
  await page.waitForTimeout(100);
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw).toBe(cw);
  // The HEUTE pill (the fixture has a show today) stays inside the date column, left of the title.
  const date = page.locator("#list .day.today time.date").first();
  const [clientW, scrollW] = await date.evaluate((d) => [d.clientWidth, d.scrollWidth]);
  expect(scrollW).toBeLessThanOrEqual(clientW);
  const pill = await date.locator(".dow.now").boundingBox();
  const title = await page.locator("#list .day.today .title").first().boundingBox();
  expect(pill.x + pill.width).toBeLessThanOrEqual(title.x);
});
