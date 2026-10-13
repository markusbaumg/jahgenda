/* Cantons and nearby places abroad (criteria.md → Nearby): codes, German names and the groups of the Wo
 * panel. The codes must agree with scripts/validate_shows.py and public/img/cantons/*.svg
 * (tests/test_contract.py checks). French and English names: src/i18n (region.<code>, regionShort.<code>). */
import { t } from "../i18n/core.js";

export const CANTONS = {
  AG: "Aargau",
  AI: "Appenzell I.Rh.",
  AR: "Appenzell A.Rh.",
  BE: "Bern",
  BL: "Basel-Landschaft",
  BS: "Basel-Stadt",
  FR: "Freiburg",
  GE: "Genf",
  GL: "Glarus",
  GR: "Graubünden",
  JU: "Jura",
  LU: "Luzern",
  NE: "Neuenburg",
  NW: "Nidwalden",
  OW: "Obwalden",
  SG: "St. Gallen",
  SH: "Schaffhausen",
  SO: "Solothurn",
  SZ: "Schwyz",
  TG: "Thurgau",
  TI: "Tessin",
  UR: "Uri",
  VD: "Waadt",
  VS: "Wallis",
  ZG: "Zug",
  ZH: "Zürich",
};

export const ABROAD = {
  D: "Deutschland (grenznah)",
  F: "Frankreich (grenznah)",
  I: "Italien (grenznah)",
  A: "Österreich (grenznah)",
  FL: "Liechtenstein",
};

// The Wo panel groups the canton chips like the spec's <optgroup>s (§3.2); bilingual Freiburg and
// Wallis count as Romandie, Bern as Deutschschweiz.
export const REGIONS = [
  [
    "Deutschschweiz",
    [
      "AG",
      "AI",
      "AR",
      "BE",
      "BL",
      "BS",
      "GL",
      "GR",
      "LU",
      "NW",
      "OW",
      "SG",
      "SH",
      "SO",
      "SZ",
      "TG",
      "UR",
      "ZG",
      "ZH",
    ],
  ],
  ["Romandie", ["FR", "GE", "JU", "NE", "VD", "VS"]],
  ["Ticino", ["TI"]],
  ["Grenznah", ["D", "F", "I", "A", "FL"]],
];

// The name in the page's language: a table entry region.<code> (fr / en, src/i18n), else the German name.
const local = (key) => {
  const v = t(key);
  return v === key ? "" : v;
};
export const regionName = (c) => local(`region.${c}`) || CANTONS[c] || ABROAD[c] || c;
// Region name for pills and headlines: «Bern», «Deutschland» (no «(grenznah)» – the row says that).
export const shortRegion = (c) =>
  ABROAD[c] ? local(`regionShort.${c}`) || ABROAD[c].replace(/ \(grenznah\)$/, "") : regionName(c);
// The name of a region group of the Wo panel (Deutschschweiz, Romandie, Ticino, Grenznah).
export const groupName = (name) => t(`region.group.${name}`);
// Accessible name of the canton button in a row (§5): «Nur Bern anzeigen», abroad «Deutschland, grenznah».
// The visible code is part of the name, so what is read matches what is seen (Lighthouse).
export const cantonLabel = (c) =>
  ABROAD[c]
    ? t(ABROAD[c].includes("(grenznah)") ? "row.abroadOnly" : "row.abroadOnlyPlain", {
        name: shortRegion(c),
        code: c,
      })
    : t("row.cantonOnly", { name: regionName(c), code: c });
