// Grammar the message tables build with functions (src/i18n): prepositions per canton in the empty
// state's headline and the subscribe callout. Run: make test (node --test tests/).
import test from "node:test";
import assert from "node:assert/strict";
import { t, setCurrentLocale, TABLES } from "../src/i18n/core.js";
import { shortRegion } from "../src/lib/regions.js";

const where = (codes) =>
  codes.length === 1
    ? t("empty.inRegion", { code: codes[0], name: shortRegion(codes[0]) })
    : t("empty.inRegions", { regions: codes.map((code) => ({ code, name: shortRegion(code) })) });

test("German: each canton keeps its own preposition (im, in, in der)", () => {
  setCurrentLocale("de");
  assert.equal(where(["TI"]), " im Tessin");
  assert.equal(where(["BE"]), " in Bern");
  assert.equal(where(["VD"]), " in der Waadt");
  assert.equal(where(["TI", "AG"]), " im Tessin und im Aargau");
  assert.equal(where(["VD", "VS"]), " in der Waadt und im Wallis");
  assert.equal(where(["BE", "ZH", "TG"]), " in Bern, in Zürich und im Thurgau");
});

test("French: each canton keeps its own preposition (au, en, à)", () => {
  setCurrentLocale("fr");
  try {
    assert.equal(where(["TI", "AG"]), " au Tessin et en Argovie");
    assert.equal(where(["VD", "VS"]), " dans le canton de Vaud et en Valais");
    assert.equal(where(["GE", "D", "TI"]), " à Genève, en Allemagne et au Tessin");
  } finally {
    setCurrentLocale("de");
  }
});

test("English: a plain «in» list", () => {
  setCurrentLocale("en");
  try {
    assert.equal(where(["TI", "AG"]), " in Ticino and Aargau");
  } finally {
    setCurrentLocale("de");
  }
});

// The three tables stay in step: French and English carry every German key (German is the source), and
// their only keys of their own are the region names (region.<code>, regionShort.<code> for the places
// abroad), which German takes from src/lib/regions.js. A missing key would silently show German; a stray key would be dead text.
test("fr and en have every de key; extras are only region(Short).<code> names", () => {
  const de = Object.keys(TABLES.de);
  for (const lang of ["fr", "en"]) {
    const keys = new Set(Object.keys(TABLES[lang]));
    assert.deepEqual(
      de.filter((k) => !keys.has(k)),
      [],
      `${lang} lacks keys`,
    );
    const extra = [...keys].filter((k) => !TABLES.de[k] && !/^region(Short)?\.[A-Z]{1,2}$/.test(k));
    assert.deepEqual(extra, [], `${lang} has keys de does not`);
  }
});
