/* One callout ("sticker") for every nudge on the page — install the app, subscribe to the calendar, …
 * Same look, same place (bottom), same controls: × (snooze 30 days) and a clearly visible red
 * "Nie mehr zeigen" (never again). Only one callout is on screen at a time; the others wait their turn.
 * Dismissals live in jahStore under "callout.<id>".
 *
 * A nudge (force: false) never interrupts: it waits while the page says it is busy (open panel or
 * sheet, the map, a filter the visitor just touched, a deep-link landing – app.js sets the blocker)
 * and steps aside when such a thing opens after it appeared. One nudge per visit: once the visitor
 * closed a nudge, the queued ones stay quiet. An explicit request (force: true, a button click) is
 * a dialog: it takes the focus, closes on Escape and hands the focus back. */
(() => {
  const store = window.jahStore;
  const SNOOZE_DAYS = 30;
  const RETRY_MS = 1500;
  const queue = [];
  let current = null;
  let host = null;
  let blocker = () => false;
  let retry = 0;
  let nudgeDone = false; // the visitor closed a nudge this visit: no further nudge
  let opener = null; // the element to give the focus back to after an explicit request

  const key = (id) => `callout.${id}`;
  const dismissedState = (id) => {
    const v = store.get(key(id));
    if (v === "forever") return "forever";
    if (Number(v) && Date.now() - Number(v) < SNOOZE_DAYS * 86400e3) return "snoozed";
    return "";
  };

  function ensureHost() {
    if (host) return host;
    host = document.createElement("aside");
    host.className = "callout";
    host.hidden = true;
    host.tabIndex = -1;
    host.innerHTML =
      `<div class="callout-icon"><img src="img/logo/jahgenda.svg" alt="" width="40" height="40" /></div>` +
      `<div class="callout-body"></div>` +
      `<button type="button" class="callout-close" title="Später wieder zeigen (30 Tage)" aria-label="Schliessen">&times;</button>`;
    document.body.appendChild(host);
    host.querySelector(".callout-close").addEventListener("click", () => close("snooze"));
    host.addEventListener("click", (e) => {
      const a = e.target.closest("[data-callout-action]");
      if (!a || !current) return;
      const idx = Number(a.dataset.calloutAction);
      const action = current.actions[idx];
      if (action && action.onClick) action.onClick(close);
      if (a.dataset.calloutAction === "never") close("forever");
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && current && !host.hidden) close("snooze");
    });
    return host;
  }

  function render(c) {
    const h = ensureHost();
    // A nudge is a side note (region); an explicit request is a dialog the visitor asked for.
    h.setAttribute("role", c.force ? "dialog" : "region");
    h.setAttribute("aria-label", c.title);
    const actions = (c.actions || [])
      .map((a, i) =>
        a.href
          ? `<a class="callout-btn${a.primary ? " primary" : ""}" href="${a.href}" ${a.external ? 'target="_blank" rel="noopener"' : ""} data-callout-action="${i}" title="${a.title || a.label}">${a.label}</a>`
          : `<button type="button" class="callout-btn${a.primary ? " primary" : ""}" data-callout-action="${i}" title="${a.title || a.label}">${a.label}</button>`,
      )
      .join("");
    // «Nie mehr zeigen» belongs to the nudge; a callout the visitor opened on purpose only needs ×.
    const never = c.force
      ? ""
      : `<button type="button" class="callout-never" data-callout-action="never" title="Diesen Hinweis nie mehr anzeigen">Nie mehr zeigen</button>`;
    h.querySelector(".callout-body").innerHTML =
      `<strong>${c.title}</strong><span>${c.text}</span>` +
      `<span class="callout-actions">${actions}${never}</span>`;
    h.hidden = false;
    // The callout floats over the page end: tell CSS how much room the footer bar needs below it.
    document.documentElement.style.setProperty("--callout-h", `${h.offsetHeight + 12}px`);
    requestAnimationFrame(() => h.classList.add("show"));
    if (c.force) {
      opener = document.activeElement;
      const first = h.querySelector(".callout-btn") || h;
      first.focus({ preventScroll: true });
    }
  }

  function hideHost() {
    host.classList.remove("show");
    document.documentElement.style.removeProperty("--callout-h");
    const h = host;
    setTimeout(() => {
      if (!current) h.hidden = true;
    }, 300);
  }

  function close(how) {
    if (!current) return;
    const { id, force } = current;
    if (how === "forever") store.set(key(id), "forever");
    else if (how === "snooze") store.set(key(id), Date.now());
    if (!force && how !== "done") nudgeDone = true;
    current = null;
    hideHost();
    if (force && opener && opener.isConnected && host.contains(document.activeElement)) opener.focus();
    opener = null;
    setTimeout(next, 300);
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
    current = c;
    render(c);
  }

  window.jahCallout = {
    /** Queue a callout: {id, title, text (HTML), actions:[{label, href?, external?, onClick?(close), primary?, title?}], force?} */
    show(c) {
      if (!c || !c.id) return;
      if (!c.force && dismissedState(c.id)) return;
      if (current && current.id === c.id) return;
      if (c.force && current) {
        // An explicit request (button click) replaces whatever nudge is showing; the nudge is re-queued.
        queue.unshift(current);
        current = null;
        host.classList.remove("show");
        host.hidden = true;
        document.documentElement.style.removeProperty("--callout-h");
      }
      queue.unshift(c);
      next();
    },
    /** Close the visible callout without recording a dismissal (e.g. the action succeeded). */
    hide() {
      close("done");
    },
    /** The page got busy (panel, sheet, map …): a visible nudge steps aside and comes back later. */
    suspend() {
      if (!current || current.force) return;
      queue.unshift(current);
      current = null;
      hideHost();
      next();
    },
    /** app.js tells when a nudge must wait (returns true while the page is busy). */
    setBlocker(fn) {
      blocker = typeof fn === "function" ? fn : () => false;
    },
    isDismissed: (id) => Boolean(dismissedState(id)),
  };
})();
