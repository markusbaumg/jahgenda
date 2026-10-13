// Shared helpers: a deterministic show fixture (served instead of data/shows.json, dates relative to
// today, so no test depends on what the scraper found) and a console-error collector.
const { expect } = require("@playwright/test");

const DAY = 86_400_000;
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const plusDays = (n) => new Date(today().getTime() + n * DAY);
// A day in next month, so the histogram always has a second month with a bar.
const nextMonth = (day) => {
  const t = today();
  return new Date(t.getFullYear(), t.getMonth() + 1, day);
};
// The month key the page uses for its histogram bars ("YYYY-M", no padding).
const monthKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}`;

const VENUES = {
  Dachstock: { city: "Bern", canton: "BE", lat: 46.953, lon: 7.4407 },
  "Rote Fabrik": { city: "Zürich", canton: "ZH", lat: 47.3426, lon: 8.5364 },
  Kaufleuten: { city: "Zürich", canton: "ZH", lat: 47.3708, lon: 8.5376 },
  Schüür: { city: "Luzern", canton: "LU", lat: 47.0432, lon: 8.3146 },
  KIFF: { city: "Aarau", canton: "AG", lat: 47.3935, lon: 8.0548 },
};

function show(date, title, venue, genres, time = "20:30") {
  const v = VENUES[venue];
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    id: `${iso(date)}-${slug}-${v.city.toLowerCase().replace(/ü/g, "u")}`,
    date: iso(date),
    time,
    title,
    acts: [title],
    venue,
    city: v.city,
    canton: v.canton,
    lat: v.lat,
    lon: v.lon,
    url: "https://example.org/event",
    source_url: "https://example.org/agenda",
    genres,
  };
}

// 6 upcoming shows (ZH 3, BE 2, LU 1; exactly one today; two in next month) + 1 past show (AG).
function fixtureShows() {
  return [
    show(plusDays(-5), "Vergangene Show", "KIFF", ["dancehall"]),
    show(plusDays(0), "Roots Night", "Dachstock", ["reggae", "roots"]),
    show(plusDays(3), "Dub Station", "Rote Fabrik", ["dub", "soundsystem"], "22:00"),
    show(plusDays(10), "Ska Fiesta", "Schüür", ["ska"]),
    show(plusDays(12), "Rocksteady Social", "Kaufleuten", ["rocksteady", "reggae"]),
    show(nextMonth(9), "Next Month Reggae", "Dachstock", ["reggae"]),
    show(nextMonth(14), "Next Month Ska", "Rote Fabrik", ["ska"]),
  ];
}
const FIXTURE = {
  upcoming: 6,
  perCanton: { ZH: 3, BE: 2, LU: 1 },
  ska: 2,
  nextMonthKey: monthKey(nextMonth(9)),
};

// Serve the fixture instead of the real data and silence the install/subscribe callouts, which
// would otherwise cover the bottom of the phone viewport.
async function useFixture(page, { callouts = false } = {}) {
  await page.route("**/data/shows.json", (route) =>
    route.fulfill({
      json: { updated: new Date().toISOString(), source: "scraper", shows: fixtureShows() },
    }),
  );
  if (callouts) return;
  await page.addInitScript(() => {
    try {
      localStorage.setItem("jahgenda.callout.install", JSON.stringify("forever"));
      localStorage.setItem("jahgenda.callout.subscribe", JSON.stringify("forever"));
    } catch {
      /* private mode */
    }
  });
}

async function openList(page) {
  await page.goto("/");
  await expect(page.locator("#list .show").first()).toBeVisible();
}

// Collect uncaught exceptions and console errors. Failed loads of off-origin resources (OSM tiles,
// GitHub raw files on the owners' page) are not the page's fault and are ignored.
function watchErrors(page, origin) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const url = m.location().url || "";
    if (url && origin && !url.startsWith(origin)) return;
    errors.push(`console: ${m.text()}`);
  });
  return errors;
}

const results = (page) => page.locator("#results-text");

// The count on a chip («Ska 2») carries its unit as screen-reader text (", 2 Shows"), so the
// accessible name still contains the visible words. Matches the whole <small>.
const chipCount = (n) => new RegExp(`^, ${n} Show${n === 1 ? "" : "s"}$`);
// The active-filter pill of one dimension (q, genre, format, canton, radius, month, range) on the results row.
const pill = (page, kind, value) =>
  page.locator(`#results .fpill[data-remove="${kind}"]${value ? `[data-value="${value}"]` : ""}`);

// A chip in the genre row. The row scrolls sideways with scroll-behavior: smooth and scroll-snap, and
// Playwright's own scroll-into-view races that animation: on CI's wider fonts the click landed between
// two chips while the row was still moving (a11y.spec, 2026-10-13). Scroll instantly, let the snap
// settle for two frames, then click like a user.
async function clickChip(page, selector) {
  const chip = page.locator(selector);
  await chip.evaluate((el) =>
    el.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "instant" }),
  );
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await chip.click();
}

module.exports = { FIXTURE, useFixture, openList, watchErrors, results, chipCount, pill, clickChip };
