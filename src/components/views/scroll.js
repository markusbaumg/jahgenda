/* Scrolling, focus and the scoped view transition around list changes (story #33 M4), ported from app.js
 * render() / renderAndKeepInView() / keepInView() / scrollUnderBar(). Plain DOM helpers: the components
 * change state, these keep the visitor's place – the results under the sticky bar, the focus never on
 * <body>, the rows cross-fading (only #list is a named view transition, see style.css). */
import { flushSync } from "svelte";

const el = (id) => document.getElementById(id);
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// A scroll the page made itself (deep link, view switch, a day picked in the calendar) is not the
// visitor's: the subscribe nudge waits for a scroll of their own.
let quietUntil = 0;
export const quietScroll = (ms) => {
  quietUntil = Math.max(quietUntil, Date.now() + ms);
};
export const isQuietScroll = () => Date.now() < quietUntil;

// The bar's height is frozen in CSS (--bar-h); the target starts 8 px under it.
const barHeight = () => (el("filters") ? el("filters").offsetHeight : 0);
const underBar = (elm) => elm.getBoundingClientRect().top + window.scrollY - barHeight() - 8;

// Scroll down (never up) until the target (the views, or the Meine-Shows panel above them) starts right
// under the bar. The bar grows by a row once it sticks, so the target is checked again a moment later.
export function scrollUnderBar(target) {
  const views = el("views");
  if (!target || !views || views.hidden || window.scrollY >= underBar(target)) return;
  quietScroll(1500);
  window.scrollTo({ top: underBar(target) });
  setTimeout(() => {
    if (Math.abs(window.scrollY - underBar(target)) > 2) window.scrollTo({ top: underBar(target) });
  }, 80);
}
export const scrollViewsUnderBar = () => scrollUnderBar(el("views"));

// After filtering, the list may get shorter than the current scroll position: jump back to the start of
// the results (the results row with the count, the view switch and the pills; the «Nichts gefunden» box
// when there is no result; the list actions in the list mode).
export function keepInView() {
  const views = el("views");
  const status = el("status");
  if (!views) return;
  const resultsRow = document.querySelector(".results-row");
  const minePanel = el("mine-panel");
  const listMode = document.body.classList.contains("list-mode");
  const target = views.hidden ? status : listMode ? minePanel : resultsRow || views;
  if (!target || (views.hidden && !status.textContent.trim())) return;
  const top = () => underBar(target.hidden ? views : target);
  if (window.scrollY > top()) {
    quietScroll(1000);
    window.scrollTo({ top: top() });
    setTimeout(() => {
      if (window.scrollY > top()) window.scrollTo({ top: top() });
    }, 80);
  }
}

// Focus (§5): what had the focus inside a region that a change rebuilds is found again by its place – the
// row's data-id (or the calendar day) plus its own tag, classes and data attributes (data-act, data-state,
// data-canton, data-view, data-remove …). Gone for good → #results (tabindex=-1), else #views, so a
// keyboard user never lands on <body> after a filter.
const focusRegions = () => ["views", "status", "results"].map(el).filter(Boolean);
function focusPath(a) {
  const part = (n, withClasses) => {
    let s = n.tagName.toLowerCase();
    if (withClasses)
      for (const c of n.classList) if (c !== "fb-on" && !/^svelte-/.test(c)) s += `.${CSS.escape(c)}`;
    for (const { name, value } of n.attributes)
      if (name.startsWith("data-")) s += `[${name}="${CSS.escape(value)}"]`;
    return s;
  };
  const scope = a.closest("[data-id], [data-day]");
  return (scope && scope !== a ? `${part(scope, false)} ` : "") + part(a, true);
}
export function keepFocus(change) {
  const prev = document.activeElement;
  const path =
    prev && prev !== document.body && focusRegions().some((r) => r.contains(prev)) ? focusPath(prev) : "";
  change();
  flushSync();
  if (!path || prev.isConnected) return;
  const next = focusRegions()
    .map((r) => r.querySelector(path))
    .find(Boolean);
  (next || el("results") || el("views")).focus({ preventScroll: true });
}

// A list change (filter tap, search, Meine Shows): the swap runs inside a view transition where the
// browser has one (a --t-2 cross-fade of #list only; the rows then enter staggered); elsewhere #list dips
// in opacity over --t-2. `after` runs once the new DOM is in (the transition's callback is asynchronous),
// e.g. a scroll to a panel that only exists after the change.
export function changeList(change, after) {
  const swap = () => keepFocus(change);
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
