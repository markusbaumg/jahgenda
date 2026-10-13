// The Back-button contract of src/stores/history.js (story #33, M6), run against a fake window: overlays
// push one entry each, ×/Esc pops it again (one Back then leaves), Back closes what is open, Meine Shows
// survives a Back onto its own entry, the view travels on the entries, and the scroll offset is restored.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createNav } from "../src/stores/history.js";

function fakeWindow() {
  const listeners = {};
  const entries = [{ state: null, url: "/" }];
  let i = 0;
  const win = {
    scrollY: 0,
    scrolled: [],
    addEventListener: (t, fn) => (listeners[t] = listeners[t] || []).push(fn),
    scrollTo: (x, y) => win.scrolled.push(y),
    document: { visibilityState: "visible", addEventListener: () => {} },
    history: {
      scrollRestoration: "auto",
      get state() {
        return entries[i].state;
      },
      get length() {
        return entries.length;
      },
      pushState(state, _t, url) {
        entries.splice(i + 1);
        entries.push({ state: structuredClone(state), url: url ?? entries[i].url });
        i++;
      },
      replaceState(state, _t, url) {
        entries[i] = { state: structuredClone(state), url: url ?? entries[i].url };
      },
      back() {
        if (i === 0) return;
        i--;
        // The browser fires popstate asynchronously; synchronously is enough for the contract here.
        for (const fn of listeners.popstate || []) fn({ state: entries[i].state });
      },
    },
    get index() {
      return i;
    },
    entries,
  };
  return win;
}

test("a panel pushes one entry; Back closes it and stays on the page", () => {
  const win = fakeWindow();
  const nav = createNav(win);
  nav.start();
  assert.equal(win.history.scrollRestoration, "manual");
  let open = false;
  const closed = [];
  nav.registerOverlay("where", { isOpen: () => open, close: () => ((open = false), closed.push("where")) });
  open = true;
  nav.pushOverlay("where");
  assert.equal(win.entries.length, 2);
  assert.deepEqual(win.history.state, { jah: 1, view: "list", overlay: "where" });
  win.history.back();
  assert.equal(open, false);
  assert.deepEqual(closed, ["where"]);
  assert.equal(win.index, 0);
});

test("closing with × pops the entry again, without closing what opened since", () => {
  const win = fakeWindow();
  const nav = createNav(win);
  nav.start();
  let open = false;
  let settled = 0;
  let ownBack = 0;
  nav.registerOverlay("when", { isOpen: () => open, close: () => assert.fail("not a Back") });
  nav.on("settle", () => settled++);
  nav.on("ownBack", () => ownBack++);
  open = true;
  nav.pushOverlay("when");
  open = false;
  nav.popOverlay();
  assert.equal(win.index, 0); // one Back now leaves
  assert.equal(ownBack, 1);
  assert.equal(settled, 0);
  nav.popOverlay(); // nothing pushed any more: no second back()
  assert.equal(win.index, 0);
});

test("a second overlay takes over the first one's entry", () => {
  const win = fakeWindow();
  const nav = createNav(win);
  nav.start();
  nav.pushOverlay("where");
  nav.pushOverlay("mine");
  assert.equal(win.entries.length, 2);
  assert.equal(win.history.state.overlay, "mine");
});

test("Back while closing from history never pops twice", () => {
  const win = fakeWindow();
  const nav = createNav(win);
  nav.start();
  let open = true;
  nav.registerOverlay("where", {
    isOpen: () => open,
    close: () => {
      open = false;
      assert.equal(nav.fromHistory, true);
      nav.popOverlay(); // what setPanel(null) does – must be a no-op here
    },
  });
  nav.pushOverlay("where");
  win.entries.push({ state: null, url: "/" }); // a forward entry the extra back() would reveal
  win.history.back();
  assert.equal(win.index, 0);
  assert.equal(open, false);
});

test("Meine Shows stays open on its own entry and closes on the one before", () => {
  const win = fakeWindow();
  let view = "list";
  const nav = createNav(win);
  nav.setView(() => view);
  nav.start();
  let mine = true;
  const views = [];
  nav.registerOverlay("mine", { isOpen: () => mine, close: () => (mine = false), keepOnOwnEntry: true });
  nav.on("view", (v) => {
    views.push(v);
    view = v;
  });
  nav.pushOverlay("mine");
  view = "calendar";
  nav.pushView("#view=calendar");
  win.history.back(); // back onto the ★ entry (view list): the list stays
  assert.equal(mine, true);
  assert.deepEqual(views, ["list"]);
  win.history.back(); // back before the ★: the list closes
  assert.equal(mine, false);
});

test("a calendar pill jump is an entry of its own; Back returns to the calendar", () => {
  const win = fakeWindow();
  let view = "calendar";
  const nav = createNav(win);
  nav.setView(() => view);
  nav.start();
  const views = [];
  nav.on("view", (v) => views.push(v));
  nav.pushJump("#k3f9zq");
  assert.deepEqual(win.history.state, { jah: 1, view: "list" });
  assert.equal(win.entries[1].url, "#k3f9zq");
  win.history.back();
  assert.deepEqual(views, ["calendar"]);
});

test("an entry the page did not write goes to the foreign hook; true stops before settle", () => {
  const win = fakeWindow();
  const nav = createNav(win);
  nav.start();
  let settled = 0;
  let stop = true;
  nav.on("foreign", () => stop);
  nav.on("settle", () => settled++);
  win.entries.unshift({ state: null, url: "/#abc" }); // a link tapped in this tab before
  win.history.pushState({ jah: 1, view: "list" }, "");
  // Move to index 1 (our entry) and go back onto the foreign one.
  win.history.back();
  assert.equal(settled, 0);
  stop = false;
  win.history.pushState({ jah: 1, view: "list" }, "");
  win.history.back();
  assert.equal(settled, 1);
});

test("the scroll offset travels in the entry and is restored once, not under a show link", () => {
  const win = fakeWindow();
  win.entries[0].state = { jah: 1, view: "list", sy: 1234 };
  const nav = createNav(win);
  nav.start();
  assert.equal(nav.restoreScroll({ id: "k3f9zq" }), false);
  assert.deepEqual(win.scrolled, []);
  const win2 = fakeWindow();
  win2.entries[0].state = { jah: 1, view: "list", sy: 1234 };
  const nav2 = createNav(win2);
  nav2.start();
  assert.equal(nav2.restoreScroll({}), true);
  assert.deepEqual(win2.scrolled, [1234]);
  assert.equal(nav2.restoreScroll({}), false); // once
});
