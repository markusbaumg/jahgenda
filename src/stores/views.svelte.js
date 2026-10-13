/* The views store (story #33 M4): Liste | Kalender | Karte. Ported from the «Views» and «History» parts
 * of app.js: the chosen view (remembered in jahStore, written into the hash as #view=calendar|map next to
 * the filters, nothing for the list), a history entry per switch so Back returns from it, the calendar's
 * month and selected day, and the jump from a calendar pill or a map popup to the show's row in the list
 * (#<short hash>, an entry of its own). */
import { flushSync, tick } from "svelte";
import { parseHash } from "../lib/hash.js";
import { agenda } from "./agenda.svelte.js";
import { scrollViewsUnderBar, quietScroll } from "../components/views/scroll.js";

export const VIEWS = ["list", "calendar", "map"];
// Leaflet 1.9.4 from unpkg: pinned by hash, so a tampered CDN copy never runs (and never gets cached).
export const LEAFLET = "https://unpkg.com/leaflet@1.9.4/dist/leaflet";
export const LEAFLET_SRI = {
  js: "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=",
  css: "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=",
};

// The filter state hash (#q=…&g=…&view=map): key=value parts only and no list link (#m=…).
const STATE_HASH = /^#?[a-z]+=[^&]*(&[a-z]+=[^&]*)*$/;
export const isStateHash = (h) => STATE_HASH.test(h) && !/(^#?|&)(mine|m)=/.test(h);

const jahStore = () => (typeof window !== "undefined" ? window.jahStore : null);
const callout = () => window.jahCallout;
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function createViews() {
  // #view= in the link wins over the view this browser remembers.
  const stored = jahStore() ? jahStore().get(jahStore().KEYS.VIEW, "list") : "list";
  let view = $state(parseHash(location.hash, VIEWS).view || (VIEWS.includes(stored) ? stored : "list"));
  // The list mode (★ Meine Shows / a shared list) always shows the list; the stored view returns on close.
  let forceList = $state(false);
  let calMonth = $state.raw(null); // first day of the month on display (null: today's month)
  let calDay = $state(""); // selected day (YYYY-MM-DD) for the compact layout ("" = the default)
  const current = $derived(forceList ? "list" : view);

  const histState = (extra) => ({ jah: 1, view, ...extra });

  // The hash with the view part set (a state hash keeps its filter parts); undefined while a show or list
  // link holds the hash – that one stays as it is.
  function viewUrl() {
    const h = location.hash;
    if (agenda.loadState !== "ready" || (h && !isStateHash(h))) return undefined;
    const p = new URLSearchParams(h.replace(/^#/, ""));
    p.delete("view");
    if (view !== "list") p.set("view", view);
    const s = p.toString().replace(/%2C/g, ",");
    return s ? `#${s}` : location.pathname + location.search;
  }

  function setView(next, opts = {}) {
    if (!VIEWS.includes(next)) return;
    view = next;
    if (jahStore()) jahStore().set(jahStore().KEYS.VIEW, view);
    const url = viewUrl();
    if (opts.push) history.pushState(histState(), "", url);
    else history.replaceState({ ...(history.state || {}), ...histState() }, "", url);
    if (callout() && opts.push) {
      callout().suspend(); // a nudge steps aside (the map must stay tappable)
      callout().hide(); // a callout opened on purpose closes with the view it belonged to
    }
    // A switch to the calendar or the map brings that view up under the bar (on a phone it would
    // otherwise start two thirds down the screen, behind the hero).
    if (opts.push && next !== "list") tick().then(scrollViewsUnderBar);
  }

  // Calendar pills and map popups link to the show's row in the list – with the same short hash the
  // share links use, as a history entry of its own (Back returns to the calendar or the map).
  function goToShow(id) {
    const s = agenda.shows.find((x) => x.id === id);
    if (!s) return;
    history.pushState(histState({ view: "list" }), "", `#${s._short}`);
    reveal(s);
  }

  // Scroll to a show's row in the list and highlight it (the list branch of revealFromHash).
  function reveal(s) {
    if (s._past && !agenda.filters.showPast) agenda.filters.showPast = true;
    if (view !== "list") setView("list");
    flushSync();
    const row = document.getElementById(s.id);
    if (!row) return;
    row.classList.remove("highlight");
    void row.offsetWidth; // restart the animation
    row.classList.add("highlight");
    const lineup = row.querySelector("details.lineup");
    if (lineup && !lineup.open) {
      lineup.open = true;
      lineup.classList.add("is-open");
    }
    quietScroll(2000);
    row.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
    row.tabIndex = -1;
    row.focus({ preventScroll: true }); // the next Tab starts at the show, screen readers announce it
  }

  // Back / Forward: an entry of ours carries its view; an entry without our state (a URL typed, a link
  // tapped in this tab) takes the view from a state hash.
  function onPopState(e) {
    const st = e.state && e.state.jah ? e.state : null;
    if (forceList) return;
    if (st && st.view && st.view !== view) setView(st.view);
    else if (!st && (!location.hash || isStateHash(location.hash))) {
      const v = parseHash(location.hash, VIEWS).view || "list";
      if (v !== view) setView(v);
    }
  }
  function onHashChange() {
    const v = parseHash(location.hash, VIEWS).view;
    if (v && v !== view && !forceList) setView(v);
  }

  let started = false;
  function start() {
    if (started) return;
    started = true;
    history.replaceState({ ...(history.state || {}), ...histState() }, "");
    window.addEventListener("popstate", onPopState);
    window.addEventListener("hashchange", onHashChange);
    // The map is the remembered view: fetch Leaflet now, in parallel with the data, not after it.
    if (view === "map") {
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
      return view;
    },
    get current() {
      return current;
    },
    get forceList() {
      return forceList;
    },
    set forceList(v) {
      forceList = v;
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
    histState,
    setView,
    goToShow,
    reveal,
    start,
  };
}

export const views = createViews();
