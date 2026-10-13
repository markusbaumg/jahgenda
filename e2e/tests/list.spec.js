// The list: loads with month headings (real data), search and genre chips filter (fixture).
const { test, expect } = require("@playwright/test");
const { FIXTURE, useFixture, openList, results, chipCount, pill, clickChip } = require("./helpers");

test("loads the real data and groups shows by month", async ({ page }) => {
  await page.goto("/");
  const loaded = page.locator("#list .show, #status .big").first();
  await expect(loaded).toBeVisible();
  test.skip(await page.locator("#status .big").isVisible(), "no upcoming shows in data/shows.json today");
  const headings = page.locator("#list h2.month");
  expect(await headings.count()).toBeGreaterThan(0);
  await expect(headings.first()).toHaveText(/\d{4}$/); // "Oktober 2026"
  await expect(results(page)).toHaveText(/^\d+ Shows? · /);
  await expect(page.locator("#updated")).toHaveText(/^Stand: /);
});

test.describe("with fixture data", () => {
  test.beforeEach(async ({ page }) => {
    await useFixture(page);
    await openList(page);
  });

  test("a reload and Back from another page land where the visitor was, not at the end", async ({ page }) => {
    // The browser's own restoration lands in the skeleton page and scroll anchoring then drags the visitor to
    // the footer as the list is inserted; the page remembers the offset itself (history.state).
    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForTimeout(600); // the offset is written once the scrolling stops
    await page.reload();
    await expect(page.locator("#list .show").first()).toBeAttached();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(360);
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(440);
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(600);
    await page.goto("/log.html");
    await page.goBack();
    await expect(page.locator("#list .show").first()).toBeAttached();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(260);
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(340);
  });

  test("search filters by title, venue and town", async ({ page }) => {
    const rows = page.locator("#list .show");
    await expect(rows).toHaveCount(FIXTURE.upcoming);
    await expect(results(page)).toHaveText(new RegExp(`^${FIXTURE.upcoming} Shows · `));

    await page.fill("#q", "Dub Station");
    await expect(rows).toHaveCount(1);
    await expect(results(page)).toHaveText(/^1 Show für diese Auswahl/);
    await expect(pill(page, "q")).toHaveText(/«Dub Station»/); // the search as a removable pill

    await page.fill("#q", "luzern");
    await expect(rows).toHaveCount(FIXTURE.perCanton.LU);

    // Accents and umlauts do not matter, nor the order of the words; a canton's code or French name
    // and the spoken short names of the big towns work too.
    const zh = FIXTURE.perCanton.ZH;
    const cases = [
      ["zurich", zh],
      ["zuerich", zh],
      ["Züri", zh],
      ["ZH", zh],
      ["Zurich reggae", 1],
      ["station dub", 1],
      ["lozärn", FIXTURE.perCanton.LU],
      ["l’", 0],
    ];
    for (const [q, n] of cases) {
      await page.fill("#q", q);
      await expect(rows, q).toHaveCount(n);
    }

    await page.fill("#q", "xyzzy");
    await expect(page.locator("#status .big")).toHaveText("Nichts zu «xyzzy»"); // names the cause
    // The empty state offers to remove the search with what that yields (the only filter: no «Alles zurücksetzen»).
    const fix = page.locator('#status .fix[data-remove="q"]');
    await expect(fix).toHaveText(new RegExp(`«xyzzy» entfernen → ${FIXTURE.upcoming} Shows`));
    await fix.click();
    await expect(rows).toHaveCount(FIXTURE.upcoming);
    await expect(page.locator("#q")).toHaveValue("");
  });

  test("genre chips filter and show counts", async ({ page }) => {
    const chips = page.locator("#genres .chip");
    await expect(chips.first()).toHaveText("Alle");
    await expect(chips.first()).toHaveAttribute("aria-pressed", "true");
    const ska = page.locator('#genres .chip[data-genre="ska"]');
    await expect(ska.locator("small")).toHaveText(chipCount(FIXTURE.ska));

    await clickChip(page, '#genres .chip[data-genre="ska"]');
    await expect(ska).toHaveAttribute("aria-pressed", "true");
    await expect(chips.first()).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#list .show")).toHaveCount(FIXTURE.ska);
    await expect(results(page)).toHaveText(new RegExp(`^${FIXTURE.ska} Shows für diese Auswahl`));

    await clickChip(page, '#genres .chip[data-genre="ska"]'); // same chip again = off
    await expect(chips.first()).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#list .show")).toHaveCount(FIXTURE.upcoming);
  });
});
