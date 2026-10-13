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
import {
  todayStart,
  addDays,
  sameDay,
  monthStart,
  monthFmt,
  monthNameFmt,
  shortMonthFmt,
  dow,
} from "../lib/dates.js";
import { CANTONS, ABROAD, shortRegion } from "../lib/regions.js";

export const VIEWS = ["list", "calendar", "map"];

// --- Labels -----------------------------------------------------------------------------------------
export const nShows = (n) => `${n} ${n === 1 ? "Show" : "Shows"}`;
// A search term as a label (pill, offer, headline): long input is cut so nothing overflows a phone.
export const qLabel = (q) => (q.length > 24 ? `${q.slice(0, 22).trimEnd()}…` : q);
export const dm = (d) => `${d.getDate()}.${d.getMonth() + 1}.`;
// The histogram's month key «2026-10» – unpadded, the same as in the #wann= hash.
export const monthKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}`;

// Quick picks (§7 S3: Heute · Morgen · Wochenende · 7 Tage), one exclusive choice; the badge, the chips
// and the empty state name the pick rather than its dates.
export const QUICK = { today: "Heute", tomorrow: "Morgen", weekend: "Wochenende", 7: "7 Tage" };
const QUICK_EMPTY = {
  today: "Heute",
  tomorrow: "Morgen",
  weekend: "Am Wochenende",
  7: "In den nächsten 7 Tagen",
};
const QUICK_WHEN = {
  today: "heute",
  tomorrow: "morgen",
  weekend: "am Wochenende",
  7: "in den nächsten 7 Tagen",
};
const IM = new Set(["AG", "TG", "TI", "VS", "JU"]); // cantons that take «im», the rest take «in»

// Quick picks, as [from, to].
export function quickRange(kind) {
  const today = todayStart();
  const d = today.getDay(); // 0 = Sunday
  if (kind === "today") return [today, today];
  if (kind === "tomorrow") return [addDays(today, 1), addDays(today, 1)];
  if (kind === "weekend")
    return [d === 0 || d >= 5 ? today : addDays(today, 5 - d), addDays(today, (7 - d) % 7)];
  return [today, addDays(today, Number(kind) - 1)];
}

// --- Hash helpers -----------------------------------------------------------------------------------
// Filter state in the URL: #q=…&g=…&f=…&wo=ZH,BE&r=25&wann=weekend|today|7|2026-10,2026-11&past=1&view=…
// Only key=value parts and no list link (#m=…), even when combined with "&".
const STATE_HASH = /^#?[a-z]+=[^&]*(&[a-z]+=[^&]*)*$/;
export const isStateHash = (h) => STATE_HASH.test(h) && !/(^#?|&)(mine|m)=/.test(h);
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
const callout = () => (typeof window !== "undefined" ? window.jahCallout : null);
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
  // Set by Meine Shows (the list mode bypasses the filters: no pills, no hash, no counts).
  let listMode = $state(false);
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
      return picked.length > 2 ? `${picked.length} Monate` : picked.map((d) => monthLabel(d)).join(", ");
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
    if (q) out.push({ kind: "q", label: `«${qLabel(q)}»`, count: countWith({ q: "" }) });
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
    const genre = f.format ? `${genreWord ? `${genreWord}-` : ""}${FORMAT_LABEL[f.format]}` : genreWord;
    const what = q ? ` zu «${qLabel(q)}»` : "";
    // Where: «im Tessin», «in Bern, Zürich», «in 4 Kantonen», «im Umkreis von 25 km».
    const codes = [...f.cantons];
    let where = "";
    if (codes.length === 1) where = ` ${IM.has(codes[0]) ? "im" : "in"} ${shortRegion(codes[0])}`;
    else if (codes.length && codes.length <= 3) where = ` in ${codes.map(shortRegion).join(", ")}`;
    else if (codes.length) where = ` in ${codes.length} Kantonen`;
    if (agenda.here && f.radius) where += ` im Umkreis von ${f.radius} km`;
    // When: «heute», «am Wochenende», «im November», «in den gewählten Monaten», «vom 16.10. bis 20.10.».
    let when = "";
    if (quick) when = ` ${QUICK_WHEN[quick]}`;
    else if (f.months.size === 1) {
      const d = monthList.find((m) => f.months.has(monthKey(m)));
      if (d) when = ` im ${monthNameFmt.format(d)}`;
    } else if (f.months.size) when = " in den gewählten Monaten";
    else if (f.range)
      when = sameDay(f.range[0], f.range[1])
        ? ` am ${dm(f.range[0])}`
        : ` vom ${dm(f.range[0])} bis ${dm(f.range[1])}`;
    if (genre) return `Kein ${genre}${where}${when}${what}`;
    if (!where && quick) return `${QUICK_EMPTY[quick]} läuft nichts${what}`;
    return where || when || what ? `Nichts${where}${when}${what}` : "Nichts gefunden";
  }

  // «12 Shows · 1 Festival für diese Auswahl · Juli 2027 · Heute» – the footer line and the live region.
  function monthSpan(visible) {
    const first = visible[0]._day;
    const last = visible.reduce(
      (m, s) => (s._end && s._end > m ? s._end : m),
      visible[visible.length - 1]._day,
    );
    return first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()
      ? monthFmt.format(first)
      : `${monthFmt.format(first)} – ${monthFmt.format(last)}`;
  }
  const resultsText = $derived.by(() => {
    const visible = agenda.visible;
    if (agenda.loadState !== "ready" || !visible.length) return "";
    const rangeNote = rangeActive() ? ` · ${rangeLabel()}` : "";
    const nFest = visible.filter((s) => Boolean(s._end)).length;
    const nConc = visible.length - nFest;
    const festNote = nFest ? `${nConc ? " · " : ""}${nFest} ${nFest === 1 ? "Festival" : "Festivals"}` : "";
    const concerts = nConc ? nShows(nConc) : "";
    return `${concerts}${festNote}${agenda.filtered ? " für diese Auswahl" : ""} · ${monthSpan(visible)}${rangeNote}`;
  });

  // --- The hash -------------------------------------------------------------------------------------
  function filterParams() {
    const p = new URLSearchParams();
    const q = f.q.trim();
    if (q) p.set("q", q);
    if (f.genre) p.set("g", f.genre);
    if (f.format) p.set("f", f.format);
    if (f.cantons.size) p.set("wo", [...f.cantons].join(","));
    if (agenda.here && f.radius) p.set("r", String(f.radius));
    if (f.months.size)
      p.set(
        "wann",
        monthList
          .filter((d) => f.months.has(monthKey(d)))
          .map(monthKey)
          .join(","),
      );
    else if (f.range) {
      const kind = quickActive();
      if (kind) p.set("wann", kind);
    }
    if (f.showPast && !pastAuto) p.set("past", "1");
    return p.toString().replace(/%2C/g, ",");
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
    if (!isStateHash(location.hash)) return;
    const p = new URLSearchParams(location.hash.slice(1));
    f.q = (p.get("q") || "").slice(0, 80);
    const g = p.get("g") || "";
    f.genre = agenda.genres.includes(g) ? g : "";
    const fm = p.get("f") || "";
    f.format = agenda.formats.includes(fm) ? fm : "";
    const cs = new Set(f.cantons);
    for (const c of (p.get("wo") || "").split(",")) if (CANTONS[c] || ABROAD[c]) cs.add(c);
    f.cantons = cs;
    const r = Number(p.get("r"));
    if ([10, 25, 50].includes(r)) f.radius = r; // applies once the position is known
    const wann = p.get("wann") || "";
    if (QUICK[wann]) setRange(...quickRange(wann));
    else if (wann) {
      const keys = new Set(monthList.map(monthKey));
      const ms = new Set(f.months);
      for (const k of wann.split(",")) if (keys.has(k)) ms.add(k);
      f.months = ms;
      syncPast();
    }
    if (p.get("past") === "1") f.showPast = true;
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

  // --- History: overlays (the open panel) push one entry each; Back closes them. -------------------
  const histState = (extra) => ({ jah: 1, view, ...extra });
  let overlayEntry = false; // the current entry is one we pushed for an overlay
  let pendingBack = 0; // history.back() calls of our own: their popstate must not close what opened since
  let fromHistory = false; // closing because the visitor went back, not by ×/Esc/outside click
  function pushOverlay(name) {
    if (overlayEntry) history.replaceState(histState({ overlay: name }), "");
    else history.pushState(histState({ overlay: name }), "");
    overlayEntry = true;
  }
  function popOverlay() {
    if (fromHistory || !overlayEntry) return;
    overlayEntry = false;
    pendingBack++;
    history.back();
  }
  function onPopState(e) {
    if (pendingBack > 0) {
      pendingBack--;
      syncFilterHash(); // a filter picked while the panel was open lived on the entry just left
      return;
    }
    const st = e.state && e.state.jah ? e.state : null;
    fromHistory = true;
    if (openPanel) {
      // Back behaves like Escape: the focus returns to the toggle, the next Tab continues from there.
      const btn = PANELS[openPanel];
      setPanel(null);
      el(btn).focus({ preventScroll: true });
    }
    // Meine Shows keeps an overlay entry of its own; a panel entry left by Back is gone.
    overlayEntry = false;
    fromHistory = false;
    if (st && st.view && st.view !== view && !listMode) setView(st.view);
    // An entry without our state is a navigation the page did not make (a URL typed, a link tapped in
    // this tab): a state hash is applied here; a show or list link is left alone.
    if (!st) {
      if (applyStateHash()) return;
      if (location.hash && !isStateHash(location.hash)) return;
    }
    syncFilterHash();
  }

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
      pushOverlay(name);
      if (callout()) callout().suspend(); // a sticker never covers the panel's last rows
      // Keyboard and screen-reader users land in the panel, not 12 Tabs away from it.
      const first = el(PANEL_IDS[name]).querySelector(".chip:not([hidden])");
      if (first) first.focus({ preventScroll: true });
    } else if (was) popOverlay();
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
    if (opts.push) history.pushState(histState(), "", url);
    else history.replaceState(histState(), "", url);
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
    window.scrollTo({ top: underBar(target) });
    setTimeout(() => {
      if (Math.abs(window.scrollY - underBar(target)) > 2) window.scrollTo({ top: underBar(target) });
    }, 80);
  }
  // No result: the «Nichts gefunden» box takes the list's place and must come into view; else the start
  // of the results is the results row (count, view switch, pills), so a filter can be undone where it
  // was made.
  function keepInView() {
    const views = el("views");
    const status = el("status");
    const row = document.querySelector(".results-row");
    if (!views || !status) return;
    const target = views.hidden ? status : row;
    if (views.hidden && !status.textContent.trim()) return;
    const top = () => underBar(!target || target.hidden ? views : target);
    if (window.scrollY > top()) {
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
      geoText = "Suche dich …";
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
          geoText = "Standort gefunden – die Distanzen stehen jetzt bei jeder Show.";
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
          geoText = blocked
            ? "Standort im Browser blockiert. In den Website-Einstellungen freigeben, dann nochmals «Mein Standort» tippen."
            : "Standort nicht verfügbar. Kein Stress, die Agenda geht auch so.";
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
    set listMode(v) {
      listMode = v;
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
      return geoText;
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
    removeFilter,
    resetFilters,
    readHashOnce,
    syncFilterHash,
    applyStateHash,
    stateParams,
    histState,
    onPopState,
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
