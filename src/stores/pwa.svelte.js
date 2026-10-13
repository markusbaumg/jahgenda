/* The PWA store (story #33 M7, ported from public/pwa.js): the service-worker registration and the
 * «Neue Version» state the update toast renders. The install nudge is a callout of its own
 * (src/components/callout/nudges.svelte.js, M6).
 * The worker itself is src/sw.js (vite-plugin-pwa builds it into dist/sw.js). Kept apart from the agenda
 * store so the agenda works without it. */

import { callout } from "./callout.svelte.js";

const isLocal = () => ["localhost", "127.0.0.1"].includes(location.hostname);

export function createPwa() {
  // The waiting registration once a new worker is installed while an old one controls the page.
  let update = $state.raw(null);
  // Reload only after the visitor pressed «Aktualisieren»: clients.claim() in the freshly installed
  // worker also fires controllerchange on the very first visit, which must not reload the page.
  let wantReload = false;
  let reloading = false;
  let started = false;

  function registerWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (isLocal()) {
      // Local preview: never cache the shell, and drop any worker a previous visit left behind.
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
      return;
    }
    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("sw.js");
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            // A new worker is installed while an old one controls the page → offer a reload.
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              // One thing at the bottom edge at a time: a visible callout (install nudge …) makes way.
              callout.hide();
              update = reg;
            }
          });
        });
        // Check for a new version each time the app comes back to the foreground.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update().catch(() => {});
        });
      } catch (err) {
        console.warn("Service worker not registered:", err);
      }
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register);
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!wantReload || reloading) return;
      reloading = true;
      location.reload();
    });
  }

  // «Aktualisieren»: the waiting worker takes over, controllerchange reloads the page exactly once.
  function applyUpdate() {
    const reg = update;
    wantReload = true;
    if (reg && reg.waiting) reg.waiting.postMessage("skipWaiting");
    update = null;
    // The new worker took over before the click (or never will): reload anyway after a moment.
    setTimeout(() => {
      if (!reloading) location.reload();
    }, 3000);
  }

  return {
    get update() {
      return update;
    },
    applyUpdate,
    /** Once per page: register the worker. */
    start() {
      if (started) return;
      started = true;
      registerWorker();
    },
  };
}

export const pwa = createPwa();
