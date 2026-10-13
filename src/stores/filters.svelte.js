/* The filter store (story #33 M1): everything the filter bar, the Wo / Wann panels, the results row and
 * the empty state share on top of the agenda store – the open panel, the view, the time dimension (quick
 * picks, months, past shows), the position (Mein Standort, radius, nearest show), the active-filter
 * dimensions with their counts, and the filter state in the URL hash. Ported from the IIFE sections of
 * app.js (activeDims, removeFilter, the Wo / Wann sections, filterParams / readFilterHash /
 * applyStateHash, setPanel, setView, locate). The filter values themselves live in agenda.filters; a Set
 * in there is always replaced, never mutated, so every reader re-runs. */
import { flushSync } from "svelte";
import { agenda, FORMAT_LABEL } from "./agenda.svelte.js";
import { distanceKm, parseHash as parseHashLib } from "../lib/index.js";
import { quickRange, isStateHash, encodeFilters, decodeFilters } from "../lib/state-hash.js";
import {
  todayStart,
  sameDay,
  monthStart,
  monthFmt,
  monthNameFmt,
  shortMonthFmt,
  dow,
  dm,
} from "../lib/dates.js";
import { t } from "../i18n/core.js";
import { CANTONS, ABROAD, shortRegion } from "../lib/regions.js";
import { quietScroll } from "../components/views/scroll.js";
import { nav } from "./history.js";
import { callout as calloutStore } from "./callout.svelte.js";

export const VIEWS = ["list", "calendar", "map"];

// --- Labels -----------------------------------------------------------------------------------------
export const nShows = (n) => t("n.shows", { n });
// A search term as a label (pill, offer, headline): long input is cut so nothing overflows a phone.
export const qLabel = (q) => (q.length > 24 ? `${q.slice(0, 22).trimEnd()}…` : q);
export { dm }; // «16.10.» in the page's locale (lib/dates.js)
// The histogram's month key «2026-10» – unpadded, the same as in the #wann= hash.
export const monthKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}`;

// Quick picks (§7 S3: Heute · Morgen · Wochenende · 7 Tage), one exclusive choice; the badge, the chips
// and the empty state name the pick rather than its dates.
// Getters: the words follow the page's language (src/i18n; the empty state's words are empty.*).
export const QUICK = {
  get today() {
    return t("quick.today");
  },
  get tomorrow() {
    return t("quick.tomorrow");
  },
  get weekend() {
    return t("quick.weekend");
  },
  get 7() {
    return t("quick.7");
  },
};

// "Oktober 2026" or "Oktober 2026 – Dezember 2026": the months a (sorted) list of shows spans.
export function monthSpan(visible) {
  const first = visible[0]._day;
  const last = visible.reduce(
    (m, s) => (s._end && s._end > m ? s._end : m),
    visible[visible.length - 1]._day,
  );
  return first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()
    ? monthFmt.format(first)
    : `${monthFmt.format(first)} – ${monthFmt.format(last)}`;
}

// Quick picks as [from, to] and the hash helpers: pure, in src/lib/state-hash.js (tests/state-hash.test.mjs).
export { quickRange, isStateHash };

// --- Hash helpers -----------------------------------------------------------------------------------
// Filter state in the URL: #q=…&g=…&f=…&wo=ZH,BE&r=25&wann=weekend|today|7|2026-10,2026-11&past=1&view=…
// The page's view of a hash: a show token never contains "=" (q=… is a filter, not a show).
export const parseHash = (hash = location.hash) =>
  parseHashLib(
    String(hash || "")
      .replace(/^#/, "")
      .split("&")
      .filter((p) => !p.includes("=") || /^(mine|m|view)=/.test(p))
      .join("&"),
    VIEWS,
  );

const jahStore = () => (typeof window !== "undefined" ? window.jahStore : null);
const callout = () => calloutStore;
const el = (id) => document.getElementById(id);
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function createFilterUi() {
  const f = agenda.filters;

  // #view= in the link wins over the view this browser remembers.
  let view = $state(
    (() => {
      if (typeof location === "undefined") return "list";
      const stored = jahStore() ? jahStore().get(jahStore().KEYS.VIEW, "list") : "list";
      return parseHash().view || (VIEWS.includes(stored) ? stored : "list");
    })(),
  );
  let openPanel = $state(null); // "where" | "when" | null
  // Meine Shows / a shared list (the list mode bypasses the filters: no pills, no hash, no counts).
  const listMode = $derived(Boolean(agenda.list));
  let pastAuto = false; // past shows were switched on by a choice that reaches into the past
  let filterTouched = false; // the change follows a filter tap (not a deep-link landing)
  let hashRead = false;

  // Position: the «Mein Standort» button, the status line under it (text or the nearest show).
  let locating = $state(false);
  let located = $state(false);
  let geoText = $state("");
  let geoNear = $state.raw(null); // { s, km, when } – the closest upcoming show

  // Every month from the first show (or today) to the last show.
  const monthList = $derived.by(() => {
    const shows = agenda.shows;
    if (!shows.length) return [];
    const today = agenda.today;
    const first = monthStart(shows[0]._day < today ? shows[0]._day : today);
    const lastDay = shows[shows.length - 1]._day;
    const last = monthStart(lastDay > today ? lastDay : today);
    const out = [];
    for (let d = first; d <= last; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) out.push(d);
    return out;
  });

  // "Okt" this year, "Jan ’27" in another year. In the histogram the year is only on the first month of
  // a new year (the labels sit 40 px apart; «Jan ’27 Feb ’27 Mär ’27» ran into each other).
  function monthLabel(d, i) {
    const name = shortMonthFmt.format(d).replace(".", "");
    const year = ` ’${String(d.getFullYear()).slice(2)}`;
    if (d.getFullYear() === todayStart().getFullYear()) return name;
    if (i === undefined) return name + year;
    const prev = monthList[i - 1];
    return !prev || prev.getFullYear() !== d.getFullYear() ? name + year : name;
  }

  const rangeActive = () => Boolean(f.months.size || (f.range && f.range[0] && f.range[1]));
  const quickActive = () => {
    if (f.months.size || !f.range) return "";
    const [from, to] = f.range;
    return (
      Object.keys(QUICK).find((k) => {
        const [a, b] = quickRange(k);
        return sameDay(a, from) && sameDay(b, to);
      }) || ""
    );
  };
  function rangeLabel() {
    if (f.months.size) {
      const picked = monthList.filter((d) => f.months.has(monthKey(d)));
      return picked.length > 2
        ? t("n.months", { n: picked.length })
        : picked.map((d) => monthLabel(d)).join(", ");
    }
    const quick = quickActive();
    if (quick) return QUICK[quick];
    const [from, to] = f.range;
    return sameDay(from, to) ? dm(from) : `${dm(from)}–${dm(to)}`;
  }

  // Past shows follow the choice: a month before this one switches them on, and off again once no such
  // month is selected any more (unless the visitor switched them on by hand).
  function syncPast() {
    const thisMonth = monthStart(todayStart());
    const reachesPast = [...f.months].some((k) => {
      const d = monthList.find((m) => monthKey(m) === k);
      return d && d < thisMonth;
    });
    if (reachesPast && !f.showPast) {
      f.showPast = true;
      pastAuto = true;
    } else if (!reachesPast && pastAuto) {
      f.showPast = false;
      pastAuto = false;
    }
  }
  function setRange(from, to) {
    f.months = new Set();
    f.range = [from, to];
    syncPast();
  }
  function clearRange() {
    f.range = null;
    f.months = new Set();
    syncPast();
  }
  function toggleMonth(k) {
    f.range = null;
    const next = new Set(f.months);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    f.months = next;
    syncPast();
  }
  function pickQuick(kind) {
    if (quickActive() === kind) clearRange();
    else setRange(...quickRange(kind));
  }
  function resetWhen() {
    clearRange();
    f.showPast = false;
    pastAuto = false;
  }
  function setShowPast(on) {
    f.showPast = on;
    pastAuto = false;
  }

  const toggleCanton = (code) => agenda.toggleCanton(code);
  const clearCantons = () => (f.cantons = new Set());
  const setGenre = (g) => (f.genre = g);
  const setFormat = (v) => (f.format = v);
  const setRadius = (km) => (f.radius = km);

  // Each active filter as a removable dimension: what it is, how to name it, and what removing it yields.
  // In a stable order (search, genre, cantons, radius, time) – the pills; the empty state sorts by yield.
  const dims = $derived.by(() => {
    if (agenda.loadState !== "ready" || listMode) return [];
    const out = [];
    const countWith = agenda.countWith;
    const q = f.q.trim();
    if (q) out.push({ kind: "q", label: t("q.quoted", { q: qLabel(q) }), count: countWith({ q: "" }) });
    if (f.genre)
      out.push({
        kind: "genre",
        label: agenda.genreLabel[f.genre] || f.genre,
        count: countWith({ genre: "" }),
      });
    if (f.format)
      out.push({ kind: "format", label: FORMAT_LABEL[f.format], count: countWith({ format: "" }) });
    for (const c of f.cantons) {
      const rest = new Set(f.cantons);
      rest.delete(c);
      out.push({ kind: "canton", value: c, label: shortRegion(c), count: countWith({ cantons: rest }) });
    }
    if (agenda.here && f.radius)
      out.push({ kind: "radius", label: `≤ ${f.radius} km`, count: countWith({ radius: 0 }) });
    if (f.months.size)
      for (const d of monthList.filter((d) => f.months.has(monthKey(d)))) {
        const rest = new Set(f.months);
        rest.delete(monthKey(d));
        out.push({
          kind: "month",
          value: monthKey(d),
          label: monthLabel(d),
          count: countWith({ months: rest, range: null }),
        });
      }
    else if (f.range)
      out.push({ kind: "range", label: rangeLabel(), count: countWith({ months: new Set(), range: null }) });
    return out;
  });

  // Remove one filter dimension (a pill, or an offer in the empty state).
  function removeDim(kind, value) {
    if (kind === "q") f.q = "";
    if (kind === "genre") setGenre("");
    if (kind === "format") setFormat("");
    if (kind === "canton") toggleCanton(value);
    if (kind === "radius") setRadius(0);
    if (kind === "month") {
      const next = new Set(f.months);
      next.delete(value);
      f.months = next;
      syncPast();
    }
    if (kind === "range") clearRange();
  }
  function clearFilters() {
    f.cantons = new Set();
    f.radius = 0;
    f.q = "";
    f.genre = "";
    f.format = "";
    clearRange();
  }

  // Headline of the empty state: «Kein Dub im Tessin», «Nichts in Bern am Wochenende», «Nichts zu «xy»» …
  function emptyHeadline() {
    const quick = quickActive();
    const q = f.q.trim();
    // «Kein Dub», «Kein Festival», «Kein Dub-Festival»
    const genreWord = f.genre && (agenda.genreLabel[f.genre] || f.genre);
    const genre = f.format
      ? genreWord
        ? t("empty.genreFormat", { genre: genreWord, format: FORMAT_LABEL[f.format] })
        : FORMAT_LABEL[f.format]
      : genreWord;
    const what = q ? t("empty.q", { q: qLabel(q) }) : "";
    // Where: «im Tessin», «in Bern, Zürich», «in 4 Kantonen», «im Umkreis von 25 km».
    const codes = [...f.cantons];
    let where = "";
    if (codes.length === 1) where = t("empty.inRegion", { code: codes[0], name: shortRegion(codes[0]) });
    else if (codes.length && codes.length <= 3)
      where = t("empty.inRegions", { names: codes.map(shortRegion).join(", ") });
    else if (codes.length) where = t("empty.inCantons", { n: codes.length });
    if (agenda.here && f.radius) where += t("empty.radius", { km: f.radius });
    // When: «heute», «am Wochenende», «im November», «in den gewählten Monaten», «vom 16.10. bis 20.10.».
    let when = "";
    if (quick) when = t(`empty.when.${quick}`);
    else if (f.months.size === 1) {
      const d = monthList.find((m) => f.months.has(monthKey(m)));
      if (d) when = t("empty.inMonth", { month: monthNameFmt.format(d) });
    } else if (f.months.size) when = t("empty.inMonths");
    else if (f.range)
      when = sameDay(f.range[0], f.range[1])
        ? t("empty.onDay", { day: dm(f.range[0]) })
        : t("empty.fromTo", { from: dm(f.range[0]), to: dm(f.range[1]) });
    if (genre) return t("empty.genre", { genre, where, when, what });
    if (!where && quick) return t("empty.quick", { quick: t(`empty.quick.${quick}`), what });
    return where || when || what ? t("empty.other", { where, when, what }) : t("empty.nothing");
  }

  // «12 Shows · 1 Festival für diese Auswahl · Juli 2027 · Heute» – the footer line and the live region.
  const resultsText = $derived.by(() => {
    const visible = agenda.visible;
    if (agenda.loadState !== "ready" || !visible.length) return "";
    const rangeNote = rangeActive() ? ` · ${rangeLabel()}` : "";
    const nFest = visible.filter((s) => Boolean(s._end)).length;
    const nConc = visible.length - nFest;
    const festNote = nFest ? `${nConc ? " · " : ""}${t("n.festivals", { n: nFest })}` : "";
    const concerts = nConc ? nShows(nConc) : "";
    // A friend's list says what it is: «Geteilte Liste · 3 Shows · Oktober 2026».
    if (agenda.list && agenda.list.shared)
      return `${t("results.shared", { count: nShows(visible.length), span: monthSpan(visible) })}${rangeNote}`;
    return `${concerts}${festNote}${agenda.filtered ? t("results.selection") : ""} · ${monthSpan(visible)}${rangeNote}`;
  });

  // --- The hash -------------------------------------------------------------------------------------
  function filterParams() {
    return encodeFilters({
      q: f.q,
      genre: f.genre,
      format: f.format,
      cantons: f.cantons,
      radius: f.radius,
      here: Boolean(agenda.here),
      months: monthList.map(monthKey).filter((k) => f.months.has(k)),
      quick: f.range ? quickActive() : "",
      past: f.showPast && !pastAuto,
    });
  }
  // The filters plus the view (#g=dub&view=map); "" for the plain list without a filter.
  const stateParams = () => [filterParams(), view !== "list" ? `view=${view}` : ""].filter(Boolean).join("&");
  const stateUrl = () => {
    const p = stateParams();
    return p ? `#${p}` : location.pathname + location.search;
  };
  // Written with replaceState (a filter tap never adds a history entry). A show link (#<short>) stays
  // while the page lands on it; a filter tap afterwards replaces it. The list mode keeps its own hash.
  function syncFilterHash() {
    if (agenda.loadState !== "ready" || listMode) return;
    const h = location.hash;
    if (h && !isStateHash(h) && !filterTouched) return;
    if (stateParams() === h.slice(1)) return;
    history.replaceState(history.state, "", stateUrl());
  }
  function readFilterHash() {
    const h = decodeFilters(location.hash, {
      genres: agenda.genres,
      formats: agenda.formats,
      isRegion: (c) => Boolean(CANTONS[c] || ABROAD[c]),
      monthKeys: monthList.map(monthKey),
    });
    if (!h) return;
    f.q = h.q;
    f.genre = h.genre;
    f.format = h.format;
    f.cantons = new Set([...f.cantons, ...h.cantons]);
    if (h.radius) f.radius = h.radius; // applies once the position is known
    if (h.quick) setRange(...quickRange(h.quick));
    else if (h.months.length) {
      f.months = new Set([...f.months, ...h.months]);
      syncPast();
    }
    if (h.past) f.showPast = true;
  }
  // Once, when the data is first in: a reloaded, bookmarked or shared filtered view.
  function readHashOnce() {
    if (hashRead) return;
    hashRead = true;
    readFilterHash();
  }
  // A state hash arriving on the open page – a bookmark or a friend's «Link zu dieser Auswahl» tapped in
  // this tab, a URL typed over the page, the plain address to start afresh – wins over the filters in
  // memory, as on load. Show and list links are left to their own handlers.
  // Returns true when it applies the hash (the change then writes the hash itself, after the swap).
  function applyStateHash() {
    if (agenda.loadState !== "ready" || listMode) return false;
    const h = location.hash;
    if (h && !isStateHash(h)) return false;
    if (h.replace(/^#/, "") === stateParams()) return false;
    applyFilter(() => {
      clearFilters();
      f.showPast = false;
      pastAuto = false;
      readFilterHash();
      const v = parseHash().view || "list";
      if (v !== view) setView(v);
    });
    return true;
  }

  // --- History: the Back button is the history store's (src/stores/history.js). The filter store plugs
  // in: every entry records the view; an open panel is an overlay (its own entry, Back closes it like
  // Escape and gives the focus back to its toggle); an entry of ours with another view switches to it;
  // an entry the page did not write applies a state hash (a show or list link is left alone); after
  // every Back – and after our own history.back() – the hash follows the filters again.
  const histState = (extra) => ({ jah: 1, view, ...extra });
  nav.setView(() => view);
  for (const name of ["where", "when"])
    nav.registerOverlay(name, {
      isOpen: () => openPanel === name,
      close: () => {
        const btn = PANELS[name];
        setPanel(null);
        el(btn).focus({ preventScroll: true });
      },
    });
  nav.on("view", (v) => {
    if (v !== view && !listMode) setView(v);
  });
  nav.on("foreign", () => {
    if (applyStateHash()) return true;
    return Boolean(location.hash && !isStateHash(location.hash));
  });
  nav.on("settle", () => syncFilterHash());
  nav.on("ownBack", () => syncFilterHash()); // a filter picked while the panel was open lived on the entry just left

  // --- Panels (Wo / Wann): dropdowns under the sticky bar, only one open at a time. ------------------
  const PANELS = { where: "toggle-where", when: "toggle-when" };
  const PANEL_IDS = { where: "where-panel", when: "when-panel" };
  // The panel's max-height counts from the bar's real bottom edge: at the top of the page the bar is not
  // stuck yet and sits under the header, so the panel would otherwise run past the fold.
  function fitPanel() {
    const form = el("filters");
    if (!form) return;
    const bottom = Math.max(0, form.getBoundingClientRect().bottom);
    form.style.setProperty("--panel-top", `${Math.round(bottom)}px`);
  }
  function setPanel(name) {
    const was = openPanel;
    openPanel = name;
    flushSync();
    if (name) {
      fitPanel();
      nav.pushOverlay(name);
      if (callout()) callout().suspend(); // a sticker never covers the panel's last rows
      // Keyboard and screen-reader users land in the panel, not 12 Tabs away from it.
      const first = el(PANEL_IDS[name]).querySelector(".chip:not([hidden])");
      if (first) first.focus({ preventScroll: true });
    } else if (was) nav.popOverlay();
  }
  const togglePanel = (name) => setPanel(openPanel === name ? null : name);
  // Close and give the focus back to the panel's toggle (×, Escape).
  function closePanel() {
    if (!openPanel) return;
    const btn = PANELS[openPanel];
    setPanel(null);
    el(btn).focus();
  }

  // --- Views: Liste | Kalender | Karte --------------------------------------------------------------
  function setView(next, opts = {}) {
    if (!VIEWS.includes(next)) return;
    view = next;
    if (jahStore()) jahStore().set(jahStore().KEYS.VIEW, view);
    // The view is written into the hash next to the filters (#view=calendar, nothing for the list), so a
    // reload or a shared link shows what the visitor saw; a show or list link in the hash stays as it is.
    const h = location.hash;
    const url = agenda.loadState === "ready" && (!h || isStateHash(h)) ? stateUrl() : undefined;
    if (opts.push) nav.pushView(url);
    else nav.replaceView(url);
    if (callout() && opts.push) {
      callout().suspend(); // a nudge steps aside (the map must stay tappable)
      callout().hide(); // a callout opened on purpose closes with the view it belonged to
    }
    flushSync();
    // A switch to the calendar or the map brings that view up under the bar.
    if (opts.push && next !== "list") scrollUnderBar(el("views"));
  }

  // --- Scrolling and focus around a filter change ----------------------------------------------------
  const underBar = (elm) =>
    elm.getBoundingClientRect().top + window.scrollY - (el("filters")?.offsetHeight || 0) - 8;
  function scrollUnderBar(target) {
    const views = el("views");
    if (!target || !views || views.hidden || window.scrollY >= underBar(target)) return;
    quietScroll(1500);
    window.scrollTo({ top: underBar(target) });
    setTimeout(() => {
      if (Math.abs(window.scrollY - underBar(target)) > 2) window.scrollTo({ top: underBar(target) });
    }, 80);
  }
  // No result: the «Nichts gefunden» box takes the list's place and must come into view; else the start
  // of the results is the results row (count, view switch, pills), so a filter can be undone where it
  // was made (in the list mode: the Meine-Shows panel with the list actions).
  function keepInView() {
    const views = el("views");
    const status = el("status");
    const row = listMode ? el("mine-panel") : document.querySelector(".results-row");
    if (!views || !status) return;
    const target = views.hidden ? status : row;
    if (views.hidden && !status.textContent.trim()) return;
    const top = () => underBar(!target || target.hidden ? views : target);
    if (window.scrollY > top()) {
      quietScroll(1000);
      window.scrollTo({ top: top() });
      // The bar grows by a row once it sticks: check the target again a moment later.
      setTimeout(() => {
        if (window.scrollY > top()) window.scrollTo({ top: top() });
      }, 80);
    }
  }
  // Focus (§5): what had the focus inside a region the change rebuilds is found again by its place – the
  // row's data-id (or the calendar day) plus its own tag, classes and data attributes. Gone for good →
  // #results (tabindex=-1), so a keyboard user never lands on <body> after a filter.
  const focusRegions = () => ["views", "status", "results"].map(el).filter(Boolean);
  function focusPath(a) {
    const part = (n, withClasses) => {
      let s = n.tagName.toLowerCase();
      if (withClasses)
        for (const c of n.classList) if (c !== "fb-on" && !c.startsWith("svelte-")) s += `.${CSS.escape(c)}`;
      for (const { name, value } of n.attributes)
        if (name.startsWith("data-")) s += `[${name}="${CSS.escape(value)}"]`;
      return s;
    };
    const scope = a.closest("[data-id], [data-day]");
    return (scope && scope !== a ? `${part(scope, false)} ` : "") + part(a, true);
  }
  let lastFilterAt = 0;
  // A filter change: applied inside a view transition where the browser has one (a cross-fade), else
  // #list dips in opacity; the focus is kept and the results stay in view. `after` runs once the new
  // DOM is in.
  function applyFilter(mutate, after) {
    lastFilterAt = Date.now();
    const prev = document.activeElement;
    const path =
      prev && prev !== document.body && focusRegions().some((r) => r.contains(prev)) ? focusPath(prev) : "";
    const swap = () => {
      filterTouched = true;
      mutate();
      flushSync();
      syncFilterHash();
      filterTouched = false;
      // Only when the focus was really lost (a reset may have put it on the search meanwhile).
      const lost = !document.activeElement || document.activeElement === document.body;
      if (path && !prev.isConnected && lost) {
        const next = focusRegions()
          .map((r) => r.querySelector(path))
          .find(Boolean);
        (next || el("results"))?.focus({ preventScroll: true });
      }
    };
    const settle = () => {
      keepInView();
      if (after) after();
    };
    if (document.startViewTransition && !reducedMotion()) {
      document.startViewTransition(swap).updateCallbackDone.then(settle, settle);
    } else {
      const list = el("list");
      if (list) {
        list.classList.remove("dip");
        void list.offsetWidth; // restart the dip
        list.classList.add("dip");
      }
      swap();
      settle();
    }
  }
  // A change that re-renders the rows without being a filter (a row leaving Meine Shows): no transition, no
  // scroll – only the focus is found again by its place (app.js render()).
  function keepFocus(mutate) {
    const prev = document.activeElement;
    const path =
      prev && prev !== document.body && focusRegions().some((r) => r.contains(prev)) ? focusPath(prev) : "";
    mutate();
    flushSync();
    if (!path || prev.isConnected) return;
    const next = focusRegions()
      .map((r) => r.querySelector(path))
      .find(Boolean);
    (next || el("results"))?.focus({ preventScroll: true });
  }
  function removeFilter(kind, value) {
    if (kind === "all") return resetFilters();
    applyFilter(() => removeDim(kind, value));
  }
  // «Alles zurücksetzen» – every filter (the view stays).
  function resetFilters() {
    applyFilter(clearFilters);
  }

  // --- Position ---------------------------------------------------------------------------------------
  // Ask the browser for the position: the Wo button and the placeholder in every row; on start only
  // silently, when the browser already allows it (never a permission prompt the visitor did not ask for).
  // The position is only used in this browser tab; it is never stored or sent anywhere.
  const hasGeo = () => typeof navigator !== "undefined" && "geolocation" in navigator;
  function locate(opts = {}) {
    const silent = Boolean(opts.silent);
    if (locating || !hasGeo()) return;
    locating = true;
    if (!silent) {
      geoText = "geo.searching"; // keys of src/i18n: the getter says them in the page's language
      geoNear = null;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locating = false;
        agenda.here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        agenda.geoDeclined = false;
        located = true;
        // Closest upcoming show (never a past one), as a link into the list.
        const near = agenda.shows
          .filter((s) => !s._past && typeof s.lat === "number")
          .map((s) => ({ s, km: distanceKm(agenda.here, s) }))
          .sort((a, b) => a.km - b.km)[0];
        if (near) {
          geoNear = {
            ...near,
            when: `${dow(near.s._day)} ${near.s._day.getDate()}.${near.s._day.getMonth() + 1}.`,
          };
          geoText = "";
        } else {
          geoNear = null;
          geoText = "geo.foundNoShow";
        }
      },
      (err) => {
        locating = false;
        // 1 = the browser (or the visitor) blocks the position: the row placeholders go, the panel says
        // how to get it back. Anything else (timeout, no fix) is transient: the row placeholders stay.
        const blocked = err && err.code === 1;
        if (blocked) agenda.geoDeclined = true;
        if (!silent) {
          geoNear = null;
          geoText = blocked ? "geo.blocked" : "geo.unavailable";
        }
        // Asked from a row: the message lives in the Wo panel (next to «Mein Standort», which it names).
        if (opts.fromRow && !openPanel) setPanel("where");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }
  // On start: silently when permission was granted before – nothing else. A browser that has never been
  // asked waits for a tap; one that said no is left alone.
  function autoLocate() {
    if (!hasGeo() || !agenda.shows.length) return;
    if (!navigator.permissions || !navigator.permissions.query) return;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((p) => {
        if (p.state === "granted") locate({ silent: true });
        else if (p.state === "denied") agenda.geoDeclined = true;
      })
      .catch(() => {});
  }

  return {
    get view() {
      return view;
    },
    get openPanel() {
      return openPanel;
    },
    get listMode() {
      return listMode;
    },
    get monthList() {
      return monthList;
    },
    get dims() {
      return dims;
    },
    get resultsText() {
      return resultsText;
    },
    get locating() {
      return locating;
    },
    get located() {
      return located;
    },
    get geoText() {
      return geoText ? t(geoText) : "";
    },
    get geoNear() {
      return geoNear;
    },
    get lastFilterAt() {
      return lastFilterAt;
    },
    hasGeo,
    monthLabel,
    rangeActive,
    quickActive,
    rangeLabel,
    pickQuick,
    toggleMonth,
    resetWhen,
    setShowPast,
    toggleCanton,
    clearCantons,
    setGenre,
    setFormat,
    setRadius,
    emptyHeadline,
    applyFilter,
    keepFocus,
    removeFilter,
    resetFilters,
    readHashOnce,
    syncFilterHash,
    applyStateHash,
    stateParams,
    histState,
    setPanel,
    togglePanel,
    closePanel,
    fitPanel,
    setView,
    scrollUnderBar,
    locate,
    autoLocate,
  };
}

export const ui = createFilterUi();
