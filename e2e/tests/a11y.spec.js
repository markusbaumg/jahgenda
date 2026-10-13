// Keyboard and screen-reader basics: skip links first, toolbar buttons with names that say what is
// set, the focus never dropped to <body> after a reset, no tab stops on other-month calendar days.
const { test, expect } = require("@playwright/test");
const { useFixture, openList, pill, clickChip } = require("./helpers");

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
  await expect(page.locator("#results-count")).toHaveText("2 Shows");
  // Removing the filter from the keyboard: the pill is gone after the re-render, so the focus moves to the
  // active-filter line (#results, tabindex=-1) – never to <body>.
  await pill(page, "canton", "BE").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#results")).toBeFocused();
  await expect(where).toHaveAttribute("aria-label", "Wo: alle Orte");
  // A reset from the empty state puts the focus back on the search.
  await page.fill("#q", "xyzzy");
  await clickChip(page, '#genres .chip[data-genre="ska"]');
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

// Elements whose box reaches past the right edge of the viewport. body has overflow-x: clip (a safety
// net), so documentElement.scrollWidth never grows: a scrollWidth check passes while content is cut off.
// Hidden elements (no box) and content inside a container that scrolls sideways on purpose are skipped.
function clippedAtRight(page) {
  return page.evaluate(() => {
    const cw = document.documentElement.clientWidth;
    const scrolls = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll") return true;
      }
      return false;
    };
    return [...document.querySelectorAll("body *")]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ el, r }) => r.width && r.height && r.right > cw + 1 && !scrolls(el))
      .sort((a, b) => b.r.right - a.r.right)
      .slice(0, 3)
      .map(
        ({ el, r }) =>
          `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.className).split(" ")[0]} right=${Math.round(r.right)}`,
      );
  });
}

test("at 200 % text size nothing overlaps and nothing reaches past the right edge (WCAG 1.4.4)", async ({
  page,
  isMobile,
}) => {
  if (isMobile) await page.setViewportSize({ width: 375, height: 740 }); // the narrower iPhone (SE, mini)
  await page.addStyleTag({ content: "html { font-size: 200% }" });
  await page.waitForTimeout(100);
  // A marked show adds the «Interessiert | Ich gehe» toggle to its row: the widest thing a row can carry.
  const row = page.locator("#list .show").first();
  if (!isMobile) await row.hover();
  await row.locator(".act.star").click();
  await expect(row.locator(".mark-seg")).toBeVisible();
  // Name the culprits in the failure message (a bare «1426 ≠ 1280» from CI took a probe to decode).
  expect(await clippedAtRight(page), "cut off at the right edge at 200 %").toEqual([]);
  // The HEUTE pill (the fixture has a show today) stays inside the date column, left of the title.
  const date = page.locator("#list .day.today time.date").first();
  const [clientW, scrollW] = await date.evaluate((d) => [d.clientWidth, d.scrollWidth]);
  expect(scrollW).toBeLessThanOrEqual(clientW);
  const pill = await date.locator(".dow.now").boundingBox();
  const title = await page.locator("#list .day.today .title").first().boundingBox();
  expect(pill.x + pill.width).toBeLessThanOrEqual(title.x);
  // Meine Shows: the head shows its whole title, and the count stays clear of the ★ button.
  await page.locator("#toggle-mine").click();
  await expect(page.locator("#list-head")).toBeVisible();
  expect(await clippedAtRight(page), "Meine Shows cut off at the right edge at 200 %").toEqual([]);
  const t = page.locator("#list-title .t");
  const [tClient, tScroll] = await t.evaluate((e) => [e.clientWidth, e.scrollWidth]);
  expect(tScroll, "the Meine Shows title is cut short").toBeLessThanOrEqual(tClient);
  const n = await page.locator("#list-title .n").boundingBox();
  const star = await page.locator("#toggle-mine").boundingBox();
  const apart = n.x + n.width <= star.x || n.y >= star.y + star.height || n.y + n.height <= star.y;
  expect(apart, "the count badge sits on the ★ button").toBe(true);
});

test("row actions name their show, so a screen reader's lists of links and buttons tell the rows apart", async ({
  page,
}) => {
  const rows = page.locator("#list .show");
  for (const [i, title] of [
    [0, "Roots Night"],
    [1, "Dub Station"],
  ]) {
    for (const sel of ['[data-act="mark"]', '[data-act="cal"]', '[data-act="link"]', ".act.event"])
      await expect(rows.nth(i).locator(sel)).toHaveAttribute("aria-label", new RegExp(title));
  }
  const cal = rows.first().locator('[data-act="cal"]');
  await expect(cal).toHaveAttribute("aria-label", "Roots Night in Kalender speichern (.ics)");
  await expect(rows.first().locator('[data-act="mark"]')).toHaveAttribute(
    "aria-label",
    "Merken – Roots Night",
  );
});
