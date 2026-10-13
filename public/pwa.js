/* Progressive-web-app glue: service worker registration, "new version" toast and the install banner.
 * Kept separate from app.js so the agenda works without it. */
(() => {
  const store = window.jahStore;
  // Reload only after the user pressed "Aktualisieren": clients.claim() in the freshly installed
  // worker also fires controllerchange on the very first visit, which must not reload the page.
  // Declared here, at the level of showUpdateToast(): inside the block below the assignment in the
  // click handler would silently create a global and the controllerchange listener would never reload.
  let wantReload = false;
  let reloading = false;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

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

  // ---- Install nudge (via the shared callout) ---------------------------------------------------
  if (standalone) return; // already installed: nothing to suggest
  const visits = (Number(store.get(store.KEYS.VISITS, 0)) || 0) + 1;
  store.set(store.KEYS.VISITS, visits);
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac with touch; its Share button sits top right, not in a bottom bar.
  const isIPad = /iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isIOS = /iPhone|iPod/.test(ua) || isIPad;
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|Chrome/.test(ua);
  let deferredPrompt = null;
  const callout = () => window.jahCallout;

  // Android / desktop Chrome & Edge: the browser tells us when it can install. The nudge waits for the
  // second visit (§3.9) – the first one is for finding out what Jahgenda is.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (visits < 2) return;
    callout().show({
      id: "install",
      title: "Jahgenda als App",
      text: "Aufs Handy holen: eigenes Icon, Vollbild, geht auch offline.",
      actions: [
        {
          label: "Installieren",
          primary: true,
          title: "Jahgenda als App installieren",
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
  window.addEventListener("appinstalled", () => callout().hide());

  // iPhone / iPad Safari has no install event: explain the two taps – from the second visit on,
  // once the visitor knows what Jahgenda is (and the sticker never sits over an open panel or the map).
  if (isIOS && isSafari && visits >= 2) {
    setTimeout(() => {
      if (deferredPrompt) return;
      callout().show({
        id: "install",
        title: `Jahgenda als App aufs ${isIPad ? "iPad" : "iPhone"}`,
        text:
          `Tippe ${isIPad ? "oben rechts" : "unten"} auf <b>Teilen</b> <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 7.5 6.5l1.4 1.4L11 5.8V15h2V5.8l2.1 2.1 1.4-1.4zM5 10h4v2H7v9h10v-9h-2v-2h4v13H5z"/></svg> ` +
          `und dann auf <b>«Zum Home-Bildschirm»</b> <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm0 2v14h14V5zm6 3h2v3h3v2h-3v3h-2v-3H8v-2h3z"/></svg>. Markierungen gelten pro App.`,
        // A friendly primary (snooze), so «Nie mehr zeigen» is not the only – and the biggest – button of
        // a nudge that wants the opposite.
        actions: [
          {
            label: "Alles klar",
            primary: true,
            title: "Verstanden – später wieder erinnern",
            onClick: (close) => close("snooze"),
          },
        ],
      });
    }, 2500);
  }
})();
