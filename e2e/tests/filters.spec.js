// The filter state lives in the URL: a filtered view survives a reload, can be bookmarked and sent as
// a link; show links and list links keep the hash for themselves.
const { test, expect } = require("@playwright/test");
const { FIXTURE, useFixture, openList, results } = require("./helpers");

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("filters are written to the hash and restored after a reload", async ({ page }) => {
  await useFixture(page);
  await openList(page);
  await page.click("#toggle-where");
  await page.locator('#canton-chips .chip[data-canton="ZH"]').click();
  await page.keyboard.press("Escape");
  await page.locator('#genres .chip[data-genre="ska"]').click();
  await page.click("#toggle-when");
  await page.locator('#when-panel [data-quick="7"]').click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#g=ska&wo=ZH&wann=7$/);
  await expect(page.locator("#list .show")).toHaveCount(0); // Ska Fiesta is in LU, Next Month Ska is later
  await page.fill("#q", "fiesta");
  await expect(page).toHaveURL(/#q=fiesta&g=ska&wo=ZH&wann=7$/);
  await expect(page.locator("#share-filters")).toBeVisible();

  await page.reload();
  await expect(page.locator("#q")).toHaveValue("fiesta");
  await expect(page.locator('#genres .chip[data-genre="ska"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#toggle-where b")).toHaveText("ZH");
  await expect(page.locator("#toggle-when b")).toHaveText("7 Tage"); // the badge names the quick pick
  // The empty state names every active dimension («Kein Ska in Zürich in den nächsten 7 Tagen zu «fiesta»»).
  await expect(page.locator("#status .big")).toHaveText(/^Kein Ska in Zürich .*7 Tagen zu «fiesta»$/);

  await page.click("#status #reset"); // «Alles zurücksetzen» (offered from two filters on)
  await expect(page).not.toHaveURL(/#/);
  await expect(page.locator("#list .show")).toHaveCount(FIXTURE.upcoming);
  await expect(page.locator("#share-filters")).toBeHidden();
});

test("a filter link opens filtered; «Link zu dieser Auswahl» copies it", async ({ page, isMobile }) => {
  await useFixture(page);
  await page.goto("/#wo=BE,LU&g=reggae");
  await expect(page.locator("#list .show")).toHaveCount(2); // Roots Night + Next Month Reggae
  await expect(results(page)).toHaveText(/^2 Konzerte für diese Auswahl/);
  await expect(page.locator("#toggle-where b")).toHaveText("BE · LU");
  const share = page.locator("#share-filters");
  await share.click();
  await expect(share.locator("span")).toHaveText(/^Kopiert|Link in Adresszeile/);
  const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  if (copied) expect(copied).toMatch(/#g=reggae&wo=BE,LU$/);

  // A show link copied from a row keeps its hash; the filters come back into the URL on the next change.
  // The actions line is inline on every width (icon-only 44 px targets on the phone, see phone.spec.js).
  const row = page.locator("#list .show").first();
  if (!isMobile) await row.hover();
  await row.locator('[data-act="link"]').click();
  await expect(page).toHaveURL(/#[a-z0-9]{5,8}$/);
  await page.locator('#genres .chip[data-genre=""]').click();
  await expect(page).toHaveURL(/#wo=BE,LU$/);
});

test("the view switch writes #view=…, Liste removes it, and a reload keeps the view", async ({ page }) => {
  await useFixture(page);
  await openList(page);
  await page.locator('#view-switch [data-view="calendar"]').click();
  await expect(page).toHaveURL(/#view=calendar$/);
  await page.locator('#genres .chip[data-genre="ska"]').click();
  await expect(page).toHaveURL(/#g=ska&view=calendar$/); // a filter keeps the view in the hash
  await page.reload();
  await expect(page.locator("#calendar .cal-grid")).toBeVisible();
  await expect(page.locator('#view-switch [data-view="calendar"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('#genres .chip[data-genre="ska"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator('#view-switch [data-view="list"]').click();
  await expect(page).toHaveURL(/#g=ska$/);
  await expect(page.locator("#list .show")).toHaveCount(FIXTURE.ska);
});

test("a filter link arriving on the open page is applied, and the plain address starts afresh", async ({
  page,
}) => {
  await useFixture(page);
  await page.goto("/#g=reggae&wo=ZH");
  await expect(page.locator("#list .show")).toHaveCount(1); // Rocksteady Social
  // A bookmark or a friend's «Link zu dieser Auswahl» tapped in this tab: a fragment navigation.
  await page.evaluate(() => {
    location.hash = "#g=ska";
  });
  await expect(page).toHaveURL(/#g=ska$/); // not written back to the old filters
  await expect(page.locator("#list .show")).toHaveCount(FIXTURE.ska);
  await expect(page.locator('#genres .chip[data-genre="ska"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#toggle-where b")).toBeHidden(); // the canton went with the old hash
  await page.reload();
  await expect(page.locator("#list .show")).toHaveCount(FIXTURE.ska);
  // The plain address (an empty fragment) resets the filters like a fresh load.
  await page.evaluate(() => {
    location.hash = "";
  });
  await expect(page).not.toHaveURL(/#./);
  await expect(page.locator("#list .show")).toHaveCount(FIXTURE.upcoming);
  await expect(page.locator('#genres .chip[data-genre=""]')).toHaveAttribute("aria-pressed", "true");
  // A view in the arriving hash is applied too.
  await page.evaluate(() => {
    location.hash = "#view=calendar";
  });
  await expect(page.locator("#calendar .cal-grid")).toBeVisible();
  await expect(page).toHaveURL(/#view=calendar$/);
});
