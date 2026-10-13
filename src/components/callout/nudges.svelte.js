/* The two nudges on the page (story #33, M6) and when they may come – ported from app.js (blocker,
 * «Kalender abonnieren») and pwa.js (install sticker).
 *
 * When: a nudge waits while the visitor is busy – an open Wo/Wann panel, the map, the undo toast, a filter
 * they just touched (3 s), or a shared show they just landed on (8 s) – and steps aside when such a thing
 * opens after it appeared. Busy is read from the DOM (the panels' and views' hidden attributes are the
 * e2e contract), so the nudges need no hook in the filter, view or Meine-Shows code; a MutationObserver on
 * those attributes tells the callout to step aside the moment the page gets busy.
 *
 * What:
 * - Kalender abonnieren: [data-subscribe] buttons (calendar view) open it as a dialog; as a nudge it comes
 *   once, 1.5 s after the visitor has scrolled into the list (600 px, a scroll the page made itself does
 *   not count). The feed follows a single chosen canton.
 * - Install: Android / desktop Chrome & Edge from the browser's beforeinstallprompt, iPhone / iPad Safari
 *   with the two-tap explanation – both from the second visit on (§3.9), never when installed. */
import { untrack } from "svelte";
import { callout } from "../../stores/callout.svelte.js";
import { agenda } from "../../stores/agenda.svelte.js";
import { regionName } from "../../lib/regions.js";
import { parseHash } from "../../lib/hash.js";
import { quietScroll, isQuietScroll } from "../views/scroll.js";
import { t } from "../../i18n/core.js";

const FEED_BASE = "https://markusbaumg.github.io/jahgenda/";
const feedUrl = (region) => FEED_BASE + (region ? `jahgenda-${region}.ics` : "jahgenda.ics");

let quietUntil = 0; // no nudge for a moment after a filter interaction or a deep-link landing
const extraBusy = [];

const shown = (id) => {
  const el = document.getElementById(id);
  return Boolean(el && !el.hidden);
};
// The view on screen: the one of #list / #calendar / #map-view that is not hidden.
const visibleView = () =>
  shown("map-view") ? "map" : shown("calendar") ? "calendar" : shown("list") ? "list" : "";

// Something on screen a sticker must not cover: an open panel, the map, the undo toast.
const occupied = () =>
  shown("where-panel") || shown("when-panel") || visibleView() === "map" || shown("undo");
/** True while a nudge must wait. */
export function busy() {
  return occupied() || Date.now() < quietUntil || extraBusy.some((fn) => fn());
}
/** No nudge for `ms` (mid-task: a filter tap, a deep-link landing). */
export function quiet(ms) {
  quietUntil = Math.max(quietUntil, Date.now() + ms);
}
/** The page scrolls by itself for `ms` (deep link, keepInView, scroll restoration): no scroll nudge.
 * One clock for the whole page: views/scroll.js, which the filter and view stores mark too. */
export { quietScroll };
/** Another reason to wait (returns true while busy). */
export function addBusy(fn) {
  extraBusy.push(fn);
}

// --- Kalender abonnieren: the same callout as the install nudge --------------------------------------
export function showSubscribe(force) {
  const cs = agenda.filters.cantons;
  const canton = cs.size === 1 ? [...cs][0] : "";
  const url = feedUrl(canton);
  callout.show({
    id: "subscribe",
    force,
    title: canton ? t("sub.titleRegion", { name: regionName(canton) }) : t("sub.title"),
    text: t("sub.text"),
    actions: [
      {
        label: t("sub.apple"),
        primary: true,
        href: url.replace("https://", "webcal://"),
        title: t("sub.appleTitle"),
      },
      {
        label: t("sub.google"),
        href: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url)}`,
        external: true,
        title: t("sub.googleTitle"),
      },
      {
        label: t("sub.copy"),
        title: t("sub.copyTitle"),
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(url);
            callout.relabel(2, t("fb.copied"));
          } catch {
            prompt(t("sub.prompt"), url);
          }
        },
      },
    ],
  });
}

// --- Install (from pwa.js) ---------------------------------------------------------------------------
function startInstall() {
  const store = window.jahStore;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (standalone || !store) return; // already installed: nothing to suggest
  const visits = (Number(store.get(store.KEYS.VISITS, 0)) || 0) + 1;
  store.set(store.KEYS.VISITS, visits);
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac with touch; its Share button sits top right, not in a bottom bar.
  const isIPad = /iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isIOS = /iPhone|iPod/.test(ua) || isIPad;
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|Chrome/.test(ua);
  let deferredPrompt = null;

  // Android / desktop Chrome & Edge: the browser tells us when it can install. The nudge waits for the
  // second visit (§3.9) – the first one is for finding out what Jahgenda is.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (visits < 2) return;
    callout.show({
      id: "install",
      title: t("install.title"),
      text: t("install.text"),
      actions: [
        {
          label: t("install.button"),
          primary: true,
          title: t("install.buttonTitle"),
          onClick: async (close) => {
            if (!deferredPrompt) return close("done");
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            deferredPrompt = null;
            close(outcome === "accepted" ? "done" : "snooze");
          },
        },
      ],
    });
  });
  window.addEventListener("appinstalled", () => callout.hide());

  // iPhone / iPad Safari has no install event: explain the two taps – from the second visit on,
  // once the visitor knows what Jahgenda is (and the sticker never sits over an open panel or the map).
  if (isIOS && isSafari && visits >= 2) {
    setTimeout(() => {
      if (deferredPrompt) return;
      callout.show({
        id: "install",
        title: t("install.iosTitle", { device: isIPad ? "iPad" : "iPhone" }),
        // The message carries {where}, {share} and {add}: the place of the button and the two icons.
        text: t("install.iosText", {
          where: t(isIPad ? "install.iosWhereIpad" : "install.iosWherePhone"),
          share: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 7.5 6.5l1.4 1.4L11 5.8V15h2V5.8l2.1 2.1 1.4-1.4zM5 10h4v2H7v9h10v-9h-2v-2h4v13H5z"/></svg>`,
          add: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm0 2v14h14V5zm6 3h2v3h3v2h-3v3h-2v-3H8v-2h3z"/></svg>`,
        }),
        // A friendly primary (snooze), so «Nie mehr zeigen» is not the only – and the biggest – button of
        // a nudge that wants the opposite.
        actions: [
          {
            label: t("install.ok"),
            primary: true,
            title: t("install.okTitle"),
            onClick: (close) => close("snooze"),
          },
        ],
      });
    }, 2500);
  }
}

// A show link (#<short hash>, not an in-page anchor like the skip links) lands on the show, not on a sticker.
function landing() {
  const { id } = parseHash(location.hash);
  if (!id || id.includes("=") || document.getElementById(id)) return;
  quiet(8000);
  quietScroll(2000);
}

/** Start the nudges (once, from App.svelte's setup: the effects need the component's lifetime). */
export function startNudges() {
  callout.setBlocker(busy);
  landing();
  window.addEventListener("hashchange", landing);

  // A filter the visitor just touched: no sticker over the result for 3 s.
  let first = true;
  $effect(() => {
    const f = agenda.filters;
    // Read every filter (the Sets by content, whether they are replaced or mutated through a proxy).
    void [f.q, [...f.cantons].join(), f.radius, f.genre, f.format, [...f.months].join(), f.range, f.showPast];
    if (first) {
      first = false;
      return;
    }
    untrack(() => quiet(3000));
  });

  // The page got busy (a panel opened, the map, the undo toast): a visible nudge steps aside and comes back
  // later. A pushed view switch also closes a callout opened on purpose (it belonged to the view it left).
  let lastView = visibleView();
  const mo = new MutationObserver(() => {
    const v = visibleView();
    const switched = v && lastView && v !== lastView;
    if (v) lastView = v;
    const c = callout.current;
    if (!c) return;
    if (switched && c.force) callout.hide();
    else if (!c.force && occupied()) callout.suspend();
  });
  mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["hidden"] });

  // Kalender abonnieren: buttons with [data-subscribe] open it on purpose.
  const onClick = (e) => {
    const b = e.target.closest && e.target.closest("[data-subscribe]");
    if (!b) return;
    e.preventDefault();
    showSubscribe(true);
  };
  document.addEventListener("click", onClick);

  // Nudge once: after the visitor has scrolled into the list (not on the first second).
  let nudged = false;
  const onScroll = () => {
    if (nudged || window.scrollY < 600 || !agenda.shows.length || isQuietScroll()) return;
    nudged = true;
    setTimeout(() => showSubscribe(false), 1500); // the callout store holds it while the page is busy
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  startInstall();

  $effect(() => () => {
    mo.disconnect();
    document.removeEventListener("click", onClick);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("hashchange", landing);
  });
}
