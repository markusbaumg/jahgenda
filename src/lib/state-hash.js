/* The pure halves of the filter and list state in the URL hash, split out of the stores (review #50) so
 * tests/state-hash.test.mjs can pin them with node --test, a fixed clock and no DOM:
 *   - quickRange: the quick picks Heute · Morgen · Wochenende · 7 Tage as [from, to];
 *   - isStateHash / encodeFilters / decodeFilters: #q=…&g=…&f=…&wo=ZH,BE&r=25&wann=…&past=1;
 *   - parseListHash / takeAllMarks: a friend's list #m=<short><g|i>,…[,von:<Name>] and «Alle merken».
 * The stores (src/stores/filters.svelte.js, marks.svelte.js) apply the results to their state. */
import { todayStart, addDays } from "./dates.js";

// The quick picks of the Wann panel, in the hash as wann=<kind>.
export const QUICK_KINDS = ["today", "tomorrow", "weekend", "7"];
export const RADII = [10, 25, 50];
// A search term from a URL is cut here; longer input is not a search but a pasted text.
export const Q_MAX = 80;

/** A quick pick as [from, to] (local days). «Wochenende» is Fri–Sun: from Friday on it starts today,
 * on a Sunday it is that Sunday alone; Monday to Thursday it is the coming Fri–Sun. */
export function quickRange(kind, today = todayStart()) {
  const d = today.getDay(); // 0 = Sunday
  if (kind === "today") return [today, today];
  if (kind === "tomorrow") return [addDays(today, 1), addDays(today, 1)];
  if (kind === "weekend")
    return [d === 0 || d >= 5 ? today : addDays(today, 5 - d), addDays(today, (7 - d) % 7)];
  return [today, addDays(today, Number(kind) - 1)];
}

// Only key=value parts and no list link (#m=…), even when combined with "&".
const STATE_HASH = /^#?[a-z]+=[^&]*(&[a-z]+=[^&]*)*$/;
export const isStateHash = (h) => STATE_HASH.test(h) && !/(^#?|&)(mine|m)=/.test(h);

/**
 * The filter state as hash parameters (without "#"); "" for no filter. Parameters appear in a fixed
 * order: q, g, f, wo, r, wann, past. `months` are month keys («2026-10») already in calendar order;
 * they win over `quick`. `radius` only counts with a known position (`here`).
 * @param {{q?: string, genre?: string, format?: string, cantons?: Iterable<string>, radius?: number,
 *   here?: boolean, months?: string[], quick?: string, past?: boolean}} s
 */
export function encodeFilters(s) {
  const p = new URLSearchParams();
  const q = (s.q || "").trim();
  if (q) p.set("q", q);
  if (s.genre) p.set("g", s.genre);
  if (s.format) p.set("f", s.format);
  const cantons = [...(s.cantons || [])];
  if (cantons.length) p.set("wo", cantons.join(","));
  if (s.here && s.radius) p.set("r", String(s.radius));
  if (s.months && s.months.length) p.set("wann", s.months.join(","));
  else if (s.quick) p.set("wann", s.quick);
  if (s.past) p.set("past", "1");
  return p.toString().replace(/%2C/g, ",");
}

/**
 * A state hash read back; anything unknown is dropped (a typed or old link never breaks the page).
 * Returns null when the hash is no state hash (a show link, a list link, nothing).
 * @param {string} hash location.hash, with or without "#"
 * @param {{genres?: string[], formats?: string[], isRegion?: (code: string) => boolean,
 *   monthKeys?: string[]}} known the values the page knows today
 * @returns {null | {q: string, genre: string, format: string, cantons: string[], radius: number|null,
 *   quick: string, months: string[], past: boolean}}
 */
export function decodeFilters(
  hash,
  { genres = [], formats = [], isRegion = () => false, monthKeys = [] } = {},
) {
  if (!isStateHash(hash)) return null;
  const p = new URLSearchParams(String(hash).replace(/^#/, ""));
  const g = p.get("g") || "";
  const fm = p.get("f") || "";
  const r = Number(p.get("r"));
  const wann = p.get("wann") || "";
  const quick = QUICK_KINDS.includes(wann) ? wann : "";
  const known = new Set(monthKeys);
  return {
    q: (p.get("q") || "").slice(0, Q_MAX),
    genre: genres.includes(g) ? g : "",
    format: formats.includes(fm) ? fm : "",
    cantons: (p.get("wo") || "").split(",").filter((c) => c && isRegion(c)),
    radius: RADII.includes(r) ? r : null,
    quick,
    months: quick || !wann ? [] : wann.split(",").filter((k) => known.has(k)),
    past: p.get("past") === "1",
  };
}

// Hash parts come from a URL someone typed or pasted: never let a bad escape throw.
export const decodeHashPart = (t) => {
  try {
    return decodeURIComponent(t);
  } catch {
    return t;
  }
};

/**
 * A friend's list, #m=<short><g|i>,…[,von:<Name>] (the old form #mine=<id>:<g|i>,… too): the shows
 * found, the sender's name, and how many tokens no show matches any more (passed, removed).
 * @param {string} raw the value of m= / mine=
 * @param {(token: string) => ({id: string} | null | undefined)} findShow short hash or id → show
 * @returns {{map: Record<string, "going"|"interested">, by: string, missing: number}}
 */
export function parseListHash(raw, findShow) {
  const map = {};
  let by = "";
  let missing = 0;
  for (const part of String(raw || "").split(",")) {
    if (part.startsWith("von:")) {
      by = decodeHashPart(part.slice(4)).trim().slice(0, 40);
      continue;
    }
    let token, st;
    if (part.includes(":")) [token, st] = part.split(":").map(decodeHashPart);
    else [token, st] = [decodeHashPart(part.slice(0, -1)), part.slice(-1)];
    const show = token && findShow(token);
    if (show) map[show.id] = st === "g" ? "going" : "interested";
    else if (token) missing++;
  }
  return { map, by, missing };
}

/** «Alle merken»: every show of a friend's list joins the own marks as «interested» – an own mark is
 * never overwritten or downgraded, and the friend's «Ich gehe» does not become the visitor's. */
export function takeAllMarks(marks, shared) {
  const m = { ...marks };
  for (const id of Object.keys(shared || {})) if (!m[id]) m[id] = "interested";
  return m;
}
