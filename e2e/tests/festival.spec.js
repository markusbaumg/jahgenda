// Festivals (design/festival-spec.md, story #33 M5): the card with the range date cell and LÄUFT pill,
// «3 Tage», the line-up by day with «Tag offen», the ghost row in a later month, «Line-up folgt» and the
// Festival format chip. A fixture of its own: two festivals and one concert, dates relative to today.
const { test, expect } = require("@playwright/test");
const { results } = require("./helpers");

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const plusDays = (n) => {
  const t = today();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate() + n);
};
// The last day of next month: a festival from there reaches into the month after (a ghost row).
const lastOfNext = () => {
  const t = today();
  return new Date(t.getFullYear(), t.getMonth() + 2, 0);
};
const place = { venue: "Dachstock", city: "Bern", canton: "BE", lat: 46.953, lon: 7.4407 };
const base = { url: "https://example.org/fest", source_url: "https://example.org/lineup", ...place };

function fixture() {
  const runStart = today();
  const later = lastOfNext();
  return [
    {
      ...base,
      id: `${iso(runStart)}-sunsplash-bern`,
      date: iso(runStart),
      end_date: iso(plusDays(2)),
      time: "14:00",
      title: "Sunsplash",
      acts: ["Dub Inc", "Mellow Mood", "Alborosie", "Jah9", "Iration", "Jah Prayzah", "Kabaka Pyramid"],
      days: {
        [iso(runStart)]: ["DUB INC.", "Mellow Mood"],
        [iso(plusDays(1))]: ["Alborosie", "Jah9"],
        [iso(plusDays(2))]: ["Kabaka Pyramid"],
      },
      genres: ["festival", "reggae", "dub"],
    },
    {
      ...base,
      id: `${iso(plusDays(3))}-roots-night-bern`,
      date: iso(plusDays(3)),
      time: "20:30",
      title: "Roots Night",
      acts: ["Roots Night"],
      genres: ["reggae"],
    },
    {
      ...base,
      id: `${iso(later)}-lake-splash-bern`,
      date: iso(later),
      end_date: iso(new Date(later.getFullYear(), later.getMonth(), later.getDate() + 2)),
      title: "Lake Splash",
      acts: [],
      genres: ["festival", "ska"],
    },
  ];
}

test.beforeEach(async ({ page }) => {
  await page.route("**/data/shows.json", (route) =>
    route.fulfill({ json: { updated: new Date().toISOString(), source: "scraper", shows: fixture() } }),
  );
  await page.addInitScript(() => {
    try {
      localStorage.setItem("jahgenda.callout.install", JSON.stringify("forever"));
      localStorage.setItem("jahgenda.callout.subscribe", JSON.stringify("forever"));
    } catch {
      /* private mode */
    }
  });
  await page.goto("/");
  await expect(page.locator("#list .show").first()).toBeVisible();
});

test("a running festival is a card of its own: LÄUFT pill, range datetime, «3 Tage»", async ({ page }) => {
  const [run] = fixture();
  const card = page.locator(`#list section.day.festival:has([id="${run.id}"])`);
  await expect(card).toHaveCount(1);
  await expect(card.locator(".day-shows .show")).toHaveCount(1); // never grouped with the day's shows
  const cell = card.locator("time.date");
  await expect(cell).toHaveAttribute("datetime", `${run.date}/${run.end_date}`);
  await expect(cell).toHaveAttribute("aria-label", /^Läuft, .+ bis .+$/);
  await expect(cell.locator(".dow.now.live")).toHaveText("Läuft");
  await expect(card.locator(".meta .ndays")).toHaveText("3 Tage");
  await expect(card.locator(".show")).toHaveClass(/\bfestival\b/);
  // Festivals are counted apart from the concerts.
  await expect(results(page)).toHaveText(/^1 Show · 2 Festivals · /);
});

test("the line-up opens by day with «Tag offen» and closes again", async ({ page }) => {
  const [run] = fixture();
  const lineup = page.locator(`[id="${run.id}"] details.lineup`);
  const summary = lineup.locator("summary");
  await expect(summary).toHaveAttribute("title", "Alle 7 Acts nach Tag");
  await expect(page.locator(`[id="${run.id}"] .acts > span`)).toHaveCount(4); // the first 4, the rest folded
  await expect(lineup).not.toHaveAttribute("open", "");
  await summary.click();
  await expect(lineup).toHaveAttribute("open", "");
  await expect(lineup).toHaveClass(/\bis-open\b/);
  const labels = lineup.locator(".days .d");
  await expect(labels).toHaveCount(4);
  await expect(labels.last()).toHaveText("Tag offen");
  // «DUB INC.» in days matches «Dub Inc» in acts; Iration and Jah Prayzah sit in no day.
  await expect(lineup.locator(".days .a").last().locator("span")).toHaveText(["Iration", "Jah Prayzah"]);
  await expect(summary.locator(".close")).toBeVisible();
  await summary.click();
  await expect(lineup).not.toHaveAttribute("open", "");
  await expect(lineup).not.toHaveClass(/\bis-open\b/);
});

test("a search hit inside the line-up opens it and marks the act", async ({ page }) => {
  const [run] = fixture();
  await page.fill("#q", "prayzah");
  const lineup = page.locator(`[id="${run.id}"] details.lineup`);
  await expect(lineup).toHaveAttribute("open", "");
  await expect(lineup.locator("mark")).toHaveText("Prayzah");
});

test("a festival over a month boundary leaves a ghost row; without acts it says «Line-up folgt»", async ({
  page,
}) => {
  const later = fixture()[2];
  const card = page.locator(`#list section.day.festival:has([id="${later.id}"])`);
  await expect(card.locator(".num.range")).toHaveText(String(Number(later.date.slice(8))));
  await expect(card.locator(".day-end")).toHaveText(/^–\d+\.\d+\.$/);
  await expect(card.locator(".acts.none")).toHaveText("Line-up folgt");
  // (Sunsplash, from today, may reach into next month too – the Lake Splash ghost is the one under test.)
  const ghost = page.locator("#list .ghost a", { hasText: "Lake Splash" });
  await expect(ghost).toHaveCount(1);
  await expect(ghost).toHaveText(/^↳ Lake Splash läuft noch bis \S+\s\d+\.\s\S+$/);
  // The ghost sits in the following month, which only exists because of it.
  const lastMonth = page.locator("#list > section").last();
  await expect(lastMonth.locator(".ghost")).toHaveCount(1);
  await expect(lastMonth.locator(".day")).toHaveCount(0);
  await ghost.click();
  await expect(page).toHaveURL(/#[0-9a-z]+$/);
});

test("the Festival format chip filters to the festivals and back", async ({ page }) => {
  const chip = page.locator('#formats .chip[data-format="festival"]');
  await expect(chip).toHaveCount(1);
  await expect(chip.locator("small")).toHaveText(", 2 Shows");
  await expect(chip).toHaveAttribute("title", "Nur Festivals anzeigen (2)");
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#list .show")).toHaveCount(2);
  await expect(page.locator("#list .show:not(.festival)")).toHaveCount(0);
  // The format is not repeated as a genre word in the meta line.
  await expect(page.locator("#list .meta .genre", { hasText: /^Festival$/ })).toHaveCount(0);
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#list .show")).toHaveCount(3);
});
