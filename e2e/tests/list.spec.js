// The list: loads with month headings (real data), search and genre chips filter (fixture).
const { test, expect } = require("@playwright/test");
const { FIXTURE, useFixture, openList, results } = require("./helpers");

test("loads the real data and groups shows by month", async ({ page }) => {
  await page.goto("/");
  const loaded = page.locator("#list .show, #status .big").first();
  await expect(loaded).toBeVisible();
  test.skip(await page.locator("#status .big").isVisible(), "no upcoming shows in data/shows.json today");
  const headings = page.locator("#list h2.month");
  expect(await headings.count()).toBeGreaterThan(0);
  await expect(headings.first()).toHaveText(/\d{4}$/); // "Oktober 2026"
  await expect(results(page)).toHaveText(/^\d+ Konzerte? · /);
  await expect(page.locator("#updated")).toHaveText(/^Stand: /);
});

test.describe("with fixture data", () => {
  test.beforeEach(async ({ page }) => {
    await useFixture(page);
    await openList(page);
  });

  test("search filters by title, venue and town", async ({ page }) => {
    const rows = page.locator("#list .show");
    await expect(rows).toHaveCount(FIXTURE.upcoming);
    await expect(results(page)).toHaveText(new RegExp(`^${FIXTURE.upcoming} Konzerte · `));

    await page.fill("#q", "Dub Station");
    await expect(rows).toHaveCount(1);
    await expect(results(page)).toHaveText(/^1 Konzert für diese Auswahl/);
    await expect(page.locator("#clear-filters")).toBeVisible();

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
    await expect(page.locator("#status .big")).toHaveText("Nichts gefunden");
    await page.click("#status #reset");
    await expect(rows).toHaveCount(FIXTURE.upcoming);
    await expect(page.locator("#q")).toHaveValue("");
  });

  test("genre chips filter and show counts", async ({ page }) => {
    const chips = page.locator("#genres .chip");
    await expect(chips.first()).toHaveText("Alle");
    await expect(chips.first()).toHaveAttribute("aria-pressed", "true");
    const ska = page.locator('#genres .chip[data-genre="ska"]');
    await expect(ska.locator("small")).toHaveText(String(FIXTURE.ska));

    await ska.click();
    await expect(ska).toHaveAttribute("aria-pressed", "true");
    await expect(chips.first()).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#list .show")).toHaveCount(FIXTURE.ska);
    await expect(results(page)).toHaveText(new RegExp(`^${FIXTURE.ska} Konzerte für diese Auswahl`));

    await ska.click(); // same chip again = off
    await expect(chips.first()).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#list .show")).toHaveCount(FIXTURE.upcoming);
  });
});
