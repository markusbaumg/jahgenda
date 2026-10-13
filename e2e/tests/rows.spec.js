// Rows and day groups on their own (story #33 M2): the parts of list/states/where/geo specs that need no
// filter bar – deep links, the stale-link note, the coat-of-arms toggle, the feedback words, distances,
// the past footer and the day/month heads.
const { test, expect } = require("@playwright/test");
const { FIXTURE, useFixture, openList } = require("./helpers");
const { shortId } = require("../../src/lib/hash.js");

test.beforeEach(async ({ page }) => {
  await useFixture(page);
});

test("day groups: HEUTE on today's date, month heads with the year, the Wochenende rule at most once", async ({
  page,
}) => {
  await openList(page);
  await expect(page.locator("#list .day.today .dow.now")).toHaveText("Heute");
  await expect(page.locator("#list h2.month").first()).toHaveText(/\d{4}$/);
  expect(await page.locator("#list .rule-weekend").count()).toBeLessThanOrEqual(1);
  await expect(page.locator("#list .show")).toHaveCount(FIXTURE.upcoming);
});

test("a show link lands on the highlighted, focused row; a second link moves the highlight", async ({
  page,
}) => {
  await openList(page);
  const ids = await page.locator("#list .show").evaluateAll((els) => els.map((e) => e.dataset.id));
  const last = ids[ids.length - 1];
  await page.goto(`/#${shortId(last)}`);
  const row = page.locator(`#list .show[data-id="${last}"]`);
  await expect(row).toHaveClass(/highlight/);
  await expect(row).toBeFocused();
  await expect(row).toBeInViewport();
  await page.waitForTimeout(1200); // venues.web.json re-render + smooth scroll settle
  await expect(row).toHaveClass(/highlight/);

  await page.evaluate((h) => (location.hash = h), shortId(ids[0]));
  await expect(page.locator(`#list .show[data-id="${ids[0]}"]`)).toHaveClass(/highlight/);
  await expect(page.locator("#list .show.highlight")).toHaveCount(1);
});

test("a link to a past show brings the past shows in", async ({ page }) => {
  await openList(page);
  await expect(page.locator("#list .show.past")).toHaveCount(0);
  const past = page.locator("#past-foot");
  await expect(past).toHaveText("↑ 1 vergangene Show anzeigen");
  const id = (await page.evaluate(() => fetch("data/shows.json").then((r) => r.json()))).shows[0].id;
  await page.goto(`/#${shortId(id)}`);
  await expect(page.locator(`#list .show.past[data-id="${id}"]`)).toHaveClass(/highlight/);
  await expect(page.locator(`#list .show[data-id="${id}"] .vorbei`)).toHaveText("vorbei");
  await expect(past).toHaveText("↓ Vergangene ausblenden");
  await past.click();
  await expect(page.locator("#list .show.past")).toHaveCount(0);
});

test("a stale show link says so and leaves the address bar; a skip-link anchor does not", async ({
  page,
}) => {
  await page.goto("/#zzzzzzz");
  await expect(page.locator("#list .show")).toHaveCount(FIXTURE.upcoming);
  await expect(page.locator(".link-note")).toContainText("nicht mehr in der Agenda");
  await expect(page).not.toHaveURL(/#/);
  await page.goto("about:blank");
  await page.goto("/#views"); // a fresh load: the skip-link target is an anchor, no stale show
  await expect(page.locator("#list .show").first()).toBeVisible();
  await expect(page.locator(".link-note")).toBeHidden();
});

test("the coat of arms toggles its canton as a filter", async ({ page }) => {
  await openList(page);
  const badge = page.locator("#list .show .canton").first();
  const code = await badge.getAttribute("data-canton");
  await badge.click();
  await expect(page.locator("#list .show .canton").first()).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#list .show")).toHaveCount(FIXTURE.perCanton[code]);
  await page.locator("#list .show .canton").first().click();
  await expect(page.locator("#list .show")).toHaveCount(FIXTURE.upcoming);
  await expect(page.locator("#list .show .canton").first()).toHaveAttribute("aria-pressed", "false");
});

test("Kalender and Link say what happened next to the icon and in the live region", async ({
  page,
  isMobile,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openList(page);
  const row = page.locator("#list .show").first();
  if (!isMobile) await row.hover();
  const download = page.waitForEvent("download");
  await row.locator('[data-act="cal"]').click();
  expect((await download).suggestedFilename()).toMatch(/\.ics$/);
  await expect(row.locator('[data-act="cal"] .fb')).toHaveText("Gespeichert");
  await expect(row.locator('[data-act="cal"]')).toHaveClass(/fb-on/);
  await expect(page.locator("#feedback")).toHaveText("Gespeichert");
  await expect(row.locator('[data-act="cal"] .fb')).toHaveCount(0); // gone after 1.2 s

  await row.locator('[data-act="link"]').click();
  await expect(row.locator('[data-act="link"] .fb')).toHaveText(/^Kopiert|Link in Adresszeile/);
  await expect(page).toHaveURL(/#[a-z0-9]{5,8}$/);
  await expect(row).not.toHaveClass(/highlight/); // the copy is no landing
});

test.describe("with a granted position", () => {
  test.use({ geolocation: { latitude: 46.9481, longitude: 7.4474 }, permissions: ["geolocation"] });

  test("every row with coordinates shows its distance", async ({ page }) => {
    await openList(page);
    const dist = page.locator("#list .show .dist");
    await expect(dist).toHaveCount(6);
    await expect(dist.first()).toHaveText(/gleich um die Ecke|≈ \d+(\.\d)? km/);
    await expect(page.locator("#list .show .geo-ask")).toHaveCount(0);
  });
});

test("«Distanz & Zug anzeigen» asks for the position only on a tap", async ({ page, context }) => {
  await context.clearPermissions();
  await page.addInitScript(() => {
    window.__geoCalls = 0;
    navigator.geolocation.getCurrentPosition = (ok) => {
      window.__geoCalls++;
      ok({ coords: { latitude: 46.9481, longitude: 7.4474 } });
    };
  });
  await openList(page);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__geoCalls)).toBe(0);
  const row = page.locator("#list .show").first();
  await row.hover();
  await row.locator(".geo-ask").click();
  expect(await page.evaluate(() => window.__geoCalls)).toBe(1);
  await expect(page.locator("#list .show .dist")).toHaveCount(6);
});
