/* Meine Shows (§7 S5, story #33 M3), ported from the «Meine Shows» and «Listenmodus» sections of app.js.
 *
 * - The star is Merken on / off; the state «Interessiert | Ich gehe» is a separate two-segment toggle
 *   inside every marked row – nothing cycles, so a tap never un-marks by accident. A long press on the
 *   star is the shortcut straight to «Ich gehe» (with the echo). Un-marking shows a toast with
 *   Rückgängig (8 s, the clock stops while it is hovered or focused).
 * - Marks live only in this browser (jahStore, key MARKS); without storage they last for the page view.
 * - The list mode: ★ in the toolbar shows only the own list, a #m=<short><g|i>,…[,von:<Name>] link shows a
 *   friend's list (old form #mine=<id>:<g|i>,… still accepted). The filters are bypassed, not cleared:
 *   search, Wo, genre, Wann and the view come back 1:1 on close (✕ «Zurück zur Agenda», Esc, Back, ★).
 *   The agenda store renders exactly the list (agenda.setListSource), the filter store sees ui.listMode.
 * - The list panel: Kalender (.ics) · Teilen · Link, and «Alle merken» for a friend's list. */
import { flushSync, tick } from "svelte";
import { agenda } from "./agenda.svelte.js";
import { ui, parseHash } from "./filters.svelte.js";
import { nav } from "./history.js";
import { callout } from "./callout.svelte.js";
import { live } from "./live.svelte.js";
import { reveal } from "./reveal.svelte.js";
import { vevent, icsWrap } from "../lib/index.js";
import { parseListHash, takeAllMarks } from "../lib/state-hash.js";
import { dayShort } from "../lib/dates.js";
import { showUrl, downloadIcs } from "../lib/actions.js";
import { ID, byId as el, starOf } from "../lib/dom.js";
import { copyText, shareOr, waLink } from "../lib/share.js";
import { FLASH_MS } from "./feedback.svelte.js";
import { t } from "../i18n/core.js";

// Getters: the words follow the page's language (src/i18n).
export const MARK_LABEL = {
  get ""() {
    return t("mark.label");
  },
  get interested() {
    return t("mark.labelInterested");
  },
  get going() {
    return t("mark.labelGoing");
  },
};
// Tooltip of the star button: what a click does.
export const MARK_TITLE = {
  get ""() {
    return t("mark.title");
  },
  get interested() {
    return t("mark.unmark");
  },
  get going() {
    return t("mark.unmark");
  },
};
export const STATE_WORD = {
  get interested() {
    return t("row.interested");
  },
  get going() {
    return t("row.going");
  },
};
export const UNDO_MS = 8000;
export const LONG_PRESS = 500;

const jah = () => (typeof window !== "undefined" ? window.jahStore : null);
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
// Write a hash without a navigation (empty = none); path and query stay as they are.
const setHash = (h) =>
  history.replaceState(history.state, "", `${location.pathname}${location.search}${h ? `#${h}` : ""}`);

// Only well-formed entries; anything else in storage is ignored.
function loadMarks() {
  const out = {};
  const store = jah();
  const raw = store ? store.get(store.KEYS.MARKS, {}) : {};
  for (const [id, st] of Object.entries(raw || {})) if (st === "interested" || st === "going") out[id] = st;
  return out;
}

export function createMarks() {
  let marks = $state.raw(loadMarks()); // { id: "interested" | "going" }, replaced on every change
  let mineOnly = $state(false); // ★ Meine Shows is on
  let shared = $state.raw(null); // { id: state } from a #m=… link: the list is that one
  let sharedBy = $state(""); // optional "von:<Name>" token in a #m= link
  let sharedMissing = $state(0); // ids in a #m= link that no show matches any more (passed, removed)
  let undo = $state.raw(null); // { id, state, mineOnly, title } – the toast «‹Titel› entfernt»
  let starWords = $state.raw({}); // id → the feedback word next to a row's star
  const starTimers = {};
  let undoTimer = 0;

  const listMode = $derived(Boolean(shared || mineOnly));
  const markedShows = $derived(agenda.shows.filter((s) => marks[s.id]));
  const listMap = $derived(shared || (mineOnly ? marks : null));
  const listShows = $derived(listMap ? agenda.shows.filter((s) => listMap[s.id]) : []);
  // Every shared show is among the own marks already: «Alle gemerkt ✓».
  const allTaken = $derived(Boolean(shared) && Object.keys(shared).every((id) => marks[id]));

  agenda.setListSource(() => (listMap ? { ids: listMap, shared: Boolean(shared) } : null));

  function save() {
    const store = jah();
    if (store) store.set(store.KEYS.MARKS, marks);
  }

  // The feedback word next to a row's star («Gemerkt», «Entfernt», «Ich gehe» …), mirrored into #feedback.
  function flashStar(id, word) {
    if (!id || !word) return;
    live.announce(word);
    starWords = { ...starWords, [id]: word };
    clearTimeout(starTimers[id]);
    starTimers[id] = setTimeout(() => {
      const { [id]: _, ...rest } = starWords;
      starWords = rest;
    }, FLASH_MS);
  }

  // Echo (§4, gesture 2): three ghost stars scale 1 → 1.8 and fade, 120 ms apart – only on «Ich gehe».
  function echo(id) {
    if (reducedMotion()) return;
    flushSync();
    const star = starOf(id);
    const icon = star && star.querySelector("svg");
    if (!icon) return;
    for (let i = 0; i < 3; i++) {
      const g = document.createElement("i");
      g.className = "echo";
      g.setAttribute("aria-hidden", "true");
      g.style.animationDelay = `${i * 120}ms`;
      g.innerHTML = icon.outerHTML;
      star.appendChild(g);
      g.addEventListener("animationend", () => g.remove(), { once: true });
      setTimeout(() => g.remove(), 1500); // whatever happens to the animation
    }
  }

  // Set a show's mark ("" removes it). In the Meine-Shows list an un-marked row leaves; the last one
  // closes the list (its history entry with it).
  function setMark(s, next) {
    const prev = marks[s.id] || "";
    if (next === prev) return;
    const m = { ...marks };
    if (next) m[s.id] = next;
    else delete m[s.id];
    if (mineOnly && !next) {
      ui.keepFocus(() => {
        marks = m;
        save();
        if (!agenda.shows.some((x) => m[x.id])) {
          nav.popOverlay(); // the last mark went: the list closes, its history entry with it
          mineOnly = false;
        }
      });
      return;
    }
    marks = m;
    save();
    if (next === "going" && prev !== "going") echo(s.id);
  }

  // --- The star and the state toggle in a row --------------------------------------------------------
  function toggleStar(s) {
    if (marks[s.id]) unmark(s);
    else {
      setMark(s, "interested");
      flashStar(s.id, t("mark.marked"));
    }
  }
  // A pressed segment stays pressed: the toggle never un-marks (that is the star's job).
  function setState(s, next) {
    if (marks[s.id] === next) return;
    setMark(s, next);
    if (next === "interested") flashStar(s.id, STATE_WORD[next]);
  }
  // Long press on the star: «Ich gehe» in one go.
  function longPress(s) {
    if (marks[s.id] === "going") return;
    setMark(s, "going");
    flashStar(s.id, t("row.going"));
  }

  // --- Undo toast «‹Titel› entfernt · Rückgängig» (WCAG 2.2.1: the clock stops while the toast is hovered
  // or focused): one at a time, the newest un-mark wins. ---------------------------------------------
  function unmark(s) {
    const state = marks[s.id];
    if (!state) return;
    clearTimeout(undoTimer);
    undo = { id: s.id, state, mineOnly, title: s.title };
    setMark(s, "");
    flashStar(s.id, t("mark.removed"));
    callout.suspend(); // one thing at the bottom edge at a time (the nudge comes back later)
    undoClock();
  }
  function undoClock() {
    if (!undo) return;
    clearTimeout(undoTimer);
    undoTimer = setTimeout(hideUndo, UNDO_MS);
  }
  const stopUndoClock = () => clearTimeout(undoTimer);
  function hideUndo() {
    clearTimeout(undoTimer);
    const id = undo && undo.id;
    undo = null;
    // The focus never vanishes with the toast: back to the row's star (or the ★ in the bar).
    const toast = el(ID.undo);
    if (toast && toast.contains(document.activeElement)) {
      const star = id && starOf(id);
      (star || el(ID.toggleMine)).focus({ preventScroll: true });
    }
  }
  function restore() {
    if (!undo) return;
    const { id, state, mineOnly: wasMine } = undo;
    const s = agenda.shows.find((x) => x.id === id);
    hideUndo();
    if (!s) return;
    // The list was left because its last show went: open it again.
    if (wasMine && !shared && !mineOnly) {
      mineOnly = true;
      nav.pushOverlay("mine");
    }
    if (listMode) {
      marks = { ...marks, [s.id]: state };
      save();
    } else setMark(s, state);
    flushSync();
    flashStar(s.id, t("mark.again"));
  }

  // --- The list mode --------------------------------------------------------------------------------
  // Fold Wo/Wann away when the list comes up; their settings survive. Without popping the history entry:
  // the list mode took it over (pushOverlay("mine")) or came from a #m= hash navigation.
  function foldPanel() {
    if (ui.openPanel) nav.quietly(() => ui.setPanel(null));
  }
  const scrollToList = () => {
    const panel = el(ID.minePanel);
    ui.scrollUnderBar(!panel || panel.hidden ? el(ID.views) : panel);
  };

  // The ★ in the toolbar. Returns the word the button says when there is nothing to show yet.
  function toggleMine() {
    if (!markedShows.length) return t("mine.first");
    // The list is a full-screen mode with its own «Zurück»: Back closes it like a panel (one entry; an
    // open Wo/Wann panel's entry is taken over, the panel folds away).
    const on = !mineOnly;
    if (on) nav.pushOverlay("mine");
    else nav.popOverlay();
    ui.applyFilter(
      () => {
        mineOnly = on;
        if (on) foldPanel();
        else clearListHash();
      },
      // The list actions (Kalender · Teilen · Link) and the rows come up under the bar.
      () => mineOnly && scrollToList(),
    );
    return "";
  }

  // Leaving the mode by any exit: a #m= link that «Liste teilen» or a friend put into the address bar goes too.
  function clearListHash() {
    if (parseHash().mine) setHash("");
  }
  function closeListMode() {
    if (!listMode) return;
    if (mineOnly) nav.popOverlay(); // the ★ entry goes with the list (a #m= list came from a hash navigation)
    ui.applyFilter(() => {
      mineOnly = false;
      shared = null;
      sharedBy = "";
      sharedMissing = 0;
      clearListHash();
    });
    const toggle = el(ID.toggleMine);
    (toggle && !toggle.hidden ? toggle : el(ID.q))?.focus({ preventScroll: true });
  }

  // A friend's list (#m=…): the page switches to the list mode with exactly those shows; the friend's
  // «going» marks show as a small chip. Nothing is written to the visitor's marks until «Alle merken».
  function showShared(raw) {
    const { map, by, missing } = parseListHash(raw, (token) => agenda.findShow(token));
    const ids = Object.keys(map);
    const wasOn = listMode;
    if (!ids.length) {
      // Shows pass and are removed daily: an old list link ends up here. Say so, show everything.
      if (missing) {
        reveal.note = "link.staleList"; // a key of src/i18n (LinkNote.svelte says it)
        history.replaceState(history.state, "", location.pathname + location.search);
      }
      const leave = () => {
        shared = null;
        sharedBy = "";
        sharedMissing = 0;
        mineOnly = false; // «hier ist alles, was kommt» must be true: a Meine-Shows mode on screen goes too
      };
      // A list that was on screen goes; the agenda (and the note) come up under the bar.
      if (wasOn) ui.applyFilter(leave);
      else leave();
      return;
    }
    reveal.note = "";
    // The visitor's own link (every marked show, nothing else): that is simply «Meine Shows».
    if (ids.length === markedShows.length && ids.every((id) => marks[id])) {
      shared = null;
      sharedBy = "";
      sharedMissing = 0;
      setHash("");
      mineOnly = true;
    } else {
      shared = map;
      sharedBy = by;
      sharedMissing = missing;
    }
    if (ids.some((id) => agenda.findShow(id)?._past)) ui.setShowPast(true);
    if (!wasOn) foldPanel();
    flushSync();
    tick().then(() => el(ID.listTitle)?.focus({ preventScroll: true })); // opened from a link: announce it
  }

  // «Alle merken»: never overwrites or downgrades an own mark; the friend's «Ich gehe» stays a chip.
  function takeAll() {
    if (!shared) return;
    marks = takeAllMarks(marks, shared);
    save();
    flushSync();
    el(ID.listTitle)?.focus({ preventScroll: true }); // the button turned into text: announce the list
  }

  // Direct links: #m=… opens a shared list; a hash without it closes a friend's list that was open.
  function fromHash() {
    if (agenda.loadState !== "ready") return;
    const h = parseHash();
    if (h.mine) return showShared(h.mine);
    if (shared) {
      // The #m= link left the address bar (Back, or a new link): the friend's list goes with it.
      shared = null;
      sharedBy = "";
      sharedMissing = 0;
    }
  }

  // --- Share texts and the .ics of the list -----------------------------------------------------------
  const mineUrl = () =>
    `${location.origin}${location.pathname}#m=` +
    markedShows.map((s) => `${s._short}${marks[s.id][0]}`).join(",");
  const listUrl = () => (shared ? `${location.origin}${location.pathname}${location.hash}` : mineUrl());
  const listTitle = () => t(shared ? "mine.listTitleShared" : "mine.listTitle");
  // The message names the shows («Fr 16.10. Rude & Rebel Ska Fest, Luzern», the first five, «+n weitere»)
  // and ends with the link – a bare «Meine Reggae-Shows» + link told the friend nothing.
  const listShareLines = () => {
    const lines = listShows.slice(0, 5).map((s) => `${dayShort(s)} ${s.title}, ${s.city}`);
    if (listShows.length > 5) lines.push(t("mine.more", { n: listShows.length - 5 }));
    return lines;
  };
  const listShareText = () => `${listTitle()}\n${listShareLines().join("\n")}\n${listUrl()}`;
  // The WhatsApp link of the list: Teilen where navigator.share is missing, and its fallback.
  const listWaUrl = () => waLink(listShareText());
  function saveListIcs() {
    downloadIcs(
      icsWrap(
        listShows.flatMap((s) =>
          vevent(s, { url: showUrl(s), status: listMap[s.id] === "going" ? "CONFIRMED" : "TENTATIVE" }),
        ),
      ),
      t(shared ? "mine.icsFileShared" : "mine.icsFile"),
    );
  }
  // Teilen (navigator.share) of the list; the #m= link goes into the address bar first. Not possible:
  // the WhatsApp link opens, as for a row.
  async function shareList() {
    const url = listUrl();
    if (!shared) history.replaceState(history.state, "", url);
    const r = await shareOr(
      { title: listTitle(), text: `${listTitle()}\n${listShareLines().join("\n")}`, url },
      listWaUrl(),
    );
    return r === "shared" ? t("fb.shared") : "";
  }
  // Link: the #m= link is the shareable artefact – it goes to the clipboard and into the address bar.
  async function copyListLink() {
    const url = listUrl();
    if (!shared) history.replaceState(history.state, "", url);
    return (await copyText(url)) === "copied" ? t("fb.copied") : t("fb.inAddressBar");
  }

  // --- Wiring: Back closes ★ Meine Shows, Esc closes the list, #m= links open a list. ------------------
  let started = false;
  function start() {
    if (started || typeof window === "undefined") return;
    started = true;
    nav.registerOverlay("mine", {
      isOpen: () => mineOnly,
      keepOnOwnEntry: true, // returning from a view switch made while the list was open
      close: () => {
        ui.applyFilter(() => {
          mineOnly = false;
        });
        el(ID.toggleMine)?.focus({ preventScroll: true });
      },
    });
    window.addEventListener("hashchange", fromHash);
    // Capture phase, so that the Wo/Wann panels (which own Esc while open) go first.
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Escape" || !listMode || ui.openPanel) return;
        closeListMode();
      },
      true,
    );
    $effect.root(() => {
      // Every successful load (the first one, a retry) opens the linked list.
      let done = false;
      $effect(() => {
        if (agenda.loadState !== "ready" || done) return;
        done = true;
        tick().then(fromHash);
      });
    });
  }

  return {
    get marks() {
      return marks;
    },
    mark: (id) => marks[id] || "",
    get mineOnly() {
      return mineOnly;
    },
    get shared() {
      return shared;
    },
    get sharedBy() {
      return sharedBy;
    },
    get sharedMissing() {
      return sharedMissing;
    },
    get listMode() {
      return listMode;
    },
    get markedCount() {
      return markedShows.length;
    },
    get listShows() {
      return listShows;
    },
    get allTaken() {
      return allTaken;
    },
    get undo() {
      return undo;
    },
    starWord: (id) => starWords[id] || "",
    toggleStar,
    setState,
    longPress,
    unmark,
    restore,
    hideUndo,
    undoClock,
    stopUndoClock,
    toggleMine,
    closeListMode,
    showShared,
    takeAll,
    listShareText,
    listWaUrl,
    saveListIcs,
    shareList,
    copyListLink,
    start,
  };
}

export const mine = createMarks();
