/* The language core of the page (story #48): the locale in use, t() over the three message tables and the
 * Intl date formatters of that locale. Plain JS (no runes, no DOM at import), so src/lib and the node tests
 * can use it too – they get German, the default. The reactive side (the switch, <html lang>, the head) is
 * i18n.svelte.js: it registers a tracker here, so every t() and every formatter call inside a component or
 * a $derived re-runs when the locale changes.
 *
 * Messages: a flat table per locale (de.js is the source, fr.js / en.js translate it). A value is
 * - a string with {name} placeholders: t("x", { name: "Bern" });
 * - a plural object { one, other } (and optionally zero), picked by params.n with Intl.PluralRules;
 * - a function (params) => string, for grammar that does not fit a template (prepositions, cases).
 * A key missing in fr / en falls back to German; a key missing everywhere comes back as the key itself
 * (the e2e suite scans the DOM for raw keys). */
import de from "./de.js";
import fr from "./fr.js";
import en from "./en.js";

export const LOCALES = ["de", "fr", "en"];
// The Intl / <html lang> tag per locale.
export const INTL = { de: "de-CH", fr: "fr-CH", en: "en-GB" };
// The labels of the switch (DE · FR · EN) and the language names for its tooltips.
export const LANG_NAMES = { de: "Deutsch", fr: "Français", en: "English" };
export const TABLES = { de, fr, en };

let current = "de";
let track = () => {};

export const getLocale = () => {
  track();
  return current;
};
const intlTag = () => INTL[getLocale()];
/** Set the locale (the reactive store calls this; anything else goes through i18n.svelte.js). */
export function setCurrentLocale(l) {
  if (LOCALES.includes(l)) current = l;
}
/** The reactive store hands in a function that reads its $state, so callers re-run on a switch. */
export function setTracker(fn) {
  track = typeof fn === "function" ? fn : () => {};
}

// The first visit: the browser's first language decides (fr* → fr, en* → en, anything else → de).
// A saved choice and ?lang= come first (i18n.svelte.js).
export function browserLocale(languages) {
  const first = String((languages && languages[0]) || "").toLowerCase();
  if (first.startsWith("fr")) return "fr";
  if (first.startsWith("en")) return "en";
  return "de";
}

const plurals = new Map();
function pluralCat(n) {
  const tag = INTL[current];
  if (!plurals.has(tag)) plurals.set(tag, new Intl.PluralRules(tag));
  return plurals.get(tag).select(Number(n) || 0);
}

const fill = (s, params) =>
  params ? s.replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined ? m : String(params[k]))) : s;

/** The message `key` in the current locale, with {placeholders} from `params` and plural by params.n. */
export function t(key, params) {
  track();
  let msg = TABLES[current][key];
  if (msg === undefined) msg = de[key];
  if (msg === undefined) return key;
  if (typeof msg === "function") return msg(params || {});
  if (msg && typeof msg === "object") {
    const n = params ? params.n : 0;
    msg = (Number(n) === 0 && msg.zero) || msg[pluralCat(n)] || msg.other;
  }
  return fill(String(msg), params);
}
/** Whether the current table (or German) has `key` – for optional texts. */
export const has = (key) => TABLES[current][key] !== undefined || de[key] !== undefined;

// --- Dates ------------------------------------------------------------------------------------------
const formats = new Map();
/** A cached Intl.DateTimeFormat for the current locale. */
function dateFmt(opts) {
  const tag = intlTag();
  const k = `${tag}|${JSON.stringify(opts)}`;
  if (!formats.has(k)) formats.set(k, new Intl.DateTimeFormat(tag, opts));
  return formats.get(k);
}
/** A formatter object that keeps the Intl shape ({ format(d) }) but follows the locale. */
export const localeFmt = (opts) => ({ format: (d) => dateFmt(opts).format(d) });
