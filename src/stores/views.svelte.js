/* The views store (story #33 M4): Liste | Kalender | Karte. The chosen view itself – remembered in
 * jahStore, written into the hash as #view=calendar|map next to the filters, a history entry per switch
 * and Back – belongs to the filter store (ui.view / ui.setView, M1), which owns the hash; this store adds
 * what only the views need: the calendar's month and selected day, the list mode that forces the list, the
 * jump from a calendar pill or a map popup to the show's row in the list (#<short hash>, an entry of its
 * own), and the Leaflet preload when the map is the remembered view. */
import { agenda } from "./agenda.svelte.js";
import { ui, VIEWS } from "./filters.svelte.js";
import { revealFromHash } from "./reveal.svelte.js";
import { quietScroll } from "../components/views/scroll.js";

export { VIEWS };
// Leaflet 1.9.4 from unpkg: pinned by hash, so a tampered CDN copy never runs (and never gets cached).
export const LEAFLET = "https://unpkg.com/leaflet@1.9.4/dist/leaflet";
export const LEAFLET_SRI = {
  js: "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=",
  css: "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=",
};

export function createViews() {
  let calMonth = $state.raw(null); // first day of the month on display (null: today's month)
  let calDay = $state(""); // selected day (YYYY-MM-DD) for the compact layout ("" = the default)
  // The list mode (★ Meine Shows / a shared list) always shows the list; the stored view returns on close.
  const current = $derived(ui.listMode ? "list" : ui.view);

  // Calendar pills and map popups link to the show's row in the list – with the same short hash the
  // share links use, as a history entry of its own (Back returns to the calendar or the map). The landing
  // itself (past shows on, highlight, line-up open, scroll, focus) is the deep link's (reveal.svelte.js).
  function goToShow(id) {
    const s = agenda.shows.find((x) => x.id === id);
    if (!s) return;
    history.pushState(ui.histState({ view: "list" }), "", `#${s._short}`);
    ui.setView("list");
    quietScroll(2000);
    revealFromHash();
  }

  let started = false;
  function start() {
    if (started) return;
    started = true;
    // The map is the remembered view: fetch Leaflet now, in parallel with the data, not after it.
    if (ui.view === "map") {
      const l = document.createElement("link");
      l.rel = "preload";
      l.as = "script";
      l.href = `${LEAFLET}.js`;
      l.integrity = LEAFLET_SRI.js;
      l.crossOrigin = "";
      document.head.appendChild(l);
    }
  }

  return {
    get view() {
      return ui.view;
    },
    get current() {
      return current;
    },
    get forceList() {
      return ui.listMode;
    },
    set forceList(v) {
      ui.listMode = v;
    },
    get calMonth() {
      return calMonth;
    },
    set calMonth(v) {
      calMonth = v;
    },
    get calDay() {
      return calDay;
    },
    set calDay(v) {
      calDay = v;
    },
    histState: (extra) => ui.histState(extra),
    setView: (next, opts) => ui.setView(next, opts),
    goToShow,
    start,
  };
}

export const views = createViews();
