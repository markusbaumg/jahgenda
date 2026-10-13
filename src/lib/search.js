/* Full-text search over a show: folding of accents and umlauts, spoken short names of the big towns,
 * a canton's code or French / Italian name. Every whitespace-separated word must match somewhere. */
import { regionName } from "./regions.js";

// Search folding: accents and umlauts go (geneve = Genève, zurich = Zürich), typographic apostrophes
// become plain ones (L’Usine = L'Usine), ß → ss. A query spelt with ae/oe/ue is tried both ways
// (zuerich = Zürich). Every whitespace-separated word must match somewhere ("ska punk", "Busters Fette").
export const fold = (t) =>
  String(t)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`´]/g, "'")
    .replace(/ß/g, "ss")
    .toLowerCase();
const deUmlaut = (t) => t.replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u");
// Spoken short names of the big towns (keys folded like the query); a canton's code or its French /
// Italian name finds its shows too.
const SEARCH_ALIASES = { winti: "winterthur", barn: "bern", lozarn: "luzern", zuri: "zurich" };
const CANTON_ALIASES = {
  BE: "Berne",
  BL: "Bâle-Campagne",
  BS: "Bâle-Ville",
  FR: "Fribourg",
  GE: "Genève Geneva",
  GR: "Grigioni Grischun",
  LU: "Lucerne",
  NE: "Neuchâtel",
  TI: "Ticino",
  VD: "Vaud",
  VS: "Valais",
  ZH: "Zurich",
};

// The haystack of a show (stored as s._hay at load): title, venue, town, region, genres and acts.
export const searchText = (s, genreLabel = {}) =>
  fold(
    [
      s.title,
      s.venue,
      s.city,
      regionName(s.canton),
      CANTON_ALIASES[s.canton] || "",
      ...s.genres,
      ...s.genres.map((g) => genreLabel[g] || ""),
      ...s.acts,
    ].join(" "),
  );

// `q` is the folded query.
export function matchesSearch(s, q) {
  for (const raw of q.split(/\s+/).filter(Boolean)) {
    const t = SEARCH_ALIASES[raw] || raw;
    if (s._hay.includes(t) || s._hay.includes(deUmlaut(t)) || String(s.canton).toLowerCase() === raw)
      continue;
    return false;
  }
  return true;
}
