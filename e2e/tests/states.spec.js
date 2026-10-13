// Loading, error and deep-link states: a filter tap never replaces the skeleton or the error with a
// false «Noch nichts im Kalender», the error offers a retry, the empty state comes into view when
// filtering while scrolled, a shared show lands under the bar (not behind it) and stale links say so.
const { test, expect } = require("@playwright/test");
const { FIXTURE, useFixture, openList } = require("./helpers");
const { shortId } = require("../../lib.js");

test("typing while the data loads keeps the skeleton; a 500 shows an error with a retry", async ({
  page,
}) => {
  await useFixture(page);
  let release;
  const gate = new Promise((r) => (release = r));
  await page.route("**/data/shows.json", async (route) => {
    await gate;
    await route.fulfill({ status: 500, body: "nope" });
  });
  await page.goto("/");
  const skeleton = page.locator("#status .skeleton"); // the six skeleton day groups live in #status
  await expect(skeleton).toBeVisible();
  await page.fill("#q", "dub");
  await page.waitForTimeout(200);
  await expect(skeleton).toBeVisible();
  await expect(page.locator("#status .big")).toHaveCount(0); // no false «Noch nichts im Kalender»

  release();
  await expect(page.locator("#status .big")).toHaveText("Daten konnten nicht geladen werden"); // online, so not «Kein Empfang»
  await page.fill("#q", "ska");
  await page.locator('#view-switch [data-view="calendar"]').click();
  await expect(page.locator("#status .big")).toHaveText("Daten konnten nicht geladen werden"); // the error stays

  await page.unroute("**/data/shows.json");
  await useFixture(page); // the real route again
  await page.click("#status #retry");
  await expect(page.locator("#status")).toHaveText("");
  await expect(page.locator("#calendar .cal-grid")).toBeVisible(); // the view chosen meanwhile
  await page.locator('#view-switch [data-view="list"]').click();
  await page.fill("#q", "");
  await expect(page.locator("#list .show")).toHaveCount(FIXTURE.upcoming);
});

test("a search with no result while scrolled brings «Nichts gefunden» into view", async ({ page }) => {
  await useFixture(page);
  await openList(page);
  // Make the page long enough to scroll on the desktop too.
  await page.evaluate(() => (document.querySelector(".foot").style.minHeight = "3000px"));
  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.fill("#q", "zzzz");
  await expect(page.locator("#status .big")).toHaveText("Nichts zu «zzzz»"); // the empty state names the cause
  await page.waitForTimeout(300); // the bar grows a row when it sticks; the page corrects once more
  const box = await page.locator("#status").boundingBox();
  const bar = await page.locator("#filters").boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
  expect(box.y).toBeLessThan(bar.y + bar.height + 200);
});

test("a shared show link lands with the row under the sticky bar, also after venues.json re-renders", async ({
  page,
}) => {
  await useFixture(page);
  // venues.json arrives late, after the first scroll – the rows above the target grow by then.
  await page.route("**/data/venues.json", async (route) => {
    await new Promise((r) => setTimeout(r, 700));
    await route.continue();
  });
  await openList(page);
  const id = await page.locator("#list .show").last().getAttribute("data-id");
  await page.goto(`/#${shortId(id)}`);
  const row = page.locator(`#list .show[data-id="${id}"]`);
  await expect(row).toHaveClass(/highlight/);
  await page.waitForTimeout(1500); // venues re-render + smooth scroll settle
  await expect(row).toHaveClass(/highlight/); // the highlight survived the re-render
  const box = await row.boundingBox();
  const bar = await page.locator("#filters").boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
  expect(box.y).toBeLessThan(bar.y + bar.height + 120);
});

test("a link to a show that is gone says so instead of silently showing everything", async ({ page }) => {
  await useFixture(page);
  await page.goto("/#zzzzzzz");
  await expect(page.locator("#list .show")).toHaveCount(FIXTURE.upcoming);
  await expect(page.locator(".link-note")).toContainText("nicht mehr in der Agenda");
  await expect(page).not.toHaveURL(/#/);

  const id = await page.locator("#list .show").first().getAttribute("data-id");
  await page.goto(`/#m=${shortId(id)}i,zzzzzzzi`); // one known, one unknown
  await expect(page.locator("#list .show")).toHaveCount(1);
  await expect(page.locator("#mine-panel .mine-note")).toContainText("1 Show aus dem Link ist vorbei");

  await page.goto("/#m=zzzzzzzi,yyyyyyyg");
  await expect(page.locator("#list .show")).toHaveCount(FIXTURE.upcoming);
  await expect(page.locator(".link-note")).toContainText("Die Shows aus diesem Link sind vorbei");
});
