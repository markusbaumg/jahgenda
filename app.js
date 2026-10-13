(() => {
  const DATA_URL = "data/shows.json";
  const VENUES_URL = "data/venues.json";
  const GENRES_URL = "data/genres.json";
  const SLOGANS_URL = "data/slogans.json";
  let genreOrder = []; // slugs in display order (from data/genres.json)
  let genreLabel = {}; // slug → label
  let venueSites = {}; // normalised venue name → website/programme URL (from data/venues.json)
  let venuePlaces = []; // {city, lat, lon} per known venue – the nearest one is the start for the SBB link
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
  // The map is the remembered view: fetch Leaflet now, in parallel with the data, not after it.
  if (view === "map") {
    const l = document.createElement("link");
    l.rel = "preload";
    l.as = "script";
    l.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    l.crossOrigin = "";
    document.head.appendChild(l);
  }
  let lastVisible = []; // the currently filtered shows, for view-only re-renders
  const status = el("status");
  const resultsText = el("results-text");
  const resultsLive = el("results-live"); // screen readers: the count after every filter change
  let showPast = false;
  let pastCount = 0;
  const cantons = new Set(); // selected canton / region codes (empty = all)
  let radiusKm = 0; // 0 = no distance filter; only applies once the position is known
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
  const pad2 = (n) => String(n).padStart(2, "0");
  // Calendar export helpers (.ics and Google Calendar): local-time stamp YYYYMMDDTHHMM00 and the
  // [start, end] of a timed show - shows have no end time in the data, so they last three hours
  // (wall-clock hours, which is what a floating-time calendar entry expects).
  const SHOW_HOURS = 3;
  const localStamp = (x) =>
    `${x.getFullYear()}${pad2(x.getMonth() + 1)}${pad2(x.getDate())}T${pad2(x.getHours())}${pad2(x.getMinutes())}00`;
  const showSpan = (s) => {
    const [h, m] = s.time.split(":").map(Number);
    const [y, mo, d] = [s._day.getFullYear(), s._day.getMonth(), s._day.getDate()];
    return [new Date(y, mo, d, h, m), new Date(y, mo, d, h + SHOW_HOURS, m)];
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

  // The town nearest to the user's position (from the venue list) – the "von" of the SBB timetable link.
  let homeCity = "";
  let geoDeclined = false; // the browser said no: no «Distanz & Zug anzeigen» placeholder in the rows
  function updateHomeCity() {
    if (!here || !venuePlaces.length) return;
    const near = venuePlaces.map((p) => ({ p, km: distanceKm(here, p) })).sort((a, b) => a.km - b.km)[0];
    homeCity = near && near.km < 60 ? near.p.city : "";
  }
  // SBB timetable from the user's town to the show's town, arriving an hour before the show
  // (20:00 when no time is known). Same contract as lib.js sbbUrl (pinned by tests/lib.test.mjs).
  function sbbUrl(s) {
    if (!homeCity || homeCity === s.city) return "";
    const [h, m] = (s.time || "20:00").split(":").map(Number);
    const arrive = new Date(s._day.getFullYear(), s._day.getMonth(), s._day.getDate(), h, m - 60);
    const time = `${pad2(arrive.getHours())}:${pad2(arrive.getMinutes())}`;
    return `https://www.sbb.ch/de?von=${encodeURIComponent(homeCity)}&nach=${encodeURIComponent(s.city)}&date=${s.date}&time=${encodeURIComponent(time)}&moment=ARRIVAL`;
  }
  function sbbLink(s) {
    const url = sbbUrl(s);
    if (!url) return "";
    return `<a class="sbb" href="${url}" target="_blank" rel="noopener" title="SBB-Fahrplan ${escape(homeCity)} → ${escape(s.city)}, Ankunft eine Stunde vor der Show" aria-label="SBB-Fahrplan nach ${escape(s.city)}">SBB</a>`;
  }
  function distanceLabel(s) {
    if (typeof s.lat !== "number" || typeof s.lon !== "number") return "";
    // No position yet: a placeholder that only shows on hover and asks for it (gone once declined).
    if (!here)
      return geoDeclined
        ? ""
        : ` · <button type="button" class="geo-ask" title="Standort freigeben: dann steht hier die Distanz zu dir und ein Link zur Zugverbindung">Distanz &amp; Zug anzeigen</button>`;
    return ` · <span class="dist" title="Luftlinie von deinem Standort">${formatKm(distanceKm(here, s))}${sbbLink(s)}</span>`;
  }

  // Venue name as a link to the venue's site when data/venues.json knows it.
  const venueLink = (s) => {
    const u = venueSites[venueKey(s.venue)];
    return u
      ? `<a class="venue-link" href="${escape(u)}" target="_blank" rel="noopener" title="Website von ${escape(s.venue)} öffnen">${escape(s.venue)}</a>`
      : escape(s.venue);
  };

  const ICONS = {
    rss: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.2 15.6a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zM4 9.5a10.5 10.5 0 0 1 10.5 10.5h-3A7.5 7.5 0 0 0 4 12.5v-3zM4 3.5A16.5 16.5 0 0 1 20.5 20h-3A13.5 13.5 0 0 0 4 6.5v-3z"/></svg>',
    event:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14V3zM5 5h6v2H5v12h12v-6h2v8H3V5h2z"/></svg>',
    ticket:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7zm2 0v2.2A4 4 0 0 1 5 14.8V17h14v-2.2a4 4 0 0 1 0-5.6V7H5zm5 2h2v6h-2V9zm4 0h2v6h-2V9z"/></svg>',
    gcal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zM6 8v12h12V8H6zm3.5 2.5h5v1.6h-3.3v1h3v1.5h-3v1.2h3.4v1.6h-5.1z"/></svg>',
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zm-1 8v10h12V10H6zm2 2h3v3H8v-3z"/></svg>',
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.2 14.8l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 0 1 12 4zm-3 4.5c-.2 0-.5 0-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.2 5 4.4 2.5 1 3 .8 3.5.7.5 0 1.7-.7 2-1.4.2-.7.2-1.2.1-1.4l-.5-.3-1.8-.9c-.3-.1-.5-.1-.6.1l-.9 1.1c-.2.2-.3.2-.6.1a6.5 6.5 0 0 1-3.3-2.9c-.2-.4.3-.4.8-1.4.1-.2 0-.4 0-.5l-.9-2c-.2-.5-.4-.4-.6-.4H9z"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10.6 13.4a1 1 0 0 1 0 1.4 4 4 0 0 1-5.7-5.7l3-3a4 4 0 0 1 5.6 0 1 1 0 1 1-1.4 1.4 2 2 0 0 0-2.8 0l-3 3a2 2 0 0 0 2.9 2.9 1 1 0 0 1 1.4 0zm2.8-2.8a1 1 0 0 1 0-1.4 4 4 0 0 1 5.7 5.7l-3 3a4 4 0 0 1-5.6 0 1 1 0 1 1 1.4-1.4 2 2 0 0 0 2.8 0l3-3a2 2 0 0 0-2.9-2.9 1 1 0 0 1-1.4 0z"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.2 6.8.8-5 4.7 1.3 6.8L12 17.6 6 21l1.3-6.8-5-4.7 6.8-.8z"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg>',
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
    // RFC 5545 text escaping; a bare CR would end the content line, so it is dropped.
    const esc = (t) =>
      String(t)
        .replace(/\r/g, "")
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\n/g, "\\n");
    let when;
    if (s.time) {
      const [start, end] = showSpan(s);
      when = `DTSTART:${localStamp(start)}\r\nDTEND:${localStamp(end)}`;
    } else {
      when = `DTSTART;VALUE=DATE:${s.date.replace(/-/g, "")}`;
    }
    return [
      "BEGIN:VEVENT",
      `UID:${s.id}@jahgenda`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, "")}`,
      when,
      `SUMMARY:${esc(s.title)}`,
      `LOCATION:${esc(`${s.venue}, ${s.city}`)}`,
      `DESCRIPTION:${esc(`${safeUrl(s.url) || ""}\n${showUrl(s)}`.trim())}`,
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
    let dates;
    if (s.time) {
      const [start, end] = showSpan(s);
      dates = `${localStamp(start)}/${localStamp(end)}`;
    } else {
      const next = new Date(s._day.getFullYear(), s._day.getMonth(), s._day.getDate() + 1);
      dates = `${s.date.replace(/-/g, "")}/${localStamp(next).slice(0, 8)}`;
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
      ? `<a href="${escape(url)}" target="_blank" rel="noopener" title="Konzertseite beim Veranstalter öffnen">${escape(s.title)}</a>`
      : escape(s.title);
    const time = s.time ? `<time>${escape(s.time)}</time> · ` : "";
    return `
      <li class="show${dow === 0 || dow === 5 || dow === 6 ? " weekend" : ""}${s._past ? " past" : ""}${markClass(s)}" id="${escape(s.id)}" data-id="${escape(s.id)}">
        <time class="date" datetime="${escape(s.date)}">
          <span class="dow">${dowFmt.format(d).replace(".", "")}</span>
          <span class="day">${String(d.getDate()).padStart(2, "0")}<i class="dot">.</i></span>
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
        <button type="button" class="canton${ABROAD[s.canton] ? " abroad" : ""}" data-canton="${escape(s.canton)}" title="${escape(regionName(s.canton))} als Filter ein-/ausschalten"><img src="img/cantons/${escape(s.canton)}.svg" alt="" loading="lazy" decoding="async">${escape(s.canton)}</button>
        <div class="foot-row">
            ${s.genres.length || (shared && shared[s.id] === "going") ? `<div class="tags">${s.genres.map((g) => `<span class="tag-chip">${escape(genreLabel[g] || g)}</span>`).join("")}${shared && shared[s.id] === "going" ? `<span class="tag-chip going">geht hin</span>` : ""}</div>` : ""}
            <div class="actions">
              ${actionsHtml(s)}
              <button type="button" class="act more" data-act="more" aria-haspopup="dialog" aria-expanded="false" title="Aktionen zu dieser Show">${ICONS.more}<span>Mehr</span></button>
            </div>
          </div>
      </li>`;
  }

  // The per-show actions, shared by the row (short labels) and the action sheet (long labels).
  // Links carry their href, buttons carry data-act – both are handled by runAction().
  function actionsHtml(s, long = false) {
    const url = safeUrl(s.url);
    const tickets = safeUrl(s.tickets);
    return [
      starButton(s),
      `<button type="button" class="act" data-act="cal" title="Als .ics speichern (Apple, Outlook …)">${ICONS.cal}<span>Kalender${long ? " (.ics)" : ""}</span></button>`,
      `<a class="act" href="${escape(gcalUrl(s))}" target="_blank" rel="noopener" title="In Google Kalender eintragen">${ICONS.gcal}<span>Google${long ? " Kalender" : ""}</span></a>`,
      url
        ? `<a class="act event" href="${escape(url)}" target="_blank" rel="noopener" title="Event-Seite des Veranstalters öffnen">${ICONS.event}<span>Event${long ? "-Seite" : ""}</span></a>`
        : "",
      tickets
        ? `<a class="act tickets" href="${escape(tickets)}" target="_blank" rel="noopener" title="Tickets kaufen">${ICONS.ticket}<span>Tickets</span></a>`
        : "",
      `<a class="act" href="https://wa.me/?text=${encodeURIComponent(shareText(s))}" target="_blank" rel="noopener" title="Per WhatsApp teilen">${ICONS.wa}<span>WhatsApp</span></a>`,
      `<button type="button" class="act" data-act="link" title="Link zu dieser Show kopieren">${ICONS.link}<span>Link teilen</span></button>`,
    ].join("");
  }
  // Every filter except the date range (the histogram in the "Wann" panel uses exactly these).
  function matchesFilters(s) {
    const q = search.value.trim().toLowerCase();
    if (shared && !shared[s.id]) return false;
    if (mineOnly && !marks[s.id]) return false;
    if (cantons.size && !cantons.has(s.canton)) return false;
    if (radiusKm && here && typeof s.lat === "number" && distanceKm(here, s) > radiusKm) return false;
    if (activeGenre && !s.genres.includes(activeGenre)) return false;
    if (!q) return true;
    return [s.title, s.venue, s.city, regionName(s.canton), ...s.genres, ...s.acts]
      .join(" ")
      .toLowerCase()
      .includes(q);
  }
  const isVisible = (s) =>
    listMode() ? inList(s) : (!s._past || showPast) && inRange(s) && matchesFilters(s);

  function render() {
    const q = search.value.trim().toLowerCase();
    const visible = shows.filter(isVisible);

    const filtered = Boolean(
      cantons.size || activeGenre || q || mineOnly || shared || rangeActive() || (here && radiusKm),
    );
    el("clear-filters").hidden = !filtered;
    updateMine();
    updateWhen();
    lastVisible = visible;
    const v = listMode() ? "list" : view; // the list mode always shows the list; the stored view returns on close
    if (!visible.length) {
      list.innerHTML = "";
      calendarEl.innerHTML = "";
      mapRest.innerHTML = "";
      views.hidden = true;
      resultsText.textContent = "";
      resultsLive.textContent = ""; // #status (role=status) announces "Nichts gefunden" itself
      status.innerHTML = listMode()
        ? `<p class="state-icon">${STATE_ICONS.search}</p><p class="big">Diese Liste ist leer</p><p>Keine der Shows ist mehr in der Agenda.</p><button type="button" class="primary" id="reset" title="Zurück zur Agenda">Zurück zur Agenda</button>`
        : shows.some((s) => !s._past)
          ? `<p class="state-icon">${STATE_ICONS.search}</p><p class="big">Nichts gefunden</p><p>Keine Konzerte für diese Auswahl.</p><button type="button" class="primary" id="reset" title="Alle Filter zurücksetzen">Filter zurücksetzen</button>`
          : `<p class="state-icon">${STATE_ICONS.calendar}</p><p class="big">Noch nichts im Kalender</p><p>Sobald der Scraper etwas findet, steht es hier.</p>`;
      return;
    }
    status.innerHTML = "";
    views.hidden = false;
    const span = monthSpan(visible);
    const rangeNote = rangeActive() ? ` · ${rangeLabel()}` : "";
    resultsText.textContent = shared
      ? `Geteilte Liste · ${visible.length} ${visible.length === 1 ? "Show" : "Shows"} · ${span}${rangeNote}`
      : `${visible.length} ${visible.length === 1 ? "Konzert" : "Konzerte"}${filtered ? " für diese Auswahl" : ""} · ${span}${rangeNote}`;
    resultsLive.textContent = resultsText.textContent;

    list.hidden = v !== "list";
    calendarEl.hidden = v !== "calendar";
    mapView.hidden = v !== "map";
    // Only the active view keeps its rows: the calendar's day list and the map's
    // "Ohne Standort" list reuse the row ids, and #id links must find the list row.
    if (v !== "list") list.innerHTML = "";
    if (v !== "calendar") calendarEl.innerHTML = "";
    if (v !== "map") mapRest.innerHTML = "";
    if (v === "calendar") {
      renderCalendar(visible);
      return;
    }
    if (v === "map") {
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

  // "Oktober 2026" or "Oktober 2026 – Dezember 2026": the months a (sorted) list of shows spans.
  function monthSpan(visible) {
    const first = visible[0]._day;
    const last = visible[visible.length - 1]._day;
    return first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()
      ? monthFmt.format(first)
      : `${monthFmt.format(first)} – ${monthFmt.format(last)}`;
  }

  // Tagline: one of the slogans (same lines as on the stickers), rotating by day.
  fetch(SLOGANS_URL, { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const list = (d && d.slogans) || [];
      if (!list.length) return;
      const line = list[Math.floor(Math.random() * list.length)];
      const tag = el("tagline");
      if (tag) tag.textContent = line;
      const mini = el("mini-tag");
      if (mini) mini.textContent = line;
    })
    .catch(() => {});

  // The venue database (large: it carries the scraper's notes) is not needed for the first paint –
  // the venue names become links and the SBB start town is known a moment later. render() is
  // idempotent, so a second pass is cheap.
  function loadVenues() {
    fetch(VENUES_URL, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        for (const [name, info] of Object.entries((v && v.venues) || {})) {
          if (!info) continue;
          if (safeUrl(info.url)) venueSites[venueKey(name)] = info.url;
          if (typeof info.lat === "number" && typeof info.lon === "number" && info.city)
            venuePlaces.push({ city: info.city, lat: info.lat, lon: info.lon });
        }
        if (!venuePlaces.length && !Object.keys(venueSites).length) return;
        updateHomeCity();
        if (!shows.length) return;
        render();
        // A deep-linked row was rebuilt just now: keep its highlight.
        const target = findShow(decodeHashPart(location.hash.slice(1)));
        const row = target && document.getElementById(target.id);
        if (row) row.classList.add("highlight");
      })
      .catch(() => {
        /* venues.json is optional for the page */
      });
  }

  async function init() {
    try {
      const [res, gres] = await Promise.all([
        fetch(DATA_URL, { cache: "no-cache" }),
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
      setupWhen();
      // Canton chips (multi-select, with counts) inside the Wo panel: Swiss cantons A–Z, the
      // neighbouring countries at the end.
      const perCanton = new Map();
      for (const s of shows) perCanton.set(s.canton, (perCanton.get(s.canton) || 0) + 1);
      const used = [...perCanton.keys()].sort(
        (a, b) =>
          (ABROAD[a] ? 1 : 0) - (ABROAD[b] ? 1 : 0) || regionName(a).localeCompare(regionName(b), "de"),
      );
      el("canton-chips").innerHTML =
        `<button type="button" class="chip" data-canton="" aria-pressed="true" title="Alle Kantone anzeigen">Alle</button>` +
        used
          .map((c) => {
            const name = ABROAD[c] ? ABROAD[c].replace(/ \(grenznah\)$/, "") : regionName(c);
            const title = `${regionName(c)}: ${perCanton.get(c)} ${perCanton.get(c) === 1 ? "Show" : "Shows"} – anklicken zum Ein-/Ausschalten`;
            return `<button type="button" class="chip${ABROAD[c] ? " abroad" : ""}" data-canton="${escape(c)}" aria-pressed="false" title="${escape(title)}"><img src="img/cantons/${escape(c)}.svg" alt="" width="14" height="16">${escape(name)}<small>${perCanton.get(c)}</small></button>`;
          })
          .join("");
      updateWhere();

      // Genre chips: one toggle per genre that occurs at least once, in the order of data/genres.json
      // (unknown slugs go last, alphabetically).
      const counts = new Map();
      for (const s of shows) for (const g of s.genres) counts.set(g, (counts.get(g) || 0) + 1);
      const rank = (g) => (genreOrder.includes(g) ? genreOrder.indexOf(g) : genreOrder.length);
      genreBar.innerHTML =
        `<button type="button" class="chip" data-genre="" aria-pressed="true" title="Alle Genres anzeigen">Alle</button>` +
        [...counts]
          .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
          .map(
            ([g, n]) =>
              `<button type="button" class="chip" data-genre="${escape(g)}" aria-pressed="false" title="Nur ${escape(genreLabel[g] || g)} anzeigen (${n})">${escape(genreLabel[g] || g)}<small>${n}</small></button>`,
          )
          .join("");
      updateChipArrows();

      if (data.updated) {
        const note = data.source === "mock" ? " · Beispieldaten" : "";
        el("updated").textContent = `Stand: ${stampFmt.format(new Date(data.updated))}${note}`;
      }
      render();
      revealFromHash();
      loadVenues();
      autoLocate();
    } catch (err) {
      console.error(err);
      // The skeleton rows go, so the message is the first thing under the bar (not below the fold).
      list.innerHTML = "";
      views.hidden = true;
      status.innerHTML = `<p class="state-icon">${STATE_ICONS.offline}</p><p class="big">Kein Empfang</p><p>Die Konzerte konnten nicht geladen werden. Bitte später nochmals versuchen.</p>`;
    }
  }

  // Canton badge in a row: toggles that canton in the Wo filter.
  list.addEventListener("click", (e) => {
    const c = e.target.closest(".canton[data-canton]");
    if (!c) return;
    toggleCanton(c.dataset.canton);
    renderAndKeepInView();
  });

  // Per-show button actions (mark / calendar / copy link / open the action sheet); the other
  // actions are plain links. One handler for the row buttons and for the action sheet.
  async function runAction(btn, s, row) {
    const act = btn.dataset.act;
    if (act === "mark") cycleMark(s, row);
    if (act === "cal") downloadIcs(icsFor(s), `${s.id}.ics`);
    if (act === "more") openSheet(btn, s, row);
    if (act === "link") {
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
  }
  // Bound on the views wrapper, because the calendar and the map reuse the show rows.
  views.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const row = btn.closest(".show");
    const s = shows.find((x) => x.id === row.dataset.id);
    if (s) runAction(btn, s, row);
  });

  // --- Action sheet: on phones and touch screens the row actions collapse into "⋯ Mehr" (+ the star), which
  // opens this sheet – a bottom sheet on phones, a popover under the button on wider touch screens. It holds
  // the same buttons and links as the row (actionsHtml) and delegates to runAction(); nothing is duplicated.
  const sheet = document.createElement("div");
  sheet.className = "sheet";
  sheet.hidden = true;
  sheet.innerHTML =
    `<div class="sheet-backdrop" data-close></div>` +
    `<div class="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="sheet-title">` +
    `<div class="sheet-head"><h2 class="sheet-title" id="sheet-title"></h2>` +
    `<button type="button" class="sheet-close" data-close title="Schliessen" aria-label="Schliessen">&times;</button></div>` +
    `<div class="sheet-actions"></div></div>`;
  document.body.appendChild(sheet);
  const sheetPanel = sheet.querySelector(".sheet-panel");
  const sheetTitle = sheet.querySelector(".sheet-title");
  const sheetActions = sheet.querySelector(".sheet-actions");
  const phoneMq = matchMedia("(max-width: 600px)");
  let sheetShow = null; // the show the open sheet belongs to
  let sheetRow = null; // its row in the list (for the star state)
  let sheetTrigger = null; // the "⋯" button that opened it (gets the focus back)

  function openSheet(btn, s, row) {
    closeSheet();
    sheetShow = s;
    sheetRow = row;
    sheetTrigger = btn;
    sheetTitle.textContent = s.title;
    sheetActions.innerHTML = actionsHtml(s, true);
    syncSheetMark();
    btn.setAttribute("aria-expanded", "true");
    sheet.classList.toggle("popover", !phoneMq.matches);
    sheet.hidden = false;
    if (!phoneMq.matches) {
      // Popover: under the button, right-aligned with it; above it when there is no room below.
      const r = btn.getBoundingClientRect();
      const h = sheetPanel.offsetHeight;
      const top = r.bottom + 6 + h > innerHeight ? r.top - 6 - h : r.bottom + 6;
      sheetPanel.style.top = `${Math.max(8, top)}px`;
      sheetPanel.style.right = `${Math.max(8, innerWidth - r.right)}px`;
    }
    sheetActions.querySelector(".act").focus();
  }
  // The sheet's star mirrors the row's state (label and colour).
  function syncSheetMark() {
    const st = marks[sheetShow.id] || "";
    sheetPanel.classList.toggle("interested", st === "interested");
    sheetPanel.classList.toggle("going", st === "going");
    sheetActions.querySelector(".star span").textContent = MARK_LABEL[st];
  }
  function closeSheet() {
    if (sheet.hidden) return;
    sheet.hidden = true;
    sheetTrigger.setAttribute("aria-expanded", "false");
    if (sheetTrigger.isConnected) sheetTrigger.focus();
    sheetShow = sheetRow = sheetTrigger = null;
  }
  sheet.addEventListener("click", async (e) => {
    if (e.target.closest("[data-close]")) return closeSheet();
    const act = e.target.closest(".act");
    if (!act) return;
    if (!act.dataset.act) return closeSheet(); // a plain link (Google, Event, Tickets, WhatsApp) opens in a new tab
    await runAction(act, sheetShow, sheetRow);
    if (act.dataset.act === "mark") {
      // "Meine Shows" re-renders the list when the last mark goes; then the row (and the sheet) is gone.
      if (sheetRow.isConnected) syncSheetMark();
      else closeSheet();
    } else if (act.dataset.act === "link")
      setTimeout(closeSheet, 1200); // let "Kopiert" be seen
    else closeSheet();
  });
  // Focus stays in the sheet while it is open; Esc closes it.
  sheet.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const f = [...sheetPanel.querySelectorAll("button, a[href]")];
    const edge = e.shiftKey ? f[0] : f[f.length - 1];
    if (document.activeElement === edge) {
      e.preventDefault();
      (e.shiftKey ? f[f.length - 1] : f[0]).focus();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !sheet.hidden) closeSheet();
  });
  // A popover is anchored to the button; a resize or layout switch invalidates its position.
  addEventListener("resize", () => {
    if (sheet.classList.contains("popover")) closeSheet();
  });
  phoneMq.addEventListener("change", closeSheet);

  function resetFilters() {
    cantons.clear();
    radiusKm = 0;
    updateWhere();
    search.value = "";
    activeGenre = "";
    mineOnly = false;
    clearRange();
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

  // Direct links: #<show id> scrolls to the show and highlights it (clearing filters if needed).
  function revealFromHash() {
    if (/^#(mine|m)=/.test(location.hash)) return showShared();
    const target = findShow(decodeHashPart(location.hash.slice(1)));
    if (!target) return;
    const id = target.id;
    if (target._past && !showPast) showPast = true;
    if (target._past) pastAuto = false; // the link asked for it, so a later range reset keeps it
    // Rows only exist in the list view; the calendar and the map link here.
    if (view !== "list") setView("list");
    if (!document.getElementById(id)) resetFilters();
    const row = document.getElementById(id);
    if (!row) return;
    row.classList.remove("highlight");
    void row.offsetWidth; // restart the animation
    row.classList.add("highlight");
    const motion = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    row.scrollIntoView({ block: "start", behavior: motion });
  }
  window.addEventListener("hashchange", revealFromHash);

  // --- Filter panels (Wo / Wann): dropdowns under the sticky bar, only one open at a time. ---
  // Open with the toolbar button, close with ×, Escape, the button again or a click/tap outside.
  const filtersForm = el("filters");
  const PANELS = { where: ["toggle-where", "where-panel"], when: ["toggle-when", "when-panel"] };
  let openPanel = null;
  function setPanel(name) {
    openPanel = name;
    for (const [key, [btn, panel]] of Object.entries(PANELS)) {
      el(panel).hidden = key !== name;
      el(btn).setAttribute("aria-expanded", String(key === name));
    }
    if (name === "when") updateWhen();
  }
  filtersForm.addEventListener("click", (e) => {
    const close = e.target.closest(".panel-close");
    if (!close) return;
    const panel = close.closest(".panel").id === "where-panel" ? "where" : "when";
    setPanel(null);
    el(PANELS[panel][0]).focus();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !openPanel) return;
    const btn = PANELS[openPanel][0];
    setPanel(null);
    el(btn).focus();
  });
  document.addEventListener("click", (e) => {
    // A chip that re-rendered itself on click is detached by now – that is not an outside click.
    if (openPanel && e.target.isConnected && !filtersForm.contains(e.target)) setPanel(null);
  });

  // --- Wo: canton chips (multi-select) + own position (+ radius) behind the pin button ---
  const toggleWhere = el("toggle-where");
  function toggleCanton(code) {
    if (cantons.has(code)) cantons.delete(code);
    else cantons.add(code);
    updateWhere();
  }
  function whereLabel() {
    const codes = [...cantons];
    const parts = [];
    if (codes.length > 3) parts.push(`${codes.length} Kantone`);
    else if (codes.length) parts.push(codes.join(" · "));
    if (here && radiusKm) parts.push(`≤ ${radiusKm} km`);
    return parts.join(" · ");
  }
  function updateWhere() {
    const label = whereLabel();
    const badge = toggleWhere.querySelector("b");
    badge.textContent = label;
    badge.hidden = !label;
    // The badge only names real filters; a known position just lights the pin up.
    toggleWhere.classList.toggle("located", Boolean(here));
    toggleWhere.setAttribute("aria-pressed", String(Boolean(cantons.size || (here && radiusKm))));
    toggleWhere.title = label ? `Wo: ${label} (ändern)` : "Wo: Kantone wählen oder meinen Standort verwenden";
    for (const c of el("canton-chips").querySelectorAll(".chip"))
      c.setAttribute(
        "aria-pressed",
        String(c.dataset.canton ? cantons.has(c.dataset.canton) : !cantons.size),
      );
    el("where-radius").hidden = !here;
    for (const r of el("where-radius").querySelectorAll(".chip"))
      r.setAttribute("aria-pressed", String(Number(r.dataset.radius) === radiusKm));
  }
  toggleWhere.addEventListener("click", () => setPanel(openPanel === "where" ? null : "where"));
  el("canton-chips").addEventListener("click", (e) => {
    const c = e.target.closest(".chip[data-canton]");
    if (!c) return;
    if (c.dataset.canton) toggleCanton(c.dataset.canton);
    else {
      cantons.clear();
      updateWhere();
    }
    renderAndKeepInView();
  });
  el("where-radius").addEventListener("click", (e) => {
    const r = e.target.closest(".chip[data-radius]");
    if (!r) return;
    radiusKm = Number(r.dataset.radius);
    updateWhere();
    renderAndKeepInView();
  });

  const locateBtn = el("locate");
  const geoStatus = el("geo-status");

  if (!("geolocation" in navigator)) locateBtn.hidden = true;

  // Ask the browser for the position. Used by the Wo button and by the placeholder in every row; on
  // start only silently, when the browser already allows it (never a permission prompt the visitor did
  // not ask for – a reflexive «Block» would kill the feature for good).
  // The position is only used in this browser tab; it is never stored or sent anywhere.
  let locating = false;
  function locate(opts = {}) {
    const silent = Boolean(opts.silent);
    if (locating || !("geolocation" in navigator)) return;
    locating = true;
    if (!silent) geoStatus.textContent = "Suche dich …";
    locateBtn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locating = false;
        here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        geoDeclined = false;
        updateHomeCity();
        locateBtn.disabled = false;
        locateBtn.classList.add("active");
        locateBtn.setAttribute("aria-pressed", "true");
        // Closest upcoming show (never a past one), as a link into the list.
        const near = shows
          .filter((s) => !s._past && typeof s.lat === "number")
          .map((s) => ({ s, km: distanceKm(here, s) }))
          .sort((a, b) => a.km - b.km)
          .slice(0, 1);
        updateWhere();
        if (near.length) {
          const n = near[0];
          const when = `${dowFmt.format(n.s._day).replace(".", "")} ${n.s._day.getDate()}.${n.s._day.getMonth() + 1}.`;
          geoStatus.innerHTML =
            `<span class="geo-pin">📍</span> Am nächsten bei dir: ` +
            `<a href="#${n.s._short}" title="Zur Show in der Liste springen"><strong>${escape(n.s.title)}</strong></a>, ${escape(when)} in ${escape(n.s.city)} · ` +
            `<span class="dist" title="Luftlinie von deinem Standort">${formatKm(n.km)}${sbbLink(n.s)}</span>`;
        } else {
          geoStatus.textContent = "Standort gefunden – die Distanzen stehen jetzt bei jeder Show.";
        }
        render();
      },
      (err) => {
        locating = false;
        locateBtn.disabled = false;
        // 1 = the browser (or the visitor) blocks the position: the row placeholders go, the panel says how
        // to get it back. Anything else (timeout, no fix) is transient: the row placeholders stay.
        const blocked = err && err.code === 1;
        if (blocked) geoDeclined = true;
        if (!silent)
          geoStatus.textContent = blocked
            ? "Standort im Browser blockiert. In den Website-Einstellungen freigeben, dann nochmals «Mein Standort» tippen."
            : "Standort nicht verfügbar. Kein Stress, die Agenda geht auch so.";
        render();
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }
  locateBtn.addEventListener("click", () => locate());
  list.addEventListener("click", (e) => {
    if (e.target.closest(".geo-ask")) locate();
  });
  // On start: silently when permission was granted before – nothing else. A browser that has never been
  // asked waits for a tap on «Mein Standort» or «Distanz & Zug anzeigen»; one that said no is left alone.
  function autoLocate() {
    if (!("geolocation" in navigator) || !shows.length) return;
    if (!navigator.permissions || !navigator.permissions.query) return;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((p) => {
        if (p.state === "granted") locate({ silent: true });
        else if (p.state === "denied") geoDeclined = true;
      })
      .catch(() => {});
  }

  // --- Meine Shows: mark shows as "Interessiert" / "Ich gehe", filter to them, share the list. ---
  // Marks live only in this browser (localStorage); without it they last for the page view.
  const MARK_LABEL = {
    "": "Merken",
    interested: "Interessiert",
    going: "Ich gehe",
  };
  const NEXT_MARK = { "": "interested", interested: "going", going: "" };
  // Tooltip of the star button: what the next click does.
  const MARK_TITLE = {
    "": "Als «Interessiert» merken",
    interested: "Als «Ich gehe» markieren",
    going: "Markierung entfernen",
  };
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
  let shared = null; // { id: state } from a #m=… link: the list is filtered to those shows
  const toggleMine = el("toggle-mine");
  const minePanel = el("mine-panel");

  function saveMarks() {
    store.set(store.KEYS.MARKS, marks);
  }
  const markedShows = () => shows.filter((s) => marks[s.id]);
  const markClass = (s) =>
    `${marks[s.id] ? ` ${marks[s.id]}` : ""}${shared && shared[s.id] ? " shared-row" : ""}`;
  const starButton = (s) =>
    `<button type="button" class="act star" data-act="mark" title="${MARK_TITLE[marks[s.id] || ""]}">${ICONS.star}<span>${MARK_LABEL[marks[s.id] || ""]}</span></button>`;
  const dayShort = (s) =>
    `${dowFmt.format(s._day).replace(".", "")} ${s._day.getDate()}.${s._day.getMonth() + 1}.`;
  const mineUrl = () =>
    `${location.origin}${location.pathname}#m=` +
    markedShows()
      .map((s) => `${s._short}${marks[s.id][0]}`)
      .join(",");

  minePanel.innerHTML =
    `<span class="mine-note"></span>` +
    `<button type="button" class="act take" data-mine="take" title="Alle Shows dieser Liste in meine Shows übernehmen" hidden>${ICONS.star}<span>Alle merken</span></button>` +
    `<button type="button" class="act" data-mine="ics" title="Diese Liste als .ics speichern (Apple, Outlook …)">${ICONS.cal}<span>Kalender exportieren (.ics)</span></button>` +
    `<button type="button" class="act" data-mine="share" title="Link zu dieser Liste kopieren">${ICONS.link}<span>Liste teilen</span></button>` +
    `<a class="act" id="mine-wa" href="#" target="_blank" rel="noopener" title="Diese Liste per WhatsApp teilen">${ICONS.wa}<span>WhatsApp</span></a>`;

  function updateMine() {
    const n = markedShows().length;
    toggleMine.hidden = n === 0;
    toggleMine.setAttribute("aria-pressed", String(mineOnly));
    toggleMine.title = mineOnly ? "Wieder alle Shows anzeigen" : "Nur meine Shows anzeigen";
    toggleMine.querySelector("b").textContent = n;
    minePanel.hidden = !listMode() || !listShows().length;
    if (!minePanel.hidden) {
      el("mine-wa").href =
        `https://wa.me/?text=${encodeURIComponent(`${shared ? "Reggae-Shows" : "Meine Reggae-Shows"}: ${listUrl()}`)}`;
      const take = minePanel.querySelector(".take");
      take.hidden = !shared;
      take.disabled = Boolean(shared) && Object.keys(shared).every((id) => marks[id]);
      take.querySelector("span").textContent = take.disabled ? "Alle gemerkt ✓" : "Alle merken";
      minePanel.querySelector(".mine-note").textContent = !shared
        ? "Gespeichert in diesem Browser. Aufs andere Handy oder zu Freunden: «Liste teilen» und dort «Alle merken»."
        : take.disabled
          ? "Diese Shows sind in deinen Shows (★) gespeichert."
          : "Aus einem Link geöffnet. Bei dir ist nichts gespeichert, bis du «Alle merken» drückst.";
    }
    syncListMode();
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
    row.querySelector(".star").title = MARK_TITLE[next];
    updateMine();
  }

  toggleMine.addEventListener("click", () => {
    mineOnly = !mineOnly;
    renderAndKeepInView();
  });

  minePanel.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-mine]");
    if (!btn) return;
    if (btn.dataset.mine === "ics")
      downloadIcs(
        icsWrap(listShows().flatMap((s) => vevent(s, listMark(s) === "going" ? "CONFIRMED" : "TENTATIVE"))),
        shared ? "geteilte-shows.ics" : "meine-shows.ics",
      );
    if (btn.dataset.mine === "share") {
      // The #m= link is the shareable artefact: it goes to the clipboard and into the address bar.
      const url = listUrl();
      if (!shared) history.replaceState(null, "", url);
      const label = btn.querySelector("span");
      try {
        await Promise.race([
          navigator.clipboard.writeText(url),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 1000)),
        ]);
        label.textContent = "Kopiert";
      } catch {
        label.textContent = "Kopieren nicht möglich";
      }
      setTimeout(() => (label.textContent = "Liste teilen"), 1500);
    }
    if (btn.dataset.mine === "take" && shared) {
      // Never overwrites or downgrades an own mark; the friend's "Ich gehe" stays a "geht hin" chip.
      for (const id of Object.keys(shared)) if (!marks[id]) marks[id] = "interested";
      saveMarks();
      render();
    }
  });

  // A friend's list (#m=…): the page switches to the list mode with exactly those shows; the friend's "going"
  // marks show as a small chip. Nothing is written to the visitor's marks until «Alle merken».
  function showShared() {
    shared = {};
    sharedBy = "";
    // New form #m=<short><g|i>,…[,von:<Name>] ; old form #mine=<id>:<g|i>,… still accepted.
    const raw = location.hash.replace(/^#(mine|m)=/, "");
    for (const part of raw.split(",")) {
      if (part.startsWith("von:")) {
        sharedBy = decodeHashPart(part.slice(4)).trim().slice(0, 40);
        continue;
      }
      let token, st;
      if (part.includes(":")) [token, st] = part.split(":").map(decodeHashPart);
      else [token, st] = [decodeHashPart(part.slice(0, -1)), part.slice(-1)];
      const show = token && findShow(token);
      if (show) shared[show.id] = st === "g" ? "going" : "interested";
    }
    const ids = Object.keys(shared);
    if (!ids.length) {
      shared = null;
      return;
    }
    // The visitor's own link (every marked show, nothing else): that is simply "Meine Shows".
    if (ids.length === markedShows().length && ids.every((id) => marks[id])) {
      shared = null;
      history.replaceState(null, "", location.pathname + location.search);
      mineOnly = true;
    }
    if (ids.some((id) => findShow(id)?._past)) {
      showPast = true;
      pastAuto = false;
    }
    render();
    el("list-title").focus({ preventScroll: true }); // opened from a link: announce the heading
  }

  // --- Listenmodus: ★ Meine Shows or a friend's list (#m=…) shows only that list. body.list-mode folds every
  // other filter away (CSS); a slim header in the sticky bar carries ✕ "Zurück zur Agenda", title and count.
  // The ★ stays in place (pressed) and Esc closes too. #mine-panel below holds the list actions.
  // Filters are bypassed, not cleared: search, Wo, genre, Wann and the view come back 1:1 on close.
  const listHead = el("list-head");
  const BASE_TITLE = document.title;
  let sharedBy = ""; // optional "von:<Name>" token in a #m= link
  listHead.innerHTML =
    `<button type="button" class="list-close" id="list-close" title="Zurück zur Agenda (Esc)" aria-label="Zurück zur Agenda"><b aria-hidden="true">✕</b><span>Zurück<i> zur Agenda</i></span></button>` +
    `<h2 class="list-title" id="list-title" tabindex="-1"></h2>`;
  function listMode() {
    return Boolean(shared || mineOnly);
  }
  const inList = (s) => Boolean(shared ? shared[s.id] : marks[s.id]);
  const listMark = (s) => (shared ? shared[s.id] : marks[s.id]);
  const listShows = () => shows.filter(inList);
  const listUrl = () => (shared ? `${location.origin}${location.pathname}${location.hash}` : mineUrl());
  const SHARED_HASH = /^#(mine|m)=/;
  // The only hook: every render() ends here (via updateMine).
  function syncListMode() {
    const on = listMode();
    const was = document.body.classList.contains("list-mode");
    document.body.classList.toggle("list-mode", on);
    document.body.classList.toggle("list-shared", Boolean(shared));
    listHead.hidden = !on;
    filtersForm.setAttribute("role", on ? "region" : "search");
    if (on) filtersForm.setAttribute("aria-labelledby", "list-title");
    else filtersForm.removeAttribute("aria-labelledby");
    document.title = on ? `${shared ? "Geteilte Liste" : "Meine Shows"} · Jahgenda` : BASE_TITLE;
    if (!on) {
      // Leaving the mode by any exit (✕, Esc, ★, last mark gone, reset): a #m= link that «Liste teilen» or a
      // friend put into the address bar goes too. Not on the first render, which precedes revealFromHash().
      if (was && SHARED_HASH.test(location.hash))
        history.replaceState(null, "", location.pathname + location.search);
      return;
    }
    if (!was && openPanel) setPanel(null); // fold Wo/Wann away; their settings survive
    const l = listShows();
    const n = l.length;
    const span = n ? `<i> · ${monthSpan(l)}</i>` : ""; // phones drop the months (the heading below has them)
    el("list-title").innerHTML = shared
      ? `${ICONS.star}<span class="t">${sharedBy ? `<i>Geteilte </i>Liste von ${escape(sharedBy)}` : "Geteilte Liste"}</span><b class="n">${n} ${n === 1 ? "Show" : "Shows"}${span}</b>`
      : `${ICONS.star}<span class="t">Meine Shows</span><b class="n">${n}${span}</b>`;
  }
  function closeListMode() {
    mineOnly = false;
    shared = null;
    sharedBy = "";
    renderAndKeepInView(); // → syncListMode strips a #m= hash
    (toggleMine.hidden ? search : toggleMine).focus({ preventScroll: true });
  }
  listHead.addEventListener("click", (e) => {
    if (e.target.closest("#list-close")) closeListMode();
  });
  // Capture phase, so that the action sheet and the Wo/Wann panels (which own Esc while open) go first.
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || !listMode() || !sheet.hidden || openPanel) return;
      closeListMode();
    },
    true,
  );

  // --- Wann: quick picks (Heute / Wochenende / 7 Tage) or any set of months. ---
  // The choice lives for this visit only (nothing is stored). Default = no range = everything upcoming.
  const toggleWhen = el("toggle-when");
  const whenPanel = el("when-panel");
  const whenMonths = el("when-months");
  const whenCount = el("when-count");
  const togglePast = el("toggle-past");
  const pastLabel = togglePast.closest("label");
  let rangeFrom = null; // local day (Date) or null – set by a quick pick
  let rangeTo = null;
  const months = new Set(); // selected months as "YYYY-M" keys – set by the month chips
  let pastAuto = false; // past shows were switched on by a choice that reaches into the past
  let monthList = []; // every month from the first show (or today) to the last show

  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const sameDay = (a, b) => a.getTime() === b.getTime();
  const dm = (d) => `${d.getDate()}.${d.getMonth() + 1}.`;
  const monthKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}`;
  const monthStart = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
  const shortMonthFmt = new Intl.DateTimeFormat("de-CH", { month: "short" });
  // "Okt" this year, "Jan ’27" in another year.
  const monthLabel = (d) =>
    `${shortMonthFmt.format(d).replace(".", "")}${d.getFullYear() === todayStart().getFullYear() ? "" : ` ’${String(d.getFullYear()).slice(2)}`}`;
  const rangeActive = () => Boolean(months.size || (rangeFrom && rangeTo));
  const inRange = (s) => {
    if (months.size) return months.has(monthKey(s._day));
    return !(rangeFrom && rangeTo) || (s._day >= rangeFrom && s._day <= rangeTo);
  };
  function rangeLabel() {
    if (months.size) {
      const picked = monthList.filter((d) => months.has(monthKey(d)));
      return picked.length > 2 ? `${picked.length} Monate` : picked.map(monthLabel).join(", ");
    }
    return sameDay(rangeFrom, rangeTo) ? dm(rangeFrom) : `${dm(rangeFrom)}–${dm(rangeTo)}`;
  }

  function setupWhen() {
    toggleWhen.hidden = !shows.length;
    if (!shows.length) return;
    const today = todayStart();
    const first = monthStart(shows[0]._day < today ? shows[0]._day : today);
    const last = monthStart(shows[shows.length - 1]._day > today ? shows[shows.length - 1]._day : today);
    monthList = [];
    for (let d = first; d <= last; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) monthList.push(d);
  }

  // Past shows follow the choice: a month before this one switches them on, and off again once no
  // such month is selected any more (unless the user switched them on by hand).
  function syncPast() {
    const thisMonth = monthStart(todayStart());
    const reachesPast = [...months].some((k) => monthList.find((d) => monthKey(d) === k) < thisMonth);
    if (reachesPast && !showPast) {
      showPast = true;
      pastAuto = true;
    } else if (!reachesPast && pastAuto) {
      showPast = false;
      pastAuto = false;
    }
  }
  function setRange(from, to) {
    months.clear();
    rangeFrom = from;
    rangeTo = to;
    syncPast();
  }
  function clearRange() {
    rangeFrom = rangeTo = null;
    months.clear();
    syncPast();
  }

  // Quick picks, as [from, to].
  function quickRange(kind) {
    const today = todayStart();
    const dow = today.getDay(); // 0 = Sunday
    if (kind === "today") return [today, today];
    if (kind === "weekend")
      return [dow === 0 || dow >= 5 ? today : addDays(today, 5 - dow), addDays(today, (7 - dow) % 7)];
    return [today, addDays(today, Number(kind) - 1)];
  }

  // Button, badge, past checkbox and (when open) month chips with counts, quick chips and the count.
  function updateWhen() {
    if (!monthList.length) return;
    const active = rangeActive();
    toggleWhen.setAttribute("aria-pressed", String(active));
    toggleWhen.title = active ? `Wann: ${rangeLabel()} (ändern)` : "Wann: Zeitraum wählen";
    const badge = toggleWhen.querySelector("b");
    badge.hidden = !active;
    badge.textContent = active ? rangeLabel() : "";
    const past = mineOnly ? markedShows().filter((s) => s._past).length : pastCount;
    pastLabel.hidden = past === 0;
    togglePast.checked = showPast;
    if (openPanel !== "when") return;

    // Histogram: one clickable bar per month over the whole span, counted with every filter except the time.
    const counts = new Map();
    for (const s of shows)
      if (matchesFilters(s)) counts.set(monthKey(s._day), (counts.get(monthKey(s._day)) || 0) + 1);
    const thisMonth = monthStart(todayStart());
    const max = Math.max(1, ...counts.values());
    whenMonths.innerHTML = monthList
      .map((d) => {
        const k = monthKey(d);
        const n = counts.get(k) || 0;
        const cls = ["bar"];
        if (!n) cls.push("empty");
        if (d < thisMonth) cls.push("past");
        if (months.size && !months.has(k)) cls.push("dim");
        if (monthKey(d) === monthKey(thisMonth)) cls.push("today");
        const title = `${monthFmt.format(d)}: ${n === 1 ? "1 Konzert" : `${n} Konzerte`}${d < thisMonth ? " (vergangen)" : ""} – anklicken zum Ein-/Ausschalten`;
        return `<button type="button" class="${cls.join(" ")}" data-month="${k}" aria-pressed="${months.has(k)}" title="${escape(title)}" style="--h:${Math.round((n / max) * 100)}%"><b>${n || ""}</b><i></i><span>${monthLabel(d)}</span></button>`;
      })
      .join("");
    for (const chip of whenPanel.querySelectorAll("[data-quick]")) {
      const [qa, qb] = quickRange(chip.dataset.quick);
      chip.setAttribute(
        "aria-pressed",
        String(!months.size && rangeFrom && sameDay(qa, rangeFrom) && sameDay(qb, rangeTo)),
      );
    }
    const n = shows.filter(isVisible).length;
    whenCount.textContent = active
      ? `${n} ${n === 1 ? "Konzert" : "Konzerte"} im Zeitraum`
      : `${n} ${n === 1 ? "Konzert" : "Konzerte"}, alle kommenden`;
  }

  toggleWhen.addEventListener("click", () => setPanel(openPanel === "when" ? null : "when"));
  whenPanel.addEventListener("click", (e) => {
    const quick = e.target.closest("[data-quick]");
    const month = e.target.closest("[data-month]");
    if (quick) {
      const [a, b] = quickRange(quick.dataset.quick);
      if (!months.size && rangeFrom && sameDay(a, rangeFrom) && sameDay(b, rangeTo)) clearRange();
      else setRange(a, b);
    } else if (month) {
      rangeFrom = rangeTo = null;
      if (months.has(month.dataset.month)) months.delete(month.dataset.month);
      else months.add(month.dataset.month);
      syncPast();
    } else if (e.target.id === "when-reset") {
      clearRange();
      showPast = false;
      pastAuto = false;
    } else return;
    renderAndKeepInView();
  });
  togglePast.addEventListener("change", () => {
    showPast = togglePast.checked;
    pastAuto = false;
    renderAndKeepInView();
  });

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
          <button type="button" class="cal-num" aria-label="${escape(label)}" title="Tag auswählen: ${escape(label)}">${d.getDate()}</button>
          <span class="cal-dots" aria-hidden="true">${items
            .slice(0, 3)
            .map((s) => `<i style="background:${genreColor(s)}"></i>`)
            .join("")}</span>
          <div class="cal-pills">${items
            .map(
              (s) =>
                `<button type="button" class="pill" data-id="${escape(s.id)}" style="--pill:${genreColor(s)}" title="${escape(`${s.title} · ${s.venue}, ${s.city}`)} – zur Show in der Liste springen">${escape(s.title)}</button>`,
            )
            .join("")}</div>
        </div>`);
    }

    const selected = byDay.get(calDay) || [];
    calendarEl.innerHTML = `
      <div class="cal-head">
        <button type="button" class="cal-nav" data-cal="-1" aria-label="Vorheriger Monat" title="Vorheriger Monat">&lsaquo;</button>
        <h2 class="cal-title">${escape(monthFmt.format(calMonth))}</h2>
        <button type="button" class="cal-nav" data-cal="1" aria-label="Nächster Monat" title="Nächster Monat">&rsaquo;</button>
        <button type="button" class="linkish cal-today" data-cal="0" title="Zum aktuellen Monat springen">Heute</button>
        <button type="button" class="linkish cal-subscribe" data-subscribe title="Alle Shows als Kalender abonnieren – aktualisiert sich von selbst">${ICONS.rss} Abonnieren</button>
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
    // The whole day cell selects the day (the number button stays for keyboard and screen readers).
    const cell = e.target.closest("[data-day]");
    if (cell) {
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
      map = L.map(mapEl, { scrollWheelZoom: false, zoomControl: false });
      // Leaflet's own controls get German tooltips.
      L.control.zoom({ zoomInTitle: "Hineinzoomen", zoomOutTitle: "Herauszoomen" }).addTo(map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        className: "map-tiles",
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" title="OpenStreetMap-Lizenz öffnen">OpenStreetMap</a>-Mitwirkende',
      }).addTo(map);
      for (const a of mapEl.querySelectorAll(".leaflet-control-attribution a"))
        if (/leafletjs/.test(a.href)) a.title = "Leaflet-Website öffnen";
      markerLayer = L.layerGroup().addTo(map);
      // Leaflet stops clicks inside popups from bubbling up to the page, so the
      // show links are handled on the popup element itself (bound once per popup).
      map.on("popupopen", (e) => {
        const popup = e.popup.getElement();
        if (!popup || popup.dataset.bound) return;
        popup.dataset.bound = "1";
        const close = popup.querySelector(".leaflet-popup-close-button");
        if (close) close.title = "Schliessen";
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
      L.marker([s.lat, s.lon], {
        icon: pinIcon(pinKind(items), items.length),
        riseOnHover: true,
        title: `${s.venue}, ${s.city}: ${items.length === 1 ? "1 Show" : `${items.length} Shows`} anzeigen`,
      })
        .bindPopup(
          `<strong>${escape(s.venue)}</strong> · ${escape(s.city)}<ul class="popup-shows">${items
            .map(
              (x) =>
                `<li><a href="#${x._short}" data-id="${escape(x.id)}" title="Zur Show in der Liste springen"><time>${shortDate(x._day)}</time> ${escape(x.title)}</a></li>`,
            )
            .join("")}</ul>`,
          // Leaflet's default popup (300 px + margins + ×) is wider than the map on a phone.
          { maxWidth: Math.min(300, mapEl.clientWidth - 70), autoPanPadding: [24, 24] },
        )
        .addTo(markerLayer);
      points.push([s.lat, s.lon]);
    }
    if (here) {
      L.marker([here.lat, here.lon], { icon: youIcon, zIndexOffset: 1000, title: "Dein Standort" })
        .bindPopup("Du bist hier")
        .addTo(markerLayer);
      points.push([here.lat, here.lon]);
    }
    map.invalidateSize();
    if (points.length) map.fitBounds(points, { padding: [32, 32], maxZoom: 12 });
    else map.setView([46.8, 8.2], 7);

    const rest = visible.filter((s) => !hasPos(s));
    mapRest.innerHTML =
      `<p class="map-legend"><span class="legend-item"><span class="pin-mini"></span>Venue mit Shows (Zahl = Anzahl)</span> ` +
      `<span class="legend-item"><span class="pin-mini star">★</span>«Ich gehe»</span>` +
      `${here ? ` <span class="legend-item"><span class="pin-mini you"></span>du</span>` : ""}</p>` +
      (rest.length
        ? `<section><h2 class="month">Ohne Standort</h2><ul class="shows">${rest.map(renderShow).join("")}</ul></section>`
        : "");
  }

  // --- Kalender abonnieren: the same callout as the install nudge --------------------------------
  const FEED_BASE = "https://markusbaumg.github.io/jahgenda/";
  const feedUrl = (region) => FEED_BASE + (region ? `jahgenda-${region}.ics` : "jahgenda.ics");
  function showSubscribe(force) {
    const canton = cantons.size === 1 ? [...cantons][0] : "";
    const url = feedUrl(canton);
    window.jahCallout.show({
      id: "subscribe",
      force,
      title: canton ? `Shows in ${regionName(canton)} in deinem Kalender` : "Alle Shows in deinem Kalender",
      text: "Einmal abonnieren – danach hält sich der Kalender selbst aktuell.",
      actions: [
        {
          label: "Apple / Outlook",
          primary: true,
          href: url.replace("https://", "webcal://"),
          title: "In Apple Kalender oder Outlook abonnieren",
        },
        {
          label: "Google",
          href: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url)}`,
          external: true,
          title: "In Google Kalender abonnieren",
        },
        {
          label: "Adresse kopieren",
          title: "Feed-Adresse kopieren (für jede Kalender-App)",
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(url);
              const b = document.querySelector('.callout [data-callout-action="2"]');
              if (b) b.textContent = "Kopiert";
            } catch {
              prompt("Feed-Adresse:", url);
            }
          },
        },
      ],
    });
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-subscribe]");
    if (!b) return;
    e.preventDefault();
    showSubscribe(true);
  });
  // Nudge once: after the visitor has scrolled into the list (not on the first second).
  let nudged = false;
  window.addEventListener(
    "scroll",
    () => {
      if (nudged || window.scrollY < 600 || !shows.length) return;
      nudged = true;
      setTimeout(() => showSubscribe(false), 1500);
    },
    { passive: true },
  );

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

  search.addEventListener("input", renderAndKeepInView);
  init();
})();
