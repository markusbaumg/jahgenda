// Location: with a granted (mocked) position the rows show distances and the Wo panel a radius filter.
const { test, expect } = require("@playwright/test");
const { useFixture, openList, results } = require("./helpers");

// Bern, a few hundred metres from the fixture's Dachstock.
test.use({ geolocation: { latitude: 46.9481, longitude: 7.4474 }, permissions: ["geolocation"] });

test("distances appear and the radius chips filter", async ({ page }) => {
  await useFixture(page);
  await openList(page);
  const dist = page.locator("#list .show .dist");
  await expect(dist.first()).toBeVisible();
  await expect(dist.first()).toHaveText(/gleich ums Eck|≈ \d+(\.\d)? km/);
  expect(await dist.count()).toBe(6); // every fixture show has coordinates
  await expect(page.locator("#toggle-where")).toHaveClass(/located/);
  await expect(page.locator("#toggle-where b")).toBeHidden(); // a known position is not a filter

  await page.click("#toggle-where");
  await expect(page.locator("#geo-status")).toContainText("Nächste Show");
  await expect(page.locator("#geo-status strong")).toHaveText("Roots Night");
  await expect(page.locator("#where-radius")).toBeVisible();

  await page.locator('#where-radius [data-radius="10"]').click();
  await expect(page.locator("#toggle-where b")).toHaveText("≤ 10 km");
  await expect(page.locator("#list .show")).toHaveCount(2); // the two Bern shows
  await expect(results(page)).toHaveText(/^2 Konzerte für diese Auswahl/);

  await page.locator('#where-radius [data-radius="0"]').click();
  await expect(page.locator("#toggle-where b")).toBeHidden();
  await expect(page.locator("#list .show")).toHaveCount(6);
});

test("without permission the rows offer to show the distance", async ({ page, context }) => {
  await context.clearPermissions();
  await useFixture(page);
  await openList(page);
  await expect(page.locator("#list .show .dist")).toHaveCount(0);
});
