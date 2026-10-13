/* The language store (story #48): the locale as $state, the choice on the first visit, the switch
 * (DE · FR · EN, remembered in jahStore under «lang») and the head that follows it – <html lang>, the meta
 * description, og:locale, canonical / og:url and the manifest link. The texts and the formatters are in
 * core.js; components import t() from here (re-exported), plain modules from core.js.
 *
 * Which locale: ?lang=fr|en|de (the hreflang alternates) → a saved choice → the browser's first language
 * (fr* → fr, en* → en) → de. Only a tap on the switch is saved; the URL hash (filters, shows, lists) never
 * carries the language, so every link works in every language. */
import {
  LOCALES,
  INTL,
  LANG_NAMES,
  t,
  has,
  getLocale,
  setCurrentLocale,
  setTracker,
  browserLocale,
} from "./core.js";

export { t, has, LOCALES, INTL, LANG_NAMES };

const KEY = "lang";
const SITE = "https://markusbaumg.github.io/jahgenda/";
const store = () => (typeof window !== "undefined" ? window.jahStore : null);
const valid = (l) => (LOCALES.includes(l) ? l : "");

function urlLocale() {
  if (typeof location === "undefined") return "";
  try {
    return valid(new URLSearchParams(location.search).get("lang") || "");
  } catch {
    return "";
  }
}

function initialLocale() {
  const saved = store() ? valid(store().get((store().KEYS && store().KEYS.LANG) || KEY, "")) : "";
  if (typeof navigator === "undefined") return urlLocale() || saved || "de";
  return urlLocale() || saved || browserLocale(navigator.languages || [navigator.language]);
}

const state = $state({ locale: "de" });
setTracker(() => state.locale);

const setAttr = (sel, attr, value) => {
  const el = document.querySelector(sel);
  if (el) el.setAttribute(attr, value);
};

// The head follows the locale (the title is ListHead.svelte's: it also names an open list).
function syncHead(l) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = INTL[l];
  setAttr('meta[name="description"]', "content", t("meta.description"));
  setAttr('meta[property="og:description"]', "content", t("meta.description"));
  setAttr('meta[property="og:title"]', "content", t("meta.ogTitle"));
  setAttr('meta[property="og:locale"]', "content", INTL[l].replace("-", "_"));
  const self = l === "de" ? SITE : `${SITE}?lang=${l}`;
  setAttr('link[rel="canonical"]', "href", self);
  setAttr('meta[property="og:url"]', "content", self);
  // The build writes one manifest per language (vite.config.js): name and description of the installed app.
  const manifest = document.querySelector('link[rel="manifest"]');
  if (manifest) {
    const href = manifest.getAttribute("href").replace(/manifest(\.\w\w)?\.webmanifest$/, "");
    manifest.setAttribute("href", `${href}manifest${l === "de" ? "" : `.${l}`}.webmanifest`);
  }
}

function apply(l) {
  setCurrentLocale(l);
  state.locale = l;
  syncHead(l);
}

/** Pick the locale once, before the first render (src/main.js imports this module first). */
function initLocale() {
  apply(initialLocale());
}

export const i18n = {
  get locale() {
    return state.locale;
  },
  get tag() {
    return INTL[state.locale];
  },
  /** The switch: change the language, remember it, drop a ?lang= that would override it on reload. */
  set(l) {
    if (!valid(l)) return;
    const s = store();
    if (s) s.set((s.KEYS && s.KEYS.LANG) || KEY, l);
    if (urlLocale() && urlLocale() !== l) {
      const p = new URLSearchParams(location.search);
      p.delete("lang");
      const q = p.toString();
      history.replaceState(history.state, "", `${location.pathname}${q ? `?${q}` : ""}${location.hash}`);
    }
    if (l !== getLocale()) apply(l);
  },
};

initLocale();
