/* Progressive-web-app glue: service worker registration and the "new version" toast (the install nudge
 * moved to src/components/callout/nudges.svelte.js). Kept separate from the app so the agenda works without it. */
(() => {
  // Reload only after the user pressed "Aktualisieren": clients.claim() in the freshly installed
  // worker also fires controllerchange on the very first visit, which must not reload the page.
  // Declared here, at the level of showUpdateToast(): inside the block below the assignment in the
  // click handler would silently create a global and the controllerchange listener would never reload.
  let wantReload = false;
  let reloading = false;

  // ---- Service worker + update toast ------------------------------------------------------------
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  if ("serviceWorker" in navigator && isLocal) {
    // Local preview: never cache the shell, and drop any worker a previous visit left behind.
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
  } else if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        const reg = await navigator.serviceWorker.register("sw.js");
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            // A new worker is installed while an old one controls the page → offer a reload.
            if (sw.state === "installed" && navigator.serviceWorker.controller) showUpdateToast(reg);
          });
        });
        // Check for a new version each time the app comes back to the foreground.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update().catch(() => {});
        });
      } catch (err) {
        console.warn("Service worker not registered:", err);
      }
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!wantReload || reloading) return;
      reloading = true;
      location.reload();
    });
  }

  function showUpdateToast(reg) {
    // One thing at the bottom edge at a time: a visible callout (install nudge …) makes way.
    if (window.jahCallout) window.jahCallout.hide();
    const t = document.createElement("div");
    t.className = "toast";
    t.setAttribute("role", "status");
    t.innerHTML = `Neue Version von Jahgenda <button type="button" title="Seite neu laden und die neue Version verwenden">Aktualisieren</button>`;
    t.querySelector("button").addEventListener("click", () => {
      wantReload = true;
      if (reg.waiting) reg.waiting.postMessage("skipWaiting");
      t.remove();
      document.documentElement.style.removeProperty("--toast-h");
      // The new worker took over before the click (or never will): reload anyway after a moment.
      setTimeout(() => {
        if (!reloading) location.reload();
      }, 3000);
    });
    document.body.appendChild(t);
    // A callout that appears later docks above the toast instead of underneath it.
    document.documentElement.style.setProperty("--toast-h", `${t.offsetHeight + 12}px`);
  }
  // The install nudge is a callout: src/components/callout/nudges.svelte.js.
})();
