(() => {
  const DATA_URL = "data/shows.json";
  const VENUES_URL = "data/venues.json";
  const GENRES_URL = "data/genres.json";
  const SLOGANS_URL = "data/slogans.json";
  let genreOrder = []; // slugs in display order (from data/genres.json)
  let genreLabel = {}; // slug → label
  let venueSites = {}; // normalised venue name → website/programme URL (from data/venues.json)
  const venueKey = (name) =>
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");

  const CANTONS = {
    AG: "Aargau",
    AI: "Appenzell I.Rh.",
    AR: "Appenzell A.Rh.",
    BE: "Bern",
    BL: "Basel-Landschaft",
    BS: "Basel-Stadt",
    FR: "Freiburg",
    GE: "Genf",
    GL: "Glarus",
    GR: "Graubünden",
    JU: "Jura",
    LU: "Luzern",
    NE: "Neuenburg",
    NW: "Nidwalden",
    OW: "Obwalden",
    SG: "St. Gallen",
    SH: "Schaffhausen",
    SO: "Solothurn",
    SZ: "Schwyz",
    TG: "Thurgau",
    TI: "Tessin",
    UR: "Uri",
    VD: "Waadt",
    VS: "Wallis",
    ZG: "Zug",
    ZH: "Zürich",
  };

  const el = (id) => document.getElementById(id);
  const ABROAD = {
    D: "Deutschland (grenznah)",
    F: "Frankreich (grenznah)",
    I: "Italien (grenznah)",
    A: "Österreich (grenznah)",
    FL: "Liechtenstein",
  };
  const list = el("list");
  const views = el("views");
  const calendarEl = el("calendar");
  const mapView = el("map-view");
  const viewSwitch = el("view-switch");
  const VIEWS = ["list", "calendar", "map"];
  const store = window.jahStore;
  let view = "list";
  {
    const stored = store.get(store.KEYS.VIEW, "list");
    if (VIEWS.includes(stored)) view = stored;
  }
  let lastVisible = []; // the currently filtered shows, for view-only re-renders
  const status = el("status");
  const resultsText = el("results-text");
  const togglePast = el("toggle-past");
  let showPast = false;
  let pastCount = 0;
  const cantonSelect = el("canton");
  const search = el("q");
  const genreBar = el("genres");
  let activeGenre = "";

  const monthFmt = new Intl.DateTimeFormat("de-CH", {
    month: "long",
    year: "numeric",
  });
  const dowFmt = new Intl.DateTimeFormat("de-CH", { weekday: "short" });
  const stampFmt = new Intl.DateTimeFormat("de-CH", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  // Dates are local calendar days ("YYYY-MM-DD"); parse without timezone shifts.
  const parseDay = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  const todayStart = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  };

  const escape = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");
  const regionName = (c) => CANTONS[c] || ABROAD[c] || c;

  let shows = [];
  let here = null; // { lat, lon } once the visitor shares their location

  // Straight-line distance in km (haversine).
  function distanceKm(a, b) {
    const rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }

  const formatKm = (km) => (km < 1 ? "gleich ums Eck" : `≈ ${km < 10 ? km.toFixed(1) : Math.round(km)} km`);

  function distanceLabel(s) {
    if (!here || typeof s.lat !== "number" || typeof s.lon !== "number") return "";
    return ` · <span class="dist">${formatKm(distanceKm(here, s))}</span>`;
  }

  // Venue name as a link to the venue's site when data/venues.json knows it.
  const venueLink = (s) => {
    const u = venueSites[venueKey(s.venue)];
    return u
      ? `<a class="venue-link" href="${escape(u)}" target="_blank" rel="noopener" title="Website von ${escape(s.venue)}">${escape(s.venue)}</a>`
      : escape(s.venue);
  };

  const ICONS = {
    ticket:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7zm2 0v2.2A4 4 0 0 1 5 14.8V17h14v-2.2a4 4 0 0 1 0-5.6V7H5zm5 2h2v6h-2V9zm4 0h2v6h-2V9z"/></svg>',
    gcal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zM6 8v12h12V8H6zm3.5 2.5h5v1.6h-3.3v1h3v1.5h-3v1.2h3.4v1.6h-5.1z"/></svg>',
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zm-1 8v10h12V10H6zm2 2h3v3H8v-3z"/></svg>',
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.2 14.8l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 0 1 12 4zm-3 4.5c-.2 0-.5 0-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.2 5 4.4 2.5 1 3 .8 3.5.7.5 0 1.7-.7 2-1.4.2-.7.2-1.2.1-1.4l-.5-.3-1.8-.9c-.3-.1-.5-.1-.6.1l-.9 1.1c-.2.2-.3.2-.6.1a6.5 6.5 0 0 1-3.3-2.9c-.2-.4.3-.4.8-1.4.1-.2 0-.4 0-.5l-.9-2c-.2-.5-.4-.4-.6-.4H9z"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10.6 13.4a1 1 0 0 1 0 1.4 4 4 0 0 1-5.7-5.7l3-3a4 4 0 0 1 5.6 0 1 1 0 1 1-1.4 1.4 2 2 0 0 0-2.8 0l-3 3a2 2 0 0 0 2.9 2.9 1 1 0 0 1 1.4 0zm2.8-2.8a1 1 0 0 1 0-1.4 4 4 0 0 1 5.7 5.7l-3 3a4 4 0 0 1-5.6 0 1 1 0 1 1 1.4-1.4 2 2 0 0 0 2.8 0l3-3a2 2 0 0 0-2.9-2.9 1 1 0 0 1-1.4 0z"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.2 6.8.8-5 4.7 1.3 6.8L12 17.6 6 21l1.3-6.8-5-4.7 6.8-.8z"/></svg>',
  };

  // Short, stable hash per show for links: FNV-1a over the id, base36 (6-7 chars), e.g. #k3f9zq.
  function shortId(id) {
    let h = 0x811c9dc5;
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36);
  }
  // Resolve a hash token to a show: short hash first, full id as fallback (old links keep working).
  const findShow = (token) => shows.find((s) => s._short === token) || shows.find((s) => s.id === token);

  const showUrl = (s) => `${location.origin}${location.pathname}#${s._short}`;

  const shareText = (s) =>
    `${s.title} – ${dowFmt.format(s._day).replace(".", "")} ${s._day.getDate()}.${s._day.getMonth() + 1}.${s._day.getFullYear()}` +
    `${s.time ? ` ${s.time}` : ""} · ${s.venue}, ${s.city}\n${showUrl(s)}`;

  // One VEVENT for a show (floating local time, so it lands at the right hour in Switzerland).
  function vevent(s, status) {
    const d = s.date.replace(/-/g, "");
    const esc = (t) =>
      String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
    let when;
    if (s.time) {
      const [h, m] = s.time.split(":").map(Number);
      const end = new Date(s._day.getFullYear(), s._day.getMonth(), s._day.getDate(), h + 3, m);
      const pad = (n) => String(n).padStart(2, "0");
      const stamp = (x) =>
        `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}T${pad(x.getHours())}${pad(x.getMinutes())}00`;
      when = `DTSTART:${d}T${pad(h)}${pad(m)}00\r\nDTEND:${stamp(end)}`;
    } else {
      when = `DTSTART;VALUE=DATE:${d}`;
    }
    return [
      "BEGIN:VEVENT",
      `UID:${s.id}@jahgenda`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, "")}`,
      when,
      `SUMMARY:${esc(s.title)}`,
      `LOCATION:${esc(`${s.venue}, ${s.city}`)}`,
      `DESCRIPTION:${esc(`${safeUrl(s.url) || ""}\n${showUrl(s)}`)}`,
      `URL:${showUrl(s)}`,
      ...(status ? [`STATUS:${status}`] : []),
      "END:VEVENT",
    ];
  }

  const icsWrap = (events) =>
    ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Jahgenda//DE", ...events, "END:VCALENDAR", ""].join("\r\n");

  // Build an .ics file for one show.
  const icsFor = (s) => icsWrap(vevent(s));

  // "Add to Google Calendar" link (works in the Google Calendar app and on the web).
  function gcalUrl(s) {
    const d = s.date.replace(/-/g, "");
    let dates;
    if (s.time) {
      const [h, m] = s.time.split(":").map(Number);
      const pad = (n) => String(n).padStart(2, "0");
      const end = new Date(s._day.getFullYear(), s._day.getMonth(), s._day.getDate(), h + 3, m);
      dates = `${d}T${pad(h)}${pad(m)}00/${end.getFullYear()}${pad(end.getMonth() + 1)}${pad(end.getDate())}T${pad(end.getHours())}${pad(end.getMinutes())}00`;
    } else {
      const next = new Date(s._day.getFullYear(), s._day.getMonth(), s._day.getDate() + 1);
      const pad = (n) => String(n).padStart(2, "0");
      dates = `${d}/${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`;
    }
    const p = new URLSearchParams({
      action: "TEMPLATE",
      text: s.title,
      dates,
      ctz: "Europe/Zurich",
      location: `${s.venue}, ${s.city}`,
      details: `${safeUrl(s.url) || ""}\n${showUrl(s)}`.trim(),
    });
    return `https://calendar.google.com/calendar/render?${p}`;
  }

  function downloadIcs(text, name) {
    const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const STATE_ICONS = {
    search:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"/></svg>',
    calendar:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zM6 8v12h12V8H6zm2 2h3v3H8v-3z"/></svg>',
    offline:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M2 7h20v14H2V7zm2 2v10h16V9H4zm3 2h2v6H7v-6zm4 0h2v6h-2v-6zm4 0h2v6h-2v-6zM12 3l5 3h-10l5-3z"/></svg>',
  };

  function renderShow(s) {
    const d = s._day;
    const dow = d.getDay();
    const url = safeUrl(s.url);
    const title = url
      ? `<a href="${escape(url)}" target="_blank" rel="noopener">${escape(s.title)}</a>`
      : escape(s.title);
    const time = s.time ? `<time>${escape(s.time)}</time> · ` : "";
    const tickets = safeUrl(s.tickets);
    return `
      <li class="show${dow === 0 || dow === 5 || dow === 6 ? " weekend" : ""}${s._past ? " past" : ""}${markClass(s)}" id="${escape(s.id)}" data-id="${escape(s.id)}">
        <time class="date" datetime="${escape(s.date)}">
          <span class="dow">${dowFmt.format(d).replace(".", "")}</span>
          <span class="day">${String(d.getDate()).padStart(2, "0")}</span>
        </time>
        <div>
          <h3 class="title">${title}</h3>
          ${
            s.acts.length > 1 || (s.acts.length === 1 && s.acts[0] !== s.title)
              ? `<p class="acts">${s.acts.map((a) => `<span>${escape(a)}</span>`).join("")}</p>`
              : ""
          }
          <p class="meta">${time}${venueLink(s)} · ${escape(s.city)}${distanceLabel(s)}</p>
        </div>
        <button type="button" class="canton${ABROAD[s.canton] ? " abroad" : ""}" data-canton="${escape(s.canton)}" title="Nur ${escape(regionName(s.canton))} anzeigen"><img src="img/cantons/${escape(s.canton)}.svg" alt="" loading="lazy">${escape(s.canton)}</button>
        <div class="foot-row">
            ${s.genres.length || (shared && shared[s.id] === "going") ? `<div class="tags">${s.genres.map((g) => `<span class="tag-chip">${escape(genreLabel[g] || g)}</span>`).join("")}${shared && shared[s.id] === "going" ? `<span class="tag-chip going">geht hin</span>` : ""}</div>` : ""}
            <div class="actions">
              ${starButton(s)}
              <button type="button" class="act" data-act="cal" title="Als .ics speichern (Apple, Outlook …)">${ICONS.cal}<span>Kalender</span></button>
              <a class="act" href="${escape(gcalUrl(s))}" target="_blank" rel="noopener" title="In Google Kalender eintragen">${ICONS.gcal}<span>Google</span></a>
              <a class="act" href="https://wa.me/?text=${encodeURIComponent(shareText(s))}" target="_blank" rel="noopener" title="Per WhatsApp teilen">${ICONS.wa}<span>WhatsApp</span></a>
              ${tickets ? `<a class="act tickets" href="${escape(tickets)}" target="_blank" rel="noopener" title="Tickets kaufen">${ICONS.ticket}<span>Tickets</span></a>` : ""}
              <button type="button" class="act" data-act="link" title="Link zu dieser Show kopieren">${ICONS.link}<span>Link teilen</span></button>
            </div>
          </div>
      </li>`;
  }

  function render() {
    const canton = cantonSelect.value;
    const q = search.value.trim().toLowerCase();

    const visible = shows.filter((s) => {
      if (s._past && !showPast) return false;
      if (shared && !shared[s.id]) return false;
      if (mineOnly && !marks[s.id]) return false;
      if (canton && s.canton !== canton) return false;
      if (activeGenre && !s.genres.includes(activeGenre)) return false;
      if (!q) return true;
      return [s.title, s.venue, s.city, regionName(s.canton), ...s.genres, ...s.acts]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    const filtered = Boolean(canton || activeGenre || q || mineOnly || shared);
    el("clear-filters").hidden = !filtered;
    const past = mineOnly ? markedShows().filter((s) => s._past).length : pastCount;
    togglePast.hidden = past === 0;
    togglePast.textContent = showPast ? "Vergangene ausblenden" : `Vergangene anzeigen (${past})`;
    updateMine();
    lastVisible = visible;
    if (!visible.length) {
      list.innerHTML = "";
      calendarEl.innerHTML = "";
      mapRest.innerHTML = "";
      views.hidden = true;
      resultsText.textContent = "";
      status.innerHTML = shows.some((s) => !s._past)
        ? `<p class="state-icon">${STATE_ICONS.search}</p><p class="big">Nichts gefunden</p><p>Keine Konzerte für diese Auswahl.</p><button type="button" class="primary" id="reset">Filter zurücksetzen</button>`
        : `<p class="state-icon">${STATE_ICONS.calendar}</p><p class="big">Noch nichts im Kalender</p><p>Sobald der Scraper etwas findet, steht es hier.</p>`;
      return;
    }
    status.innerHTML = "";
    views.hidden = false;
    const first = visible[0]._day;
    const last = visible[visible.length - 1]._day;
    const span =
      first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()
        ? monthFmt.format(first)
        : `${monthFmt.format(first)} – ${monthFmt.format(last)}`;
    resultsText.textContent = shared
      ? `Geteilte Liste · ${visible.length} ${visible.length === 1 ? "Show" : "Shows"} · ${span}`
      : `${visible.length} ${visible.length === 1 ? "Konzert" : "Konzerte"}${filtered ? " für diese Auswahl" : ""} · ${span}`;

    list.hidden = view !== "list";
    calendarEl.hidden = view !== "calendar";
    mapView.hidden = view !== "map";
    // Only the active view keeps its rows: the calendar's day list and the map's
    // "Ohne Standort" list reuse the row ids, and #id links must find the list row.
    if (view !== "list") list.innerHTML = "";
    if (view !== "calendar") calendarEl.innerHTML = "";
    if (view !== "map") mapRest.innerHTML = "";
    if (view === "calendar") {
      renderCalendar(visible);
      return;
    }
    if (view === "map") {
      renderMap(visible);
      return;
    }

    const groups = new Map();
    for (const s of visible) {
      const key = monthFmt.format(s._day);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }

    list.innerHTML = [...groups]
      .map(
        ([month, items]) => `
        <section>
          <h2 class="month">${escape(month)}</h2>
          <ul class="shows">${items.map(renderShow).join("")}</ul>
        </section>`,
      )
      .join("");
  }

  // Tagline: one of the slogans (same lines as on the stickers), rotating by day.
  fetch(SLOGANS_URL, { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const list = (d && d.slogans) || [];
      if (!list.length) return;
      const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 864e5);
      const line = list[dayOfYear % list.length];
      const tag = el("tagline");
      if (tag) tag.textContent = line;
      const mini = el("mini-tag");
      if (mini) mini.textContent = line;
    })
    .catch(() => {});

  async function init() {
    try {
      const [res, vres, gres] = await Promise.all([
        fetch(DATA_URL, { cache: "no-cache" }),
        fetch(VENUES_URL, { cache: "no-cache" }).catch(() => null),
        fetch(GENRES_URL, { cache: "no-cache" }).catch(() => null),
      ]);
      try {
        const g = gres && gres.ok ? await gres.json() : null;
        for (const item of (g && g.genres) || []) {
          if (item && typeof item.slug === "string") {
            genreOrder.push(item.slug);
            genreLabel[item.slug] = item.label || item.slug;
          }
        }
      } catch {
        /* genres.json is optional for the page; chips then follow the data */
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      try {
        const v = vres && vres.ok ? await vres.json() : null;
        for (const [name, info] of Object.entries((v && v.venues) || {})) {
          if (info && safeUrl(info.url)) venueSites[venueKey(name)] = info.url;
        }
      } catch {
        /* venues.json is optional for the page */
      }

      const today = todayStart();
      shows = (data.shows || [])
        .filter((s) => s && s.date && s.title)
        .map((s) => ({
          ...s,
          _day: parseDay(s.date),
          genres: Array.isArray(s.genres) ? s.genres.map((g) => String(g).toLowerCase()) : [],
          acts: Array.isArray(s.acts) ? s.acts.map(String).filter(Boolean) : [],
        }))
        .map((s) => ({ ...s, _past: s._day < today, _short: shortId(s.id) }))
        .sort((a, b) => a._day - b._day || (a.time || "").localeCompare(b.time || ""));

      pastCount = shows.filter((s) => s._past).length;
      const used = [...new Set(shows.map((s) => s.canton).filter(Boolean))].sort();
      cantonSelect.insertAdjacentHTML(
        "beforeend",
        used.map((c) => `<option value="${escape(c)}">${escape(regionName(c))}</option>`).join(""),
      );

      // Genre chips: one toggle per genre that occurs at least once, in the order of data/genres.json
      // (unknown slugs go last, alphabetically).
      const counts = new Map();
      for (const s of shows) for (const g of s.genres) counts.set(g, (counts.get(g) || 0) + 1);
      const rank = (g) => (genreOrder.includes(g) ? genreOrder.indexOf(g) : genreOrder.length);
      genreBar.innerHTML =
        `<button type="button" class="chip" data-genre="" aria-pressed="true">Alle</button>` +
        [...counts]
          .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
          .map(
            ([g]) =>
              `<button type="button" class="chip" data-genre="${escape(g)}" aria-pressed="false">${escape(genreLabel[g] || g)}</button>`,
          )
          .join("");
      updateChipArrows();

      if (data.updated) {
        const note = data.source === "mock" ? " · Beispieldaten" : "";
        el("updated").textContent = `Stand: ${stampFmt.format(new Date(data.updated))}${note}`;
      }
      render();
      revealFromHash();
    } catch (err) {
      console.error(err);
      status.innerHTML = `<p class="state-icon">${STATE_ICONS.offline}</p><p class="big">Kein Empfang</p><p>Die Konzerte konnten nicht geladen werden. Bitte später nochmals versuchen.</p>`;
    }
  }

  // Canton badge: click filters the list to that canton (click again to clear).
  list.addEventListener("click", (e) => {
    const c = e.target.closest(".canton[data-canton]");
    if (!c) return;
    cantonSelect.value = cantonSelect.value === c.dataset.canton ? "" : c.dataset.canton;
    renderAndKeepInView();
  });

  // Per-show actions (calendar / copy link); WhatsApp is a plain link.
  // Bound on the views wrapper, because the calendar and the map reuse the show rows.
  views.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const s = shows.find((x) => x.id === btn.closest(".show").dataset.id);
    if (!s) return;
    if (btn.dataset.act === "cal") downloadIcs(icsFor(s), `${s.id}.ics`);
    if (btn.dataset.act === "link") {
      history.replaceState(null, "", `#${s._short}`);
      const label = btn.querySelector("span");
      try {
        await navigator.clipboard.writeText(showUrl(s));
        label.textContent = "Kopiert";
      } catch {
        label.textContent = "Link in Adresszeile";
      }
      setTimeout(() => (label.textContent = "Link teilen"), 1500);
    }
  });

  function resetFilters() {
    cantonSelect.value = "";
    search.value = "";
    activeGenre = "";
    mineOnly = false;
    if (shared) {
      shared = null;
      history.replaceState(null, "", location.pathname + location.search);
    }
    for (const c of genreBar.querySelectorAll(".chip"))
      c.setAttribute("aria-pressed", String(c.dataset.genre === ""));
    genreBar.scrollTo({ left: 0 });
    render();
  }
  status.addEventListener("click", (e) => {
    if (e.target.id === "reset") {
      resetFilters();
      search.focus();
    }
  });
  el("clear-filters").addEventListener("click", resetFilters);
  togglePast.addEventListener("click", () => {
    showPast = !showPast;
    renderAndKeepInView();
  });

  // Direct links: #<show id> scrolls to the show and highlights it (clearing filters if needed).
  function revealFromHash() {
    if (/^#(mine|m)=/.test(location.hash)) return showShared();
    const target = findShow(decodeHashPart(location.hash.slice(1)));
    if (!target) return;
    const id = target.id;
    if (target._past && !showPast) showPast = true;
    // Rows only exist in the list view; the calendar and the map link here.
    if (view !== "list") setView("list");
    if (!document.getElementById(id)) resetFilters();
    const row = document.getElementById(id);
    if (!row) return;
    row.classList.remove("highlight");
    void row.offsetWidth; // restart the animation
    row.classList.add("highlight");
    row.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  window.addEventListener("hashchange", revealFromHash);

  const locateBtn = el("locate");
  const geoStatus = el("geo-status");

  if (!("geolocation" in navigator)) locateBtn.hidden = true;

  locateBtn.addEventListener("click", () => {
    geoStatus.textContent = "Suche dich …";
    locateBtn.disabled = true;
    // The position is only used in this browser tab; it is never stored or sent anywhere.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        locateBtn.disabled = false;
        locateBtn.classList.add("active");
        // Closest upcoming show (never a past one), as a link into the list.
        const near = shows
          .filter((s) => !s._past && typeof s.lat === "number")
          .map((s) => ({ s, km: distanceKm(here, s) }))
          .sort((a, b) => a.km - b.km)
          .slice(0, 3);
        if (near.length) {
          const n = near[0];
          const when = `${dowFmt.format(n.s._day).replace(".", "")} ${n.s._day.getDate()}.${n.s._day.getMonth() + 1}.`;
          geoStatus.innerHTML =
            `<span class="geo-pin">📍</span> Am nächsten bei dir: ` +
            `<a href="#${n.s._short}"><strong>${escape(n.s.title)}</strong></a>, ${escape(when)} in ${escape(n.s.city)} · ` +
            `<span class="dist">${formatKm(n.km)}</span>` +
            (near.length > 1
              ? ` <span class="geo-more">· danach ${near
                  .slice(1)
                  .map((x) => `${escape(x.s.city)} (${formatKm(x.km)})`)
                  .join(", ")}</span>`
              : "");
        } else {
          geoStatus.textContent = "Standort gefunden – die Distanzen stehen jetzt bei jeder Show.";
        }
        render();
      },
      () => {
        locateBtn.disabled = false;
        geoStatus.textContent = "Standort nicht verfügbar. Kein Stress, die Agenda geht auch so.";
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  });

  // --- Meine Shows: mark shows as "Interessiert" / "Ich gehe", filter to them, share the list. ---
  // Marks live only in this browser (localStorage); without it they last for the page view.
  const MARK_LABEL = {
    "": "Merken",
    interested: "Interessiert",
    going: "Ich gehe",
  };
  const NEXT_MARK = { "": "interested", interested: "going", going: "" };
  let marks = {};
  // Only keep well-formed entries; anything else in storage is ignored.
  for (const [id, st] of Object.entries(store.get(store.KEYS.MARKS, {}) || {}))
    if (st === "interested" || st === "going") marks[id] = st;
  // Hash parts come from a URL someone typed or pasted: never let a bad escape throw.
  const decodeHashPart = (t) => {
    try {
      return decodeURIComponent(t);
    } catch {
      return t;
    }
  };
  let mineOnly = false;
  let shared = null; // { id: state } from a #mine=… link, shown until taken over or closed
  const toggleMine = el("toggle-mine");
  const minePanel = el("mine-panel");
  const sharedBox = el("shared");

  function saveMarks() {
    store.set(store.KEYS.MARKS, marks);
  }
  const markedShows = () => shows.filter((s) => marks[s.id]);
  const markClass = (s) =>
    `${marks[s.id] ? ` ${marks[s.id]}` : ""}${shared && shared[s.id] ? " shared-row" : ""}`;
  const starButton = (s) =>
    `<button type="button" class="act star" data-act="mark" title="Markieren: Interessiert → Ich gehe">${ICONS.star}<span>${MARK_LABEL[marks[s.id] || ""]}</span></button>`;
  const dayShort = (s) =>
    `${dowFmt.format(s._day).replace(".", "")} ${s._day.getDate()}.${s._day.getMonth() + 1}.`;
  const mineUrl = () =>
    `${location.origin}${location.pathname}#m=` +
    markedShows()
      .map((s) => `${s._short}${marks[s.id][0]}`)
      .join(",");

  minePanel.innerHTML =
    `<span class="mine-note">Gespeichert in diesem Browser. Aufs andere Handy oder zu Freunden: «Liste teilen» und dort «Alle übernehmen».</span>` +
    `<button type="button" class="act" data-mine="ics">${ICONS.cal}<span>Kalender exportieren (.ics)</span></button>` +
    `<button type="button" class="act" data-mine="share">${ICONS.link}<span>Liste teilen</span></button>` +
    `<a class="act" id="mine-wa" href="#" target="_blank" rel="noopener">${ICONS.wa}<span>WhatsApp</span></a>`;

  function updateMine() {
    const n = markedShows().length;
    toggleMine.hidden = n === 0;
    toggleMine.setAttribute("aria-pressed", String(mineOnly));
    toggleMine.querySelector("b").textContent = n;
    minePanel.hidden = !mineOnly || n === 0;
    if (!minePanel.hidden)
      el("mine-wa").href = `https://wa.me/?text=${encodeURIComponent(`Meine Reggae-Shows: ${mineUrl()}`)}`;
  }

  function cycleMark(s, row) {
    const next = NEXT_MARK[marks[s.id] || ""];
    if (next) marks[s.id] = next;
    else delete marks[s.id];
    saveMarks();
    if (mineOnly) {
      if (!markedShows().length) mineOnly = false;
      render();
      return;
    }
    row.classList.toggle("interested", next === "interested");
    row.classList.toggle("going", next === "going");
    row.querySelector(".star span").textContent = MARK_LABEL[next];
    updateMine();
  }
  list.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-act="mark"]');
    if (!btn) return;
    const row = btn.closest(".show");
    const s = shows.find((x) => x.id === row.dataset.id);
    if (s) cycleMark(s, row);
  });

  toggleMine.addEventListener("click", () => {
    mineOnly = !mineOnly;
    renderAndKeepInView();
  });

  minePanel.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-mine]");
    if (!btn) return;
    if (btn.dataset.mine === "ics")
      downloadIcs(
        icsWrap(markedShows().flatMap((s) => vevent(s, marks[s.id] === "going" ? "CONFIRMED" : "TENTATIVE"))),
        "meine-shows.ics",
      );
    if (btn.dataset.mine === "share") {
      const label = btn.querySelector("span");
      try {
        await navigator.clipboard.writeText(mineUrl());
        label.textContent = "Link kopiert";
      } catch {
        label.textContent = "Kopieren nicht möglich";
      }
      setTimeout(() => (label.textContent = "Liste teilen"), 1500);
    }
  });

  // A friend's list (#m=…): the list is simply filtered to those shows; the friend's "going" marks show as
  // a small chip. "✕ Filter zurücksetzen" leaves the shared view. Nothing is written to the visitor's marks.
  function showShared() {
    shared = {};
    // New form #m=<short><g|i>,… ; old form #mine=<id>:<g|i>,… still accepted.
    const raw = location.hash.replace(/^#(mine|m)=/, "");
    for (const part of raw.split(",")) {
      let token, st;
      if (part.includes(":")) [token, st] = part.split(":").map(decodeHashPart);
      else [token, st] = [decodeHashPart(part.slice(0, -1)), part.slice(-1)];
      const show = token && findShow(token);
      if (show) shared[show.id] = st === "g" ? "going" : "interested";
    }
    if (!Object.keys(shared).length) {
      shared = null;
      return;
    }
    if (Object.keys(shared).some((id) => findShow(id)?._past)) showPast = true;
    sharedBox.hidden = true;
    render();
  }

  // --- Views: Liste | Kalender | Karte ---
  // All three show the same filtered shows (`lastVisible`); render() dispatches to them.
  function setView(next) {
    if (!VIEWS.includes(next)) return;
    view = next;
    store.set(store.KEYS.VIEW, view);
    markView();
    render();
  }
  function markView() {
    for (const b of viewSwitch.querySelectorAll("[data-view]"))
      b.setAttribute("aria-pressed", String(b.dataset.view === view));
  }
  markView();
  viewSwitch.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view]");
    if (btn && btn.dataset.view !== view) setView(btn.dataset.view);
  });

  // Calendar pills and map popups link to the show's row in the list.
  function goToShow(id) {
    history.replaceState(null, "", `#${encodeURIComponent(id)}`);
    revealFromHash();
  }

  // Pill / dot colour per show: ska family red, dub & soundsystem green, everything else gold.
  const GENRE_COLORS = {
    ska: "var(--red)",
    "ska-punk": "var(--red)",
    rocksteady: "var(--red)",
    dub: "var(--green-text)",
    soundsystem: "var(--green-text)",
  };
  const genreColor = (s) => GENRE_COLORS[s.genres.find((g) => GENRE_COLORS[g])] || "var(--gold)";

  // Kalender: a Monday-first month grid. On narrow screens the cells only show dots
  // and the shows of the selected day are listed below the grid (see style.css).
  const pad2 = (n) => String(n).padStart(2, "0");
  const dayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const longDayFmt = new Intl.DateTimeFormat("de-CH", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  let calMonth = null; // first day of the month on display
  let calDay = ""; // selected day (YYYY-MM-DD) for the compact layout

  function renderCalendar(visible) {
    const today = todayStart();
    const todayKey = dayKey(today);
    if (!calMonth) calMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const y = calMonth.getFullYear();
    const m = calMonth.getMonth();
    const monthKey = `${y}-${pad2(m + 1)}`;
    const inMonth = (k) => k.startsWith(monthKey);

    const byDay = new Map();
    for (const s of visible) {
      if (!byDay.has(s.date)) byDay.set(s.date, []);
      byDay.get(s.date).push(s);
    }

    // Selected day: next day with shows from today on, else today, else the first day with shows.
    if (!inMonth(calDay)) {
      const withShows = [...byDay.keys()].filter(inMonth).sort();
      calDay =
        withShows.find((k) => k >= todayKey) ||
        (inMonth(todayKey) ? todayKey : withShows[0] || `${monthKey}-01`);
    }

    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const start = new Date(y, m, 1 - ((first.getDay() + 6) % 7));
    const end = new Date(y, m, last.getDate() + ((7 - last.getDay()) % 7));
    const cells = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = dayKey(d);
      const items = byDay.get(key) || [];
      const dow = d.getDay();
      const cls = ["cal-cell"];
      if (d.getMonth() !== m) cls.push("other");
      if (key === todayKey) cls.push("today");
      if (key === calDay) cls.push("selected");
      if (d < today) cls.push("past");
      if (dow === 0 || dow === 5 || dow === 6) cls.push("weekend");
      const label = `${longDayFmt.format(d)}${items.length ? `, ${items.length} ${items.length === 1 ? "Konzert" : "Konzerte"}` : ""}`;
      cells.push(`
        <div class="${cls.join(" ")}" data-day="${key}">
          <button type="button" class="cal-num" aria-label="${escape(label)}">${d.getDate()}</button>
          <span class="cal-dots" aria-hidden="true">${items
            .slice(0, 3)
            .map((s) => `<i style="background:${genreColor(s)}"></i>`)
            .join("")}</span>
          <div class="cal-pills">${items
            .map(
              (s) =>
                `<button type="button" class="pill" data-id="${escape(s.id)}" style="--pill:${genreColor(s)}" title="${escape(`${s.title} · ${s.venue}, ${s.city}`)}">${escape(s.title)}</button>`,
            )
            .join("")}</div>
        </div>`);
    }

    const selected = byDay.get(calDay) || [];
    calendarEl.innerHTML = `
      <div class="cal-head">
        <button type="button" class="cal-nav" data-cal="-1" aria-label="Vorheriger Monat">&lsaquo;</button>
        <h2 class="cal-title">${escape(monthFmt.format(calMonth))}</h2>
        <button type="button" class="cal-nav" data-cal="1" aria-label="Nächster Monat">&rsaquo;</button>
        <button type="button" class="linkish cal-today" data-cal="0">Heute</button>
      </div>
      <div class="cal-grid">
        ${["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((w) => `<span class="cal-dow">${w}</span>`).join("")}
        ${cells.join("")}
      </div>
      <section class="cal-day">
        <h2 class="month">${escape(longDayFmt.format(parseDay(calDay)))}</h2>
        ${
          selected.length
            ? `<ul class="shows">${selected.map(renderShow).join("")}</ul>`
            : `<p class="cal-empty">Keine Konzerte an diesem Tag.</p>`
        }
      </section>`;
  }

  calendarEl.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if (pill) return goToShow(pill.dataset.id);
    const nav = e.target.closest("[data-cal]");
    if (nav) {
      const step = Number(nav.dataset.cal);
      const t = todayStart();
      if (step) {
        calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + step, 1);
      } else {
        calMonth = new Date(t.getFullYear(), t.getMonth(), 1);
        calDay = dayKey(t);
      }
      renderCalendar(lastVisible);
      return;
    }
    const cell = e.target.closest("[data-day]");
    if (cell && e.target.closest(".cal-num")) {
      calDay = cell.dataset.day;
      renderCalendar(lastVisible);
    }
  });

  // Karte: Leaflet + OpenStreetMap, fetched only when the map is first opened.
  const LEAFLET = "https://unpkg.com/leaflet@1.9.4/dist/leaflet";
  const mapEl = el("map");
  const mapRest = el("map-rest");
  let leafletLoading = null;
  let map = null;
  let markerLayer = null;

  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletLoading) return leafletLoading;
    leafletLoading = new Promise((resolve, reject) => {
      // Wait for the stylesheet as well, so the first popup is not unstyled.
      const cssReady = new Promise((done) => {
        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = `${LEAFLET}.css`;
        css.crossOrigin = "";
        css.onload = css.onerror = done;
        document.head.appendChild(css);
      });
      const js = document.createElement("script");
      js.src = `${LEAFLET}.js`;
      js.crossOrigin = "";
      js.onload = () => cssReady.then(resolve);
      js.onerror = () => {
        leafletLoading = null;
        reject(new Error("Leaflet konnte nicht geladen werden"));
      };
      document.head.appendChild(js);
    });
    return leafletLoading;
  }

  const shortDate = (d) => `${dowFmt.format(d).replace(".", "")} ${d.getDate()}.${d.getMonth() + 1}.`;

  function renderMap(visible) {
    if (!window.L) {
      mapEl.innerHTML = `<p class="map-note">Karte wird geladen …</p>`;
      loadLeaflet().then(
        () => view === "map" && render(),
        () => {
          mapEl.innerHTML = `<p class="map-note">Die Karte konnte nicht geladen werden.</p>`;
        },
      );
      return;
    }
    if (!map) {
      mapEl.innerHTML = "";
      map = L.map(mapEl, { scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        className: "map-tiles",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
      }).addTo(map);
      markerLayer = L.layerGroup().addTo(map);
      // Leaflet stops clicks inside popups from bubbling up to the page, so the
      // show links are handled on the popup element itself (bound once per popup).
      map.on("popupopen", (e) => {
        const popup = e.popup.getElement();
        if (!popup || popup.dataset.bound) return;
        popup.dataset.bound = "1";
        popup.addEventListener("click", (ev) => {
          const a = ev.target.closest("a[data-id]");
          if (!a) return;
          ev.preventDefault();
          map.closePopup();
          goToShow(a.dataset.id);
        });
      });
    }
    markerLayer.clearLayers();

    const hasPos = (s) => typeof s.lat === "number" && typeof s.lon === "number";
    // One marker per venue; its popup lists the venue's shows.
    const venues = new Map();
    for (const s of visible.filter(hasPos)) {
      const key = `${s.venue}|${s.city}`;
      if (!venues.has(key)) venues.set(key, { s, items: [] });
      venues.get(key).items.push(s);
    }
    const points = [];
    // Google-Maps-style pins, filled with the red/gold/green stripes. Default: dark centre dot.
    // "Ich gehe": a gold star in the centre (like a saved place). Count badge = shows at this venue.
    let pinSeq = 0;
    const PIN_PATH = "M14 1C7 1 1.5 6.5 1.5 13.5c0 9.5 12.5 25 12.5 25s12.5-15.5 12.5-25C26.5 6.5 21 1 14 1z";
    const STAR = "M14 7.6l1.9 3.9 4.3.6-3.1 3 .7 4.3-3.8-2-3.8 2 .7-4.3-3.1-3 4.3-.6z";
    const pinIcon = (kind, count) => {
      const id = `pin${++pinSeq}`;
      const centre =
        kind === "going"
          ? `<circle cx="14" cy="13.5" r="7.5" fill="#14110e"/><path d="${STAR}" fill="#f2b632"/>`
          : `<circle cx="14" cy="13.5" r="5.5" fill="#14110e"/>`;
      return L.divIcon({
        className: "pin-icon" + (kind === "going" ? " going" : ""),
        html:
          `<svg viewBox="0 0 28 40" width="28" height="40" aria-hidden="true">` +
          `<clipPath id="${id}"><path d="${PIN_PATH}"/></clipPath>` +
          `<g clip-path="url(#${id})"><rect x="0" y="0" width="28" height="12" fill="#d8342f"/>` +
          `<rect x="0" y="12" width="28" height="9" fill="#f2b632"/><rect x="0" y="21" width="28" height="20" fill="#1e8f4e"/></g>` +
          `<path d="${PIN_PATH}" fill="none" stroke="#14110e" stroke-width="2"/>${centre}</svg>` +
          (count > 1 ? `<b>${count}</b>` : ""),
        iconSize: [28, 40],
        iconAnchor: [14, 39],
        popupAnchor: [0, -34],
      });
    };
    // Your own position: Google's blue dot with a soft halo.
    const youIcon = L.divIcon({
      className: "you-icon",
      html: `<span class="halo"></span><span class="dot"></span>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      popupAnchor: [0, -12],
    });
    const pinKind = (items) => (items.some((x) => marks[x.id] === "going") ? "going" : "venue");
    for (const { s, items } of venues.values()) {
      L.marker([s.lat, s.lon], { icon: pinIcon(pinKind(items), items.length), riseOnHover: true })
        .bindPopup(
          `<strong>${escape(s.venue)}</strong> · ${escape(s.city)}<ul class="popup-shows">${items
            .map(
              (x) =>
                `<li><a href="#${x._short}" data-id="${escape(x.id)}"><time>${shortDate(x._day)}</time> ${escape(x.title)}</a></li>`,
            )
            .join("")}</ul>`,
        )
        .addTo(markerLayer);
      points.push([s.lat, s.lon]);
    }
    if (here) {
      L.marker([here.lat, here.lon], { icon: youIcon, zIndexOffset: 1000 })
        .bindPopup("Du bist hier")
        .addTo(markerLayer);
      points.push([here.lat, here.lon]);
    }
    map.invalidateSize();
    if (points.length) map.fitBounds(points, { padding: [32, 32], maxZoom: 12 });
    else map.setView([46.8, 8.2], 7);

    const rest = visible.filter((s) => !hasPos(s));
    mapRest.innerHTML =
      `<p class="map-legend"><span class="pin-mini"></span>Venue mit Shows (Zahl = Anzahl) ` +
      `<span class="pin-mini star">★</span>«Ich gehe»${here ? ` <span class="pin-mini you"></span>du` : ""}</p>` +
      (rest.length
        ? `<section><h2 class="month">Ohne Standort</h2><ul class="shows">${rest.map(renderShow).join("")}</ul></section>`
        : "");
  }

  // --- Scrolling ---
  const filters = el("filters");

  // Month headings stick below the filter bar, so expose its real height to CSS.
  const setBarHeight = () =>
    document.documentElement.style.setProperty("--bar-h", `${filters.offsetHeight}px`);
  setBarHeight();
  if ("ResizeObserver" in window) new ResizeObserver(setBarHeight).observe(filters);

  // Show a divider under the filter bar only once it is actually stuck.
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => filters.classList.toggle("stuck", !entry.isIntersecting)).observe(
      el("stuck-sentinel"),
    );
  }

  // After filtering, the list may get shorter than the current scroll position;
  // jump back to the start of the results so the user doesn't land in empty space.
  function renderAndKeepInView() {
    render();
    if (views.hidden) return;
    const listTop = views.getBoundingClientRect().top + window.scrollY - filters.offsetHeight - 8;
    if (window.scrollY > listTop) window.scrollTo({ top: listTop });
  }

  // Scroll arrows for the chip row: only shown when there is something hidden in that direction.
  const genreWrap = genreBar.parentElement;
  function updateChipArrows() {
    const canLeft = genreBar.scrollLeft > 2;
    const canRight = genreBar.scrollLeft + genreBar.clientWidth < genreBar.scrollWidth - 2;
    genreWrap.classList.toggle("can-left", canLeft);
    genreWrap.classList.toggle("can-right", canRight);
    genreWrap.querySelector(".scroll-btn.left").hidden = !canLeft;
    genreWrap.querySelector(".scroll-btn.right").hidden = !canRight;
  }
  genreBar.addEventListener("scroll", updateChipArrows, { passive: true });
  window.addEventListener("resize", updateChipArrows);
  genreWrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".scroll-btn");
    if (btn)
      genreBar.scrollBy({
        left: Number(btn.dataset.dir) * genreBar.clientWidth * 0.7,
      });
  });

  // Drag the chip row with the mouse (touch scrolls natively). A real drag suppresses the click.
  let drag = null;
  genreBar.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") return;
    drag = { x: e.clientX, left: genreBar.scrollLeft, moved: false };
    genreBar.style.scrollBehavior = "auto";
  });
  genreBar.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) drag.moved = true;
    genreBar.scrollLeft = drag.left - dx;
  });
  const endDrag = () => {
    if (!drag) return;
    genreBar.style.scrollBehavior = "";
    const moved = drag.moved;
    drag = null;
    if (moved)
      genreBar.addEventListener("click", (e) => e.stopPropagation(), {
        capture: true,
        once: true,
      });
  };
  genreBar.addEventListener("pointerup", endDrag);
  genreBar.addEventListener("pointerleave", endDrag);
  genreBar.addEventListener("pointercancel", endDrag);

  genreBar.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    activeGenre = activeGenre === btn.dataset.genre ? "" : btn.dataset.genre;
    if (btn.dataset.genre === "") genreBar.scrollTo({ left: 0 });
    for (const c of genreBar.querySelectorAll(".chip")) {
      c.setAttribute("aria-pressed", String(c.dataset.genre === activeGenre));
    }
    renderAndKeepInView();
  });

  cantonSelect.addEventListener("change", renderAndKeepInView);
  search.addEventListener("input", renderAndKeepInView);
  init();
})();
