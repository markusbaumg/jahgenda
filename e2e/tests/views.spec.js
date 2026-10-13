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
  const clusters = page.locator("#map .cluster-icon");
  expect((await pins.count()) + (await clusters.count())).toBeGreaterThan(0);
  await expect(page.locator("#map-rest .map-legend")).toBeVisible();

  // Pins that would sit on top of each other at this zoom are one cluster badge: named, and a tap
  // zooms into that group until the pins come apart (every pin is reachable with a thumb).
  for (let i = 0; i < 6 && (await clusters.count()); i++) {
    await expect(clusters.first()).toHaveAttribute("aria-label", /^\d+ Clubs mit \d+ Shows: hineinzoomen$/);
    const before = (await pins.count()) + (await clusters.count());
    await clusters.first().click();
    await expect.poll(async () => (await pins.count()) + (await clusters.count())).toBeGreaterThan(before);
  }
  expect(await pins.count()).toBeGreaterThan(0);
  // Nothing covers a pin's head or a badge: every one of them is hit at its centre.
  expect(
    await page.evaluate(() => {
      const map = document.getElementById("map").getBoundingClientRect();
      return [...document.querySelectorAll("#map .pin-icon, #map .cluster-icon")]
        .filter((e) => {
          const b = e.getBoundingClientRect();
          return b.top >= map.top && b.bottom <= map.bottom && b.top >= 0 && b.bottom <= innerHeight;
        })
        .map((e) => {
          const b = e.getBoundingClientRect();
          const t = document.elementFromPoint(
            b.left + b.width / 2,
            b.top + (e.classList.contains("pin-icon") ? 12 : 20),
          );
          return t === e || e.contains(t);
        })
        .every(Boolean);
    }),
  ).toBe(true);

  // Every pin is named after its venue (not after the count badge Leaflet would read out).
  await expect(pins.first()).toHaveAttribute("aria-label", /^[^,]+, [^:]+: \d Shows? anzeigen$/);
  await expect(page.locator("#map")).toHaveAttribute("role", "region");

  // A pin opens a popup listing the venue's shows; from the keyboard the focus lands in the popup,
  // Escape closes it and the pin has the focus again. (A pin inside the frame: the zoom into a cluster
  // above may have left others outside it.)
  const pin = pins.nth(
    await page.evaluate(() => {
      const m = document.getElementById("map").getBoundingClientRect();
      return [...document.querySelectorAll("#map .pin-icon")].findIndex((e) => {
        const b = e.getBoundingClientRect();
        return b.top >= m.top && b.bottom <= m.bottom && b.left >= m.left && b.right <= m.right;
      });
    }),
  );
  await pin.click();
  await expect(page.locator("#map .leaflet-popup .popup-shows li").first()).toBeVisible();
  await expect(page.locator("#map .leaflet-popup-close-button")).toHaveAttribute("aria-label", "Schliessen");
  // The popup fits the frame, × and all (it was clipped at the frame's right edge on narrow phones).
  const frame = await page.locator("#map").boundingBox();
  const wrap = await page.locator("#map .leaflet-popup-content-wrapper").boundingBox();
  const close = await page.locator("#map .leaflet-popup-close-button").boundingBox();
  expect(wrap.x).toBeGreaterThanOrEqual(frame.x);
  expect(wrap.x + wrap.width).toBeLessThanOrEqual(frame.x + frame.width);
  expect(close.x + close.width).toBeLessThanOrEqual(frame.x + frame.width);
  expect(close.width).toBeGreaterThanOrEqual(40);
  await page.keyboard.press("Escape");
  await expect(page.locator("#map .leaflet-popup")).toHaveCount(0);
  await pin.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#map .leaflet-popup")).toBeVisible();
  expect(await page.evaluate(() => document.activeElement.closest(".leaflet-popup") !== null)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator("#map .leaflet-popup")).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement.classList.contains("pin-icon"))).toBe(true);
  await expect(page.locator("#map .leaflet-control-attribution a").first()).toHaveAttribute(
    "title",
    "Leaflet-Website öffnen",
  );
});

test("the chosen view survives a reload", async ({ page }) => {
  await viewBtn(page, "calendar").click();
  await expect(page.locator("#calendar")).toBeVisible();
  await page.reload();
  await expect(page.locator("#calendar .cal-grid")).toBeVisible();
  await expect(viewBtn(page, "calendar")).toHaveAttribute("aria-pressed", "true");
});
