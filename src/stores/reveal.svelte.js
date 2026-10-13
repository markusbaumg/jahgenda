/* Deep links to one show (#<short hash or id>, §7 S6), ported from app.js revealFromHash() / keepRevealed()
 * / noteLink(). The row is scrolled under the sticky bar, highlighted (gold rule + flash), its line-up
 * opened and focused; filters that hide it are cleared, a past show brings the past ones in. A stale or
 * mistyped link says so in the link note instead of silently showing everything.
 *
 * #m=… (a shared list) and #view=… belong to Meine Shows and the view switch; a filter hash (#q=…&wo=…)
 * is no show link either. */
import { tick, untrack } from "svelte";
import { agenda } from "./agenda.svelte.js";
import { parseHash } from "../lib/index.js";
import { lineups } from "./festival.svelte.js";

// The filters as one comparable string: the highlight belongs to the render the link landed on and goes
// with the next filter change (in app.js the next render rebuilt the rows without it).
const filterSig = () => {
  const f = agenda.filters;
  return JSON.stringify([
    f.q.trim(),
    [...f.cantons],
    f.radius,
    f.genre,
    f.format,
    [...f.months],
    f.range && f.range.map(Number),
  ]);
};

export const reveal = $state({
  id: "", // the highlighted show
  sig: "", // filterSig() at the landing
  note: "", // «Diese Show ist nicht mehr in der Agenda …»
  until: 0, // a re-render before this time scrolls to the row again (rows above may still shift)
});

export const highlighted = () => (reveal.id && reveal.sig === filterSig() ? reveal.id : "");

// The show id in the hash, if the hash names one (not a list, not a filter state, not the view only).
function hashShowId(hash = location.hash) {
  const h = parseHash(hash);
  if (h.mine || !h.id || h.id.includes("=")) return "";
  return h.id;
}

function clearFilters() {
  const f = agenda.filters;
  f.q = "";
  f.cantons = new Set();
  f.radius = 0;
  f.genre = "";
  f.format = "";
  f.months = new Set();
  f.range = null;
}

export async function revealFromHash() {
  if (agenda.loadState !== "ready") return;
  const token = hashShowId();
  if (!token) return;
  const target = agenda.findShow(token);
  if (!target) {
    // An in-page anchor (the skip links, «Nach oben») is no show link.
    if (document.getElementById(token)) return;
    reveal.note = "link.stale"; // a key of src/i18n (LinkNote.svelte says it)
    history.replaceState(history.state, "", location.pathname + location.search);
    return;
  }
  reveal.note = "";
  if (target._past && !agenda.filters.showPast) agenda.filters.showPast = true;
  if (!agenda.isVisible(target)) clearFilters();
  reveal.id = ""; // restart the flash on a second landing on the same row
  await tick();
  const row = document.getElementById(target.id);
  if (!row) return;
  reveal.id = target.id;
  reveal.sig = filterSig();
  reveal.until = Date.now() + 3000;
  lineups.open(target.id); // a shared link lands on the open line-up
  await tick();
  const motion = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  row.scrollIntoView({ block: "start", behavior: motion });
  row.tabIndex = -1;
  row.focus({ preventScroll: true }); // the next Tab starts at the show, screen readers announce it
}

// A re-render in the seconds after the jump (venues.web.json arrived, the position came in) may shift the
// rows above: scroll to the row again, so it does not end up under the sticky bar.
export async function keepRevealed() {
  if (!reveal.id || Date.now() >= reveal.until) return;
  await tick();
  const row = document.getElementById(reveal.id);
  if (row) row.scrollIntoView({ block: "start" });
}

// Wire it up once: on hashchange, and after every successful load.
let wired = false;
export function initReveal() {
  if (wired) return;
  wired = true;
  window.addEventListener("hashchange", revealFromHash);
  $effect.root(() => {
    // Every successful load (the first one, a retry) lands on the linked show.
    $effect(() => {
      if (agenda.loadState === "ready") untrack(revealFromHash);
    });
    $effect(() => {
      // Tracked: what re-renders the rows without a filter change.
      void agenda.venueSites;
      void agenda.here;
      void agenda.visible;
      untrack(keepRevealed);
    });
  });
}
