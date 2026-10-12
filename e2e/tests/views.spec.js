// Liste | Kalender | Karte: the switch, the calendar grid and the Leaflet map with pins.
const { test, expect } = require("@playwright/test");
const { FIXTURE, useFixture, openList } = require("./helpers");

test.beforeEach(async ({ page }) => {
  await useFixture(page);
  await openList(page);
});

const viewBtn = (page, v) => page.locator(`#view-switch [data-view="${v}"]`);

test("switches to the calendar and back", async ({ page }) => {
  await expect(viewBtn(page, "list")).toHaveAttribute("aria-pressed", "true");
  await viewBtn(page, "calendar").click();
  await expect(viewBtn(page, "calendar")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#calendar")).toBeVisible();
  await expect(page.locator("#list")).toBeHidden();
  await expect(page.locator("#calendar .cal-title")).toHaveText(/\d{4}$/);
  await expect(page.locator("#calendar .cal-dow")).toHaveCount(7);
  await expect(page.locator("#calendar .cal-cell.today")).toHaveCount(1);
  // The show of today sits in the grid (pill on desktop, dot on the phone) and in the day list below.
  await expect(page.locator("#calendar .cal-cell.today .pill")).toHaveCount(1);
  await expect(page.locator("#calendar .cal-day .show")).toHaveCount(1);

  await page.locator('#calendar [data-cal="1"]').click(); // next month
  await expect(page.locator("#calendar .cal-cell.today")).toHaveCount(0);
  await page.locator('#calendar [data-cal="0"]').click(); // Heute
  await expect(page.locator("#calendar .cal-cell.today")).toHaveCount(1);

  await viewBtn(page, "list").click();
  await expect(page.locator("#list .show")).toHaveCount(FIXTURE.upcoming);
  await expect(page.locator("#calendar")).toBeHidden();
});

test("the map loads Leaflet and places pins", async ({ page }) => {
  await viewBtn(page, "map").click();
  await expect(page.locator("#map-view")).toBeVisible();
  await expect(page.locator("#list")).toBeHidden();
  // Leaflet (unpkg) and tiles (OSM) come from the net; give the first load some room.
  await expect(page.locator("#map.leaflet-container")).toBeVisible({ timeout: 20_000 });
  const pins = page.locator("#map .pin-icon");
  expect(await pins.count()).toBeGreaterThan(0);
  await expect(page.locator("#map-rest .map-legend")).toBeVisible();

  // A pin opens a popup listing the venue's shows.
  await pins.first().click();
  await expect(page.locator("#map .leaflet-popup .popup-shows li").first()).toBeVisible();
});

test("the chosen view survives a reload", async ({ page }) => {
  await viewBtn(page, "calendar").click();
  await expect(page.locator("#calendar")).toBeVisible();
  await page.reload();
  await expect(page.locator("#calendar .cal-grid")).toBeVisible();
  await expect(viewBtn(page, "calendar")).toHaveAttribute("aria-pressed", "true");
});
