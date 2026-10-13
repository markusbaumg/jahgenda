// Languages (story #48): German by default, French / English from the browser on the first visit, the
// DE · FR · EN switch (remembered in jahStore «lang»), <html lang> and the hreflang alternates, and no raw
// message key on screen in any language.
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { FIXTURE, useFixture, openList, watchErrors } = require("./helpers");

// Every key of the German table (the source of truth for fr / en), read from the file itself.
const DE_KEYS = (() => {
  const src = fs.readFileSync(path.join(__dirname, "../../src/i18n/de.js"), "utf8");
  return [...src.matchAll(/^\s+"?([\w.]+)"?:/gm)].map((m) => m[1]).filter((k) => k.includes("."));
})();

// A key as a word of its own («row.link»), not inside a URL or file name.
const KEY_RES = DE_KEYS.map((k) => new RegExp(`(^|[^\\w.])${k.replace(/\./g, "\\.")}($|[^\\w.])`));

const toolbarWords = (page) => [
  page.locator("#toggle-where .icon-word"),
  page.locator("#toggle-when .icon-word"),
];

// Every text a visitor reads or hears: text nodes, titles, aria-labels, placeholders, alt texts.
async function visibleStrings(page) {
  return page.evaluate(() => {
    const out = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      const n = walk.currentNode;
      if (n.parentElement.closest("script, style")) continue;
      const t = n.textContent.trim();
      if (t) out.push(t);
    }
    for (const el of document.querySelectorAll("[title], [aria-label], [placeholder], [alt]"))
      for (const a of ["title", "aria-label", "placeholder", "alt"]) {
        const v = el.getAttribute(a);
        if (v) out.push(v);
      }
    out.push(document.title);
    return out;
  });
}

async function expectNoRawKeys(page) {
  const strings = await visibleStrings(page);
  const raw = strings.filter((s) => KEY_RES.some((re) => re.test(s)));
  expect(raw, "message keys rendered instead of text").toEqual([]);
}

test.describe("first visit", () => {
  test.beforeEach(async ({ page }) => {
    await useFixture(page);
  });

  test("German by default (de-CH browser): lang, toolbar, switch", async ({ page }) => {
    await openList(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "de-CH");
    const [wo, wann] = toolbarWords(page);
    await expect(wo).toHaveText("Wo");
    await expect(wann).toHaveText("Wann");
    await expect(page.locator('.lang-switch [data-lang="de"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#about-title")).toHaveText("Über Jahgenda");
    await expect(page).toHaveTitle("Jahgenda · Reggae-Shows in der Schweiz");
  });

  test.describe("a French browser", () => {
    test.use({ locale: "fr-CH" });
    test("gets French", async ({ page }) => {
      await openList(page);
      await expect(page.locator("html")).toHaveAttribute("lang", "fr-CH");
      const [wo, wann] = toolbarWords(page);
      await expect(wo).toHaveText("Où");
      await expect(wann).toHaveText("Quand");
      await expect(page.locator("#q")).toHaveAttribute("placeholder", "Groupe, club, lieu …");
      await expect(page.locator("#results-count")).toHaveText(`${FIXTURE.upcoming} concerts`);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        "content",
        "Les prochains concerts reggae, dub et ska en Suisse.",
      );
      // The tagline is one of the French lines.
      const lines = JSON.parse(fs.readFileSync(path.join(__dirname, "../../data/slogans.json"), "utf8")).fr;
      expect(lines).toContain(await page.locator("#tagline").textContent());
    });

    test("keeps German once the visitor chose it", async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem("jahgenda.lang", JSON.stringify("de")));
      await openList(page);
      await expect(page.locator("html")).toHaveAttribute("lang", "de-CH");
      await expect(toolbarWords(page)[0]).toHaveText("Wo");
    });
  });

  test.describe("an English browser", () => {
    test.use({ locale: "en-GB" });
    test("gets English", async ({ page }) => {
      await openList(page);
      await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
      const [wo, wann] = toolbarWords(page);
      await expect(wo).toHaveText("Where");
      await expect(wann).toHaveText("When");
      await expect(page).toHaveTitle("Jahgenda · Reggae shows in Switzerland");
    });
  });
});

test("the switch changes toolbar, empty state and About, and survives a reload", async ({
  page,
  baseURL,
}) => {
  await useFixture(page);
  const errors = watchErrors(page, baseURL);
  await openList(page);
  await page.click('.lang-switch [data-lang="fr"]');
  await expect(page.locator('.lang-switch [data-lang="fr"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr-CH");
  await expect(toolbarWords(page)[0]).toHaveText("Où");
  await expect(page.locator("#about-title")).toHaveText("À propos de Jahgenda");
  await expect(page.locator("#results-text")).toHaveText(/^6 concerts · /);

  // The empty state speaks French too (and its offer to remove the search).
  await page.fill("#q", "zzzz");
  await expect(page.locator("#status .big")).toHaveText("Rien pour « zzzz »");
  await expect(page.locator('#status .fix[data-remove="q"]')).toContainText("Retirer « zzzz »");
  await page.fill("#q", "");
  await expect(page.locator("#list .show").first()).toBeVisible();

  // Remembered: a reload (with the browser still saying de-CH) stays French; the URL has no language.
  expect(new URL(page.url()).search).toBe("");
  await page.reload();
  await expect(page.locator("#list .show").first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr-CH");
  await expect(page.locator("#about-title")).toHaveText("À propos de Jahgenda");
  expect(await page.evaluate(() => localStorage.getItem("jahgenda.lang"))).toBe('"fr"');

  // And back to English, then German: the words follow at once.
  await page.click('.lang-switch [data-lang="en"]');
  await expect(toolbarWords(page)[1]).toHaveText("When");
  await page.click('.lang-switch [data-lang="de"]');
  await expect(toolbarWords(page)[1]).toHaveText("Wann");
  await expect(page.locator("#about-title")).toHaveText("Über Jahgenda");
  expect(errors).toEqual([]);
});

test("hreflang alternates, ?lang= and the canonical", async ({ page }) => {
  await useFixture(page);
  await openList(page);
  const alt = page.locator('link[rel="alternate"][hreflang]');
  await expect(alt).toHaveCount(4);
  const langs = await alt.evaluateAll((els) => els.map((e) => `${e.hreflang} ${e.getAttribute("href")}`));
  expect(langs).toEqual([
    "de https://markusbaumg.github.io/jahgenda/",
    "fr https://markusbaumg.github.io/jahgenda/?lang=fr",
    "en https://markusbaumg.github.io/jahgenda/?lang=en",
    "x-default https://markusbaumg.github.io/jahgenda/",
  ]);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://markusbaumg.github.io/jahgenda/",
  );

  // ?lang=en (an hreflang alternate) wins over the de-CH browser; the hash scheme is the same.
  await page.goto("/?lang=en#wo=ZH");
  await expect(page.locator("#list .show").first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://markusbaumg.github.io/jahgenda/?lang=en",
  );
  await expect(page.locator("#list .show")).toHaveCount(FIXTURE.perCanton.ZH);
  await expect(page.locator('#results .fpill[data-remove="canton"]')).toHaveText(/Zurich/);
  // A tap on the switch drops the ?lang= that would override it on the next load.
  await page.click('.lang-switch [data-lang="fr"]');
  expect(new URL(page.url()).search).toBe("");
  expect(new URL(page.url()).hash).toBe("#wo=ZH");
});

for (const lang of ["de", "fr", "en"]) {
  test(`no untranslated keys on screen (${lang})`, async ({ page }) => {
    await useFixture(page);
    await page.addInitScript((l) => localStorage.setItem("jahgenda.lang", JSON.stringify(l)), lang);
    await openList(page);
    await expectNoRawKeys(page);
    // The panels, a filter pill, the empty state, the calendar and Meine Shows.
    await page.click("#toggle-where");
    await expectNoRawKeys(page);
    await page.click('#where-panel .chip[data-canton="ZH"]');
    await page.click("#toggle-when");
    await expectNoRawKeys(page);
    await page.keyboard.press("Escape");
    await page.fill("#q", "zzzz");
    await expect(page.locator("#status .big")).toBeVisible();
    await expectNoRawKeys(page);
    await page.fill("#q", "");
    await page.click('#view-switch [data-view="calendar"]');
    await expect(page.locator("#calendar .cal-grid")).toBeVisible();
    await expectNoRawKeys(page);
    await page.click('#view-switch [data-view="list"]');
    await page.locator("#list .show .star").first().click();
    await page.click("#toggle-mine");
    await expect(page.locator("#mine-panel")).toBeVisible();
    await expectNoRawKeys(page);
  });
}
