/* One callout ("sticker") for every nudge on the page — install the app, subscribe to the calendar, …
 * Same look, same place (bottom), same controls: × (snooze 30 days) and a clearly visible red
 * "Nie mehr zeigen" (never again). Only one callout is on screen at a time; the others wait their turn.
 * Dismissals live in jahStore under "callout.<id>". */
(() => {
  const store = window.jahStore;
  const SNOOZE_DAYS = 30;
  const queue = [];
  let current = null;
  let host = null;

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
    host.setAttribute("role", "dialog");
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
    return host;
  }

  function render(c) {
    const h = ensureHost();
    h.setAttribute("aria-label", c.title);
    const actions = (c.actions || [])
      .map((a, i) =>
        a.href
          ? `<a class="callout-btn${a.primary ? " primary" : ""}" href="${a.href}" ${a.external ? 'target="_blank" rel="noopener"' : ""} data-callout-action="${i}" title="${a.title || a.label}">${a.label}</a>`
          : `<button type="button" class="callout-btn${a.primary ? " primary" : ""}" data-callout-action="${i}" title="${a.title || a.label}">${a.label}</button>`,
      )
      .join("");
    h.querySelector(".callout-body").innerHTML =
      `<strong>${c.title}</strong><span>${c.text}</span>` +
      `<span class="callout-actions">${actions}` +
      `<button type="button" class="callout-never" data-callout-action="never" title="Diesen Hinweis nie mehr anzeigen">Nie mehr zeigen</button></span>`;
    h.hidden = false;
    requestAnimationFrame(() => h.classList.add("show"));
  }

  function close(how) {
    if (!current) return;
    const id = current.id;
    if (how === "forever") store.set(key(id), "forever");
    else if (how === "snooze") store.set(key(id), Date.now());
    host.classList.remove("show");
    current = null;
    setTimeout(() => {
      host.hidden = true;
      next();
    }, 300);
  }

  function next() {
    if (current) return;
    const c = queue.shift();
    if (!c) return;
    if (dismissedState(c.id) && !c.force) return next();
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
      }
      queue.unshift(c);
      next();
    },
    /** Close the visible callout without recording a dismissal (e.g. the action succeeded). */
    hide() {
      close("done");
    },
    isDismissed: (id) => Boolean(dismissedState(id)),
  };
})();
