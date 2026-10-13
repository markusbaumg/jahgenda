// Every page loads without an uncaught error or console error – index.html with the real data, and the
// Mischpult (the owners' hidden console, mischpult.html: Status, Läufe, Aussortiert, Quellen & Venues,
// Prompt & Regeln, Genres) with a fixed run log; log.html and review.html are redirects into it.
const { test, expect } = require("@playwright/test");
const { watchErrors } = require("./helpers");

const settle = (page) => page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

test("index.html: no console errors with the real data", async ({ page, baseURL }) => {
  const errors = watchErrors(page, baseURL);
  await page.goto("/");
  await expect(page.locator("#list .show, #status .big").first()).toBeVisible();
  await expect(page.locator("#genres .chip").first()).toHaveText("Alle");
  await settle(page);
  // Exercise the interactive bits once, still watching the console.
  await page.fill("#q", "a");
  await page.click("#toggle-where");
  await page.click("#toggle-when");
  await page.keyboard.press("Escape");
  await page.locator('#view-switch [data-view="calendar"]').click();
  await expect(page.locator("#calendar .cal-grid")).toBeVisible();
  expect(errors).toEqual([]);
});

// ---- Mischpult -------------------------------------------------------------------------------------

const HOUR = 3600e3;
const ago = (h) => new Date(Date.now() - h * HOUR).toISOString();
const TABS = ["status", "laeufe", "aussortiert", "quellen", "prompt", "genres"];

// Two runs: the newer one dropped «Dub Inc» with all fields, the older one the same candidate as prose –
// the console lists it once («in 2 Läufen»), like the weekly quality issue.
const DUB_INC = {
  title: "Dub Inc",
  date: "2027-03-18",
  venue: "Bierhübeli",
  city: "Bern",
  url: "https://example.org/dub-inc",
  why: "Abgesagt",
};
// `shift` hours older (the stale case moves the whole log back).
const runsFixture = (shift = 0) => ({
  runs: [
    {
      skill: "scrape-shows",
      at: ago(2 + shift),
      runner: "cloud",
      added: 1,
      updated: 0,
      removed: 0,
      total: 7,
      failed_sources: ["https://skalender.net/ (ENOTFOUND)"],
      dropped: [
        DUB_INC,
        { title: "Santrofi", date: "2026-10-30", venue: "Kuppel", city: "Basel", why: "Afrobeat" },
      ],
      notes: ["Testnotiz vom Lauf"],
      sources: [
        { name: "Petzi", url: "https://example.org/petzi", status: "ok", found: 5, kept: 3 },
        {
          name: "Skalender",
          url: "https://example.org/ska",
          status: "failed",
          found: 0,
          kept: 0,
          error: "ENOTFOUND",
        },
      ],
    },
    {
      skill: "scrape-shows",
      at: ago(26 + shift),
      runner: "local",
      total: 6,
      dropped: [{ title: "Dub Inc @ Bierhübeli Bern 18.03.2027", why: "abgesagt" }],
    },
  ],
});
const statusFixture = (over = {}) => ({
  ok: true,
  skill: "scrape-shows",
  at: ago(2),
  runner: "cloud",
  counts: { added: 1, updated: 0, removed: 0, total: 7 },
  failed_sources: 1,
  ...over,
});

// The console's files: a fixed run log and heartbeat, the GitHub files answered locally (no network).
async function useConsoleFixture(page, { status = statusFixture(), showsAt = ago(2), shift = 0 } = {}) {
  await page.route("**/data/runs.json", (route) => route.fulfill({ json: runsFixture(shift) }));
  await page.route("**/data/status.json", (route) => route.fulfill({ json: status }));
  await page.route("**/data/shows.json", (route) =>
    route.fulfill({ json: { updated: showsAt, source: "scraper", shows: [{ id: "x" }] } }),
  );
  await page.route("https://raw.githubusercontent.com/**", (route) => {
    const url = route.request().url();
    if (url.endsWith("sources.json"))
      return route.fulfill({
        json: {
          agendas: [{ name: "Testportal", url: "https://example.org/portal", hint: "Hinweis" }],
          festivals: [{ name: "Testfestival", where: "Bern", url: "https://example.org/fest" }],
          search_queries: ["reggae schweiz"],
          nearby: { note: "Grenznah", search_queries: ["reggae konstanz"] },
        },
      });
    return route.fulfill({
      body: `# ${url.split("/").pop()}\n\n- **Regel** eins\n`,
      contentType: "text/plain",
    });
  });
}

const tab = (page, id) => page.locator(`#tab-${id}`);
const panel = (page, id) => page.locator(`#panel-${id}`);
async function expectTab(page, id) {
  await expect(tab(page, id)).toHaveAttribute("aria-selected", "true");
  await expect(panel(page, id)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/mischpult\\.html#${id}$`));
  for (const other of TABS.filter((t) => t !== id))
    await expect(tab(page, other)).toHaveAttribute("aria-selected", "false");
}

test("mischpult.html: every tab loads without console errors", async ({ page, baseURL }) => {
  await useConsoleFixture(page);
  const errors = watchErrors(page, baseURL);
  await page.goto("/mischpult.html");
  await expect(page).toHaveTitle(/^Mischpult · Jahgenda$/);
  await expectTab(page, "status");
  // What each tab shows once it is open (the GitHub files are the fixture's).
  const content = {
    status: (p) => p.locator(".mp-verdict"),
    laeufe: (p) => p.locator("details.mp-run").first(),
    aussortiert: (p) => p.locator(".mp-rv").first(),
    quellen: (p) => p.getByText("Testportal"),
    prompt: (p) => p.locator(".mp-md strong").first(),
    genres: (p) => p.locator("tbody tr").first(),
  };
  for (const id of TABS) {
    await tab(page, id).click();
    await expectTab(page, id);
    await expect(content[id](panel(page, id))).toBeVisible();
    // Wide tables scroll inside their box; the page itself never scrolls sideways (also on the phone).
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      id,
    ).toBeLessThanOrEqual(0);
  }
  await settle(page);
  expect(errors).toEqual([]);
});

test("Mischpult: the hash picks the tab, old anchors land on their tab, the keyboard moves along", async ({
  page,
}) => {
  await useConsoleFixture(page);
  await page.goto("/mischpult.html#aussortiert");
  await expectTab(page, "aussortiert");
  // An anchor of the old one-page Mischpult is rewritten to its tab.
  await page.goto("/mischpult.html#venues");
  await expectTab(page, "quellen");
  await page.goto("/mischpult.html#gibtsnicht");
  await expectTab(page, "status");

  // Tablist keys: arrows wrap, Home / End jump; focus follows the selection.
  await tab(page, "status").focus();
  await page.keyboard.press("ArrowRight");
  await expectTab(page, "laeufe");
  await expect(tab(page, "laeufe")).toBeFocused();
  await page.keyboard.press("End");
  await expectTab(page, "genres");
  await page.keyboard.press("ArrowRight");
  await expectTab(page, "status");
  await page.keyboard.press("ArrowLeft");
  await expectTab(page, "genres");
  await page.keyboard.press("Home");
  await expectTab(page, "status");
  await expect(tab(page, "status")).toHaveAttribute("tabindex", "0");
  await expect(tab(page, "genres")).toHaveAttribute("tabindex", "-1");

  // A click is a history step: Back returns to the tab before.
  await tab(page, "prompt").click();
  await expectTab(page, "prompt");
  await page.goBack();
  await expectTab(page, "status");
});

test("Mischpult status: green when fresh and ok, red on ok:false or older than 36 h", async ({ page }) => {
  await useConsoleFixture(page);
  await page.goto("/mischpult.html#status");
  const verdict = page.locator(".mp-verdict");
  await expect(verdict).toHaveAttribute("data-healthy", "true");
  await expect(verdict).toContainText("Alles im grünen Bereich");
  await expect(panel(page, "status")).toContainText("Cloud-Routine");
  await expect(panel(page, "status").locator('a[href*="label%3Ascraper-failed"]')).toHaveCount(1);
  await expect(panel(page, "status").locator('a[href="https://claude.ai/code/routines"]')).toHaveCount(1);

  await page.unrouteAll();
  await useConsoleFixture(page, { status: statusFixture({ ok: false, error: "ENOTFOUND im Test" }) });
  await page.reload();
  await expect(verdict).toHaveAttribute("data-healthy", "false");
  await expect(verdict).toContainText("ENOTFOUND im Test");

  await page.unrouteAll();
  // Stale = the newest of status.json, runs.json and shows.json is older than 36 h (as the watchdog says).
  await useConsoleFixture(page, { status: statusFixture({ at: ago(40) }), showsAt: ago(40), shift: 38 });
  await page.reload();
  await expect(verdict).toHaveAttribute("data-healthy", "false");
  await expect(verdict).toContainText("Daten veraltet");
});

test("Mischpult Läufe: newest first, collapsible, with the sources table and the notes", async ({ page }) => {
  await useConsoleFixture(page);
  await page.goto("/mischpult.html#laeufe");
  const runs = panel(page, "laeufe").locator("details.mp-run");
  await expect(runs).toHaveCount(2);
  await expect(runs.nth(0)).toHaveAttribute("open", "");
  await expect(runs.nth(1)).not.toHaveAttribute("open", "");
  await expect(runs.nth(0).locator("summary")).toContainText("Cloud-Routine");
  await expect(runs.nth(0).locator("summary")).toContainText("+1 neu");
  await expect(runs.nth(0).locator("tr.st-failed")).toContainText("nicht erreichbar – ENOTFOUND");
  await expect(runs.nth(0).locator("tr.st-ok td").nth(2)).toHaveText("5");
  await expect(runs.nth(0)).toContainText("Testnotiz vom Lauf");
  await runs.nth(1).locator("summary").click();
  await expect(runs.nth(1)).toHaveAttribute("open", "");
  await expect(runs.nth(1)).toContainText("Mac (lokal)");
});

test("Mischpult Aussortiert: one entry per candidate, «Gehört rein» opens a prefilled quality issue", async ({
  page,
}) => {
  await useConsoleFixture(page);
  await page.goto("/mischpult.html#aussortiert");
  const items = panel(page, "aussortiert").locator(".mp-rv");
  await expect(items).toHaveCount(2);
  const dub = items.filter({ hasText: "Dub Inc" });
  await expect(dub).toHaveCount(1);
  await expect(dub).toContainText("in 2 Läufen");
  await expect(dub).toContainText("Bierhübeli · Bern");
  await expect(dub.locator("h4 a")).toHaveAttribute("href", DUB_INC.url);

  const flag = dub.getByRole("link", { name: "Gehört rein" });
  await expect(flag).toHaveAttribute("target", "_blank");
  const href = new URL(await flag.getAttribute("href"));
  expect(href.origin + href.pathname).toBe("https://github.com/markusbaumg/jahgenda/issues/new");
  expect(href.searchParams.get("labels")).toBe("quality,scraper");
  expect(href.searchParams.get("title")).toBe("Gehört rein: Dub Inc (2027-03-18)");
  expect(href.searchParams.get("body")).toContain("**Venue:** Bierhübeli, Bern");
  expect(href.searchParams.get("body")).toContain("**Scraper-Begründung:** Abgesagt");

  // Every run on its own: the older run's prose entry shows up again.
  await panel(page, "aussortiert").getByLabel("Jeden Lauf einzeln zeigen").check();
  await expect(items).toHaveCount(3);
  await expect(panel(page, "aussortiert").locator(".mp-run-head")).toHaveCount(2);
});

test("log.html and review.html redirect to their Mischpult tab", async ({ page, baseURL }) => {
  await useConsoleFixture(page);
  const errors = watchErrors(page, baseURL);
  await page.goto("/log.html");
  await expectTab(page, "laeufe");
  await page.goto("/review.html");
  await expectTab(page, "aussortiert");
  await settle(page);
  expect(errors).toEqual([]);
});

test("the hidden Mischpult: not linked from the agenda, noindex, not in robots.txt or the worker", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.locator("#list .show, #status .big").first()).toBeVisible();
  await expect(page.locator('a[href*="mischpult"]')).toHaveCount(0);
  expect(await page.content()).not.toContain("mischpult");
  await page.goto("/mischpult.html");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  for (const file of ["/robots.txt", "/sw.js"])
    expect(await (await request.get(file)).text(), file).not.toContain("mischpult");
});
