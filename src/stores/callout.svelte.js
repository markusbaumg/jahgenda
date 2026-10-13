/* The callout store (story #33, M6): one sticker for every nudge on the page – install the app, subscribe
 * to the calendar, … – ported from callout.js. Same look, same place (bottom), same controls: × (snooze 30
 * days) and a quiet text button «Nie mehr zeigen» (never again) beside the real actions. Only one callout is
 * on screen at a time; the others wait their turn in the queue. Dismissals live in jahStore under
 * "callout.<id>".
 *
 * A nudge (force: false) never interrupts: it waits while the page says it is busy (the blocker: an open
 * panel or the map, a filter the visitor just touched, a deep-link landing) and steps aside when such a
 * thing opens after it appeared (suspend). One nudge per visit: once the visitor closed a nudge, the queued
 * ones stay quiet. An explicit request (force: true, a button click) is a dialog: it takes the focus, closes
 * on Escape and hands the focus back.
 *
 * Callout.svelte renders `current`; the store drives the timing (the .show class one frame after the
 * sticker is in, hidden 300 ms after it left) exactly as callout.js did. */
import { tick } from "svelte";

const SNOOZE_DAYS = 30;
const RETRY_MS = 1500;
const FADE_MS = 300; // the --t-3 exit before the host goes hidden

const store = () => window.jahStore;
const key = (id) => `callout.${id}`;
function dismissedState(id) {
  const s = store();
  const v = s ? s.get(key(id)) : null;
  if (v === "forever") return "forever";
  if (Number(v) && Date.now() - Number(v) < SNOOZE_DAYS * 86400e3) return "snoozed";
  return "";
}

export function createCallout() {
  let current = $state.raw(null); // the callout on screen: {id, title, text, actions, force}
  let hidden = $state(true); // the host's hidden attribute (stays false through the exit transition)
  let shown = $state(false); // the .show class (slide in / out)
  let labels = $state({}); // action index → replaced label («Kopiert»)
  let content = $state.raw(null); // what the sticker shows – kept through the exit transition
  let host = null; // the <aside> (Callout.svelte hands it over)
  const queue = [];
  let blocker = () => false;
  let retry = 0;
  let nudgeDone = false; // the visitor closed a nudge this visit: no further nudge
  let opener = null; // the element to give the focus back to after an explicit request
  let renderSeq = 0;

  const root = () => document.documentElement;

  async function render(c) {
    const seq = ++renderSeq;
    labels = {};
    content = c;
    current = c;
    hidden = false;
    await tick();
    if (seq !== renderSeq || current !== c || !host) return;
    // The callout floats over the page end: tell CSS how much room the footer bar needs below it.
    root().style.setProperty("--callout-h", `${host.offsetHeight + 12}px`);
    document.body.classList.add("has-banner");
    requestAnimationFrame(() => {
      if (current === c) shown = true;
    });
    if (c.force) {
      opener = document.activeElement;
      const first = host.querySelector(".callout-btn") || host;
      first.focus({ preventScroll: true });
    }
  }

  function hideHost() {
    shown = false;
    root().style.removeProperty("--callout-h");
    document.body.classList.remove("has-banner");
    setTimeout(() => {
      if (!current) hidden = true;
    }, FADE_MS);
  }

  function close(how) {
    if (!current) return;
    const { id, force } = current;
    const s = store();
    if (s && how === "forever") s.set(key(id), "forever");
    else if (s && how === "snooze") s.set(key(id), Date.now());
    if (!force && how !== "done") nudgeDone = true;
    // The focus never vanishes with the callout: back to the opener (explicit request) or – a nudge closed
    // from the keyboard – to the agenda, so the next Tab does not restart at the top of the page. Decided
    // before `current` goes: the buttons leave the DOM with it.
    const hadFocus = host && host.contains(document.activeElement);
    current = null;
    hideHost();
    if (hadFocus) {
      const back = force && opener && opener.isConnected ? opener : document.getElementById("views");
      if (back) back.focus({ preventScroll: true });
    }
    opener = null;
    setTimeout(next, FADE_MS);
  }

  function next() {
    if (current) return;
    const c = queue[0];
    if (!c) return;
    if (dismissedState(c.id) && !c.force) {
      queue.shift();
      return next();
    }
    if (!c.force && nudgeDone) {
      // The visitor closed a nudge this visit: the queued ones stay quiet.
      queue.shift();
      return next();
    }
    if (!c.force && blocker()) {
      // Not now: the page is busy – another look in a moment.
      if (!retry) retry = setTimeout(() => ((retry = 0), next()), RETRY_MS);
      return;
    }
    queue.shift();
    render(c);
  }

  // A tap on an action (Callout.svelte): its own handler first, «Nie mehr zeigen» records the dismissal.
  function act(idx, el) {
    if (!current) return;
    if (idx === "never") return close("forever");
    const action = current.actions[idx];
    if (action && action.onClick) action.onClick(close, el);
  }

  return {
    get current() {
      return current;
    },
    /** The callout the sticker renders: the current one, or the last one while it slides away. */
    get content() {
      return content;
    },
    get hidden() {
      return hidden;
    },
    get shown() {
      return shown;
    },
    get labels() {
      return labels;
    },
    /** Callout.svelte registers its <aside>. */
    setHost(el) {
      host = el;
    },
    /** Queue a callout: {id, title, text (HTML), actions:[{label, href?, external?, onClick?(close, el), primary?, title?}], force?}.
     * title, text, label and an action's title may be thunks (() => t("…")): Callout.svelte resolves them
     * while rendering, so an open sticker follows a language switch. */
    show(c) {
      if (!c || !c.id) return;
      if (!c.force && dismissedState(c.id)) return;
      if (current && current.id === c.id) return;
      if (c.force && current) {
        // An explicit request (button click) replaces whatever nudge is showing; the nudge is re-queued.
        queue.unshift(current);
        current = null;
        shown = false;
        hidden = true;
        root().style.removeProperty("--callout-h");
        document.body.classList.remove("has-banner");
      }
      queue.unshift(c);
      next();
    },
    /** Close the visible callout without recording a dismissal (e.g. the action succeeded). */
    hide() {
      close("done");
    },
    /** Close the visible callout: "snooze" (×, Escape, swipe), "forever" or "done". */
    close,
    /** The page got busy (panel, map …): a visible nudge steps aside and comes back later. */
    suspend() {
      if (!current || current.force) return;
      queue.unshift(current);
      current = null;
      hideHost();
      next();
    },
    /** The page tells when a nudge must wait (returns true while the page is busy). */
    setBlocker(fn) {
      blocker = typeof fn === "function" ? fn : () => false;
    },
    /** A new label (string or thunk) for one action button of the visible callout («Adresse kopieren» → «Kopiert»). */
    relabel(idx, text) {
      labels = { ...labels, [idx]: text };
    },
    act,
    isDismissed: (id) => Boolean(dismissedState(id)),
  };
}

export const callout = createCallout();
