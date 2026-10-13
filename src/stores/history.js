/* History and scroll restoration (story #33, M6; was the «History» section of app.js).
 *
 * The Back button (or swipe) closes an open Wo/Wann panel and Meine Shows, and returns from a view switch
 * or a calendar/map → list jump, instead of leaving the site – the reflex on phones. Overlays and view
 * switches push one entry each; filters never do (they live in the hash, written with replaceState so a
 * filter click does not flood the history).
 *
 * Every entry the page writes carries { jah: 1, view, overlay?, sy? }. The areas plug in:
 *   nav.setView(() => view)                          the view the entries record
 *   nav.registerOverlay("where", { isOpen, close })  a panel: Back closes it (close(state) runs with
 *                                                    nav.fromHistory true, so it must not call popOverlay)
 *   nav.registerOverlay("mine", { isOpen, close, keepOnOwnEntry: true })
 *                                                    Meine Shows: stays open when the entry landed on is
 *                                                    its own (returning from a view switch made inside it)
 *   nav.on("view", (view) => …)                      an entry of ours with another view: switch to it
 *                                                    (not in the list mode)
 *   nav.on("foreign", () => stop?)                   an entry the page did not write (a URL typed, a link
 *                                                    tapped in this tab): apply a state hash; return true
 *                                                    when a show or list link is left to the hashchange
 *   nav.on("settle", () => …)                        after every Back: syncFilterHash()
 *   nav.on("ownBack", () => …)                       after our own history.back() (popOverlay): a filter
 *                                                    picked while the panel was open lived on the entry
 *                                                    just left – syncFilterHash()
 * and call nav.pushOverlay(name) when an overlay opens, nav.popOverlay() when it closes by ×/Esc/outside
 * click, nav.pushView(url) / nav.replaceView(url) for the view switch and nav.pushJump(url) for a
 * calendar pill or map popup that jumps to a row in the list.
 *
 * Scroll: reload, tab restore (iOS evicts tabs freely) and Back from log.html. Left to the browser, the
 * scroll offset is restored into the skeleton page (clamped to its bottom, footer in view) and scroll
 * anchoring then keeps the footer in view while the list is inserted above it – the visitor lands in April.
 * So the offset travels in the history entry (written when the scrolling stops and when the page goes
 * away) and is restored after the first render (nav.restoreScroll), before a show link (if any) takes over.
 *
 * Plain JS (no runes): the window is injectable, so tests/history.test.mjs runs it in node. */

export function createNav(win = typeof window === "undefined" ? null : window) {
  const hooks = { view: [], foreign: [], settle: [], ownBack: [] };
  const overlays = new Map(); // name → { isOpen, close, keepOnOwnEntry }
  let viewOf = () => "list";
  let overlayEntry = false; // the current entry is one we pushed for an overlay
  let pendingBack = 0; // history.back() calls of our own: their popstate must not close what opened since
  let fromHistory = false; // closing because the visitor went back, not by ×/Esc/outside click
  let savedScrollY = 0;
  let started = false;
  let scrollMemo = 0;

  const h = () => win.history;
  const state = (extra) => ({ jah: 1, view: viewOf(), ...extra });

  function rememberScroll() {
    const st = h().state;
    const y = Math.round(win.scrollY);
    if (!st || !st.jah || st.sy === y) return;
    try {
      h().replaceState({ ...st, sy: y }, "");
    } catch {
      /* Safari caps replaceState at 100 per 30 s – then the last written offset stands */
    }
  }

  function onPop(e) {
    if (pendingBack > 0) {
      pendingBack--;
      for (const fn of hooks.ownBack) fn();
      return;
    }
    const st = e.state && e.state.jah ? e.state : null;
    fromHistory = true;
    let keep = false;
    try {
      // Back behaves like Escape for whatever is open; an overlay whose own entry this is stays.
      for (const [name, o] of overlays) {
        if (!o.isOpen()) continue;
        if (o.keepOnOwnEntry && st && st.overlay === name) keep = true;
        else o.close(st);
      }
    } finally {
      fromHistory = false;
    }
    overlayEntry = keep;
    if (st && st.view) for (const fn of hooks.view) fn(st.view);
    // An entry without our state is a navigation the page did not make: a state hash is applied there; a
    // show or list link is left for the hashchange that follows instead of being written over.
    if (!st && hooks.foreign.some((fn) => fn() === true)) return;
    for (const fn of hooks.settle) fn();
  }

  return {
    /** Take over the history: manual scroll restoration, our state on the entry, the listeners. Once. */
    start() {
      if (started || !win) return;
      started = true;
      if ("scrollRestoration" in h()) h().scrollRestoration = "manual";
      const st = h().state;
      savedScrollY = st && st.jah ? Number(st.sy) || 0 : 0;
      h().replaceState(state(), "");
      // Written once the scrolling stops (a reload discards what pagehide writes) and when the tab goes away.
      win.addEventListener(
        "scroll",
        () => {
          clearTimeout(scrollMemo);
          scrollMemo = setTimeout(rememberScroll, 400);
        },
        { passive: true },
      );
      win.addEventListener("pagehide", rememberScroll);
      win.document.addEventListener("visibilitychange", () => {
        if (win.document.visibilityState === "hidden") rememberScroll();
      });
      win.addEventListener("popstate", onPop);
    },
    /** The current view, recorded on every entry the page writes. */
    setView(fn) {
      viewOf = typeof fn === "function" ? fn : () => "list";
    },
    registerOverlay(name, o) {
      overlays.set(name, { keepOnOwnEntry: false, ...o });
    },
    on(kind, fn) {
      hooks[kind].push(fn);
      return () => (hooks[kind] = hooks[kind].filter((f) => f !== fn));
    },
    /** True while a Back closes things (an overlay's close must then not pop the entry again). */
    get fromHistory() {
      return fromHistory;
    },
    /** Run fn as if Back closed it: e.g. the list mode folding a panel away takes over the panel's entry. */
    quietly(fn) {
      const was = fromHistory;
      fromHistory = true;
      try {
        return fn();
      } finally {
        fromHistory = was;
      }
    },
    /** An overlay opened: one entry (an open overlay's entry is taken over). */
    pushOverlay(name) {
      if (overlayEntry) h().replaceState(state({ overlay: name }), "");
      else h().pushState(state({ overlay: name }), "");
      overlayEntry = true;
    },
    /** An overlay closed by ×, Escape or a click outside: its entry goes too (one Back then leaves). */
    popOverlay() {
      if (fromHistory || !overlayEntry) return;
      overlayEntry = false;
      pendingBack++;
      h().back();
    },
    /** The view switch: an entry of its own (push) or the current one rewritten (url undefined = keep). */
    pushView(url) {
      h().pushState(state(), "", url);
    },
    replaceView(url) {
      h().replaceState(state(), "", url);
    },
    /** A calendar pill or map popup jumps to a row in the list: Back returns to the calendar or the map. */
    pushJump(url) {
      h().pushState(state({ view: "list" }), "", url);
    },
    /** After the first render: back to the rows the visitor was looking at – unless a show or list link
     * takes over. Returns true when it scrolled (the scroll is the page's, not the visitor's). */
    restoreScroll({ id = "", mine = "" } = {}) {
      const y = savedScrollY;
      savedScrollY = 0;
      if (!y || id || mine) return false;
      win.scrollTo(0, y);
      return true;
    },
  };
}

export const nav = createNav();
