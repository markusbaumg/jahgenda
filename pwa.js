/* Progressive-web-app glue: service worker registration, "new version" toast and the install banner.
 * Kept separate from app.js so the agenda works without it. */
(() => {
  const DISMISS_KEY = "jahgenda.install.dismissed"; // timestamp of the last "×", or "forever"
  const DISMISS_DAYS = 30;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

  const store = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* private mode: ignore */
      }
    },
  };

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
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  }

  function showUpdateToast(reg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.setAttribute("role", "status");
    t.innerHTML = `Neue Version von Jahgenda <button type="button">Aktualisieren</button>`;
    t.querySelector("button").addEventListener("click", () => {
      if (reg.waiting) reg.waiting.postMessage("skipWaiting");
      t.remove();
    });
    document.body.appendChild(t);
  }

  // ---- Install banner ---------------------------------------------------------------------------
  if (standalone) return; // already installed: nothing to suggest

  const dismissed = store.get(DISMISS_KEY);
  if (dismissed === "forever") return;
  if (Number(dismissed) && Date.now() - Number(dismissed) < DISMISS_DAYS * 86400e3) return;

  const ua = navigator.userAgent;
  const isIOS =
    /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|Chrome/.test(ua);
  let deferredPrompt = null;

  const banner = document.getElementById("install");
  if (!banner) return;
  const body = banner.querySelector(".install-body");
  const closeBtn = banner.querySelector(".install-close");

  function show(html) {
    body.innerHTML = html;
    banner.hidden = false;
    requestAnimationFrame(() => banner.classList.add("show"));
  }
  function dismiss(forever) {
    banner.classList.remove("show");
    setTimeout(() => (banner.hidden = true), 300);
    store.set(DISMISS_KEY, forever ? "forever" : String(Date.now()));
  }
  closeBtn.addEventListener("click", () => dismiss(false));
  banner.addEventListener("click", (e) => {
    if (e.target.closest(".install-never")) dismiss(true);
  });
  const NEVER = `<button type="button" class="install-never">Nie mehr fragen</button>`;

  // Android / desktop Chrome & Edge: the browser tells us when it can install.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    show(
      `<strong>Jahgenda als App</strong><span>Aufs Handy holen: eigenes Icon, Vollbild, geht auch offline.</span>` +
        `<span class="install-actions"><button type="button" class="install-btn">Installieren</button>${NEVER}</span>`,
    );
    body.querySelector(".install-btn").addEventListener("click", async () => {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (outcome === "accepted") banner.hidden = true;
      else dismiss(false);
    });
  });
  window.addEventListener("appinstalled", () => (banner.hidden = true));

  // iPhone / iPad Safari has no install event: explain the two taps.
  if (isIOS && isSafari) {
    setTimeout(() => {
      if (deferredPrompt) return;
      show(
        `<strong>Jahgenda als App aufs iPhone</strong>` +
          `<span>Tippe unten auf <b>Teilen</b> <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 7.5 6.5l1.4 1.4L11 5.8V15h2V5.8l2.1 2.1 1.4-1.4zM5 10h4v2H7v9h10v-9h-2v-2h4v13H5z"/></svg> ` +
          `und dann auf <b>«Zum Home-Bildschirm»</b> <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm0 2v14h14V5zm6 3h2v3h3v2h-3v3h-2v-3H8v-2h3z"/></svg>.</span>` +
          `<span class="install-actions">${NEVER}</span>`,
      );
    }, 2500);
  }
})();
