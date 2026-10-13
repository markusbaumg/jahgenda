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
  // Leaflet 1.9.4 from unpkg: pinned by hash, so a tampered CDN copy never runs (and never gets cached).
  const LEAFLET_SRI = {
    js: "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=",
    css: "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=",
  };
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
    l.integrity = LEAFLET_SRI.js;
    l.crossOrigin = "";
    document.head.appendChild(l);
  }
  let lastVisible = []; // the currently filtered shows, for view-only re-renders
  const status = el("status");
  // "loading" | "ready" | "error": while loading or after an error a filter tap must not replace the
  // skeleton or the error message with a false «Noch nichts im Kalender».
  let loadState = "loading";
  const SKELETON = list.innerHTML;
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

  // Search folding: accents and umlauts go (geneve = Genève, zurich = Zürich), typographic apostrophes
  // become plain ones (L’Usine = L'Usine), ß → ss. A query spelt with ae/oe/ue is tried both ways
  // (zuerich = Zürich). Every whitespace-separated word must match somewhere ("ska punk", "Busters Fette").
  const fold = (t) =>
    String(t)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’‘`´]/g, "'")
      .replace(/ß/g, "ss")
      .toLowerCase();
  const deUmlaut = (t) => t.replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u");
  // Spoken short names of the big towns (keys folded like the query); a canton's code or its French /
  // Italian name finds its shows too.
  const SEARCH_ALIASES = { winti: "winterthur", barn: "bern", lozarn: "luzern", zuri: "zurich" };
  const CANTON_ALIASES = {
    BE: "Berne",
    BL: "Bâle-Campagne",
    BS: "Bâle-Ville",
    FR: "Fribourg",
    GE: "Genève Geneva",
    GR: "Grigioni Grischun",
    LU: "Lucerne",
    NE: "Neuchâtel",
    TI: "Ticino",
    VD: "Vaud",
    VS: "Valais",
    ZH: "Zurich",
  };
  const searchText = (s) =>
    fold(
      [
        s.title,
        s.venue,
        s.city,
        regionName(s.canton),
        CANTON_ALIASES[s.canton] || "",
        ...s.genres,
        ...s.genres.map((g) => genreLabel[g] || ""),
        ...s.acts,
      ].join(" "),
    );
  function matchesSearch(s, q) {
    for (const raw of q.split(/\s+/).filter(Boolean)) {
      const t = SEARCH_ALIASES[raw] || raw;
      if (s._hay.includes(t) || s._hay.includes(deUmlaut(t)) || String(s.canton).toLowerCase() === raw)
        continue;
      return false;
    }
    return true;
  }

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

  const formatKm = (km) =>
    km < 1 ? "gleich um die Ecke" : `≈ ${km < 10 ? km.toFixed(1) : Math.round(km)} km`;

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
    // The separator travels with the button (both only show on hover), so no lone «·» ends the line.
    if (!here)
      return geoDeclined
        ? ""
        : `<span class="geo-hint"> · <button type="button" class="geo-ask" title="Standort freigeben: dann steht hier die Distanz zu dir und ein Link zur Zugverbindung">Distanz &amp; Zug anzeigen</button></span>`;
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
    train:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2c-4 0-8 .5-8 4v9.5A3.5 3.5 0 0 0 7.5 19L6 20.5V21h2l2-2h4l2 2h2v-.5L16.5 19a3.5 3.5 0 0 0 3.5-3.5V6c0-3.5-4-4-8-4zm-5.5 4c.2-1 2.6-2 5.5-2s5.3 1 5.5 2H6.5zM6 8h12v4H6V8zm1.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>',
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
  // callout.js loads after this file: always look it up when needed.
  const callout = () => window.jahCallout;
  let nudgeQuietUntil = 0; // no nudge for a moment after a filter interaction or a deep-link landing
  // A nudge (install, subscribe) waits while the visitor is busy with a panel, the sheet, the map, a
  // filter they just touched, or has just landed on a shared show. callout.js is the last script on the
  // page, and the agenda can be in before it has run (a cached or fixture response beats a busy server):
  // the blocker is handed over once both are there, whichever comes last.
  const nudgeBlocked = () =>
    Boolean(openPanel) || !sheet.hidden || view === "map" || Date.now() < nudgeQuietUntil;
  function armCallout() {
    if (callout()) callout().setBlocker(nudgeBlocked);
    else if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", armCallout, { once: true });
  }

  const shareText = (s) =>
    `${s.title} – ${dowFmt.format(s._day).replace(".", "")} ${s._day.getDate()}.${s._day.getMonth() + 1}.${s._day.getFullYear()}` +
    `${s.time ? ` ${s.time}` : ""} · ${s.venue}, ${s.city}\n${showUrl(s)}`;

  // Europe/Zurich with its EU summer-time rules, as in the subscription feed (scripts/make_ics.py):
  // a timed show carries DTSTART;TZID=…, so a phone set to another zone still shows the Swiss hour.
  const TZID = "Europe/Zurich";
  const VTIMEZONE = [
    "BEGIN:VTIMEZONE",
    `TZID:${TZID}`,
    "BEGIN:STANDARD",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "END:STANDARD",
    "BEGIN:DAYLIGHT",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "END:DAYLIGHT",
    "END:VTIMEZONE",
  ];
  // One VEVENT for a show (Zurich time with TZID – floating time landed at 22:00 of whatever zone
  // the importing phone was set to).
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
      when = `DTSTART;TZID=${TZID}:${localStamp(start)}\r\nDTEND;TZID=${TZID}:${localStamp(end)}`;
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
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Jahgenda//DE",
      `X-WR-TIMEZONE:${TZID}`,
      ...VTIMEZONE,
      ...events,
      "END:VCALENDAR",
      "",
    ].join("\r\n");

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

  // The acts line only names who is not in the title already («The Slackers (US)» / «The Slackers»
  // doubled most rows; «Scorchers feat. Capital Soul Sinners» names its guests in the title).
  const extraActs = (s) => {
    const t = fold(s.title);
    return s.acts.filter((a) => !t.includes(fold(a)));
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
            extraActs(s).length
              ? `<p class="acts">${extraActs(s)
                  .map((a) => `<span>${escape(a)}</span>`)
                  .join("")}</p>`
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
      sbbUrl(s)
        ? `<a class="act sbb-act" href="${escape(sbbUrl(s))}" target="_blank" rel="noopener" title="SBB-Fahrplan ${escape(homeCity)} → ${escape(s.city)}, Ankunft eine Stunde vor der Show">${ICONS.train}<span>SBB${long ? "-Fahrplan" : ""}</span></a>`
        : "",
      `<a class="act" href="https://wa.me/?text=${encodeURIComponent(shareText(s))}" target="_blank" rel="noopener" title="Per WhatsApp teilen">${ICONS.wa}<span>WhatsApp</span></a>`,
      `<button type="button" class="act" data-act="link" title="Link zu dieser Show kopieren">${ICONS.link}<span>Link teilen</span></button>`,
    ].join("");
  }
  // Every filter except the date range (the histogram in the "Wann" panel uses exactly these).
  function matchesFilters(s) {
    const q = fold(search.value.trim());
    if (shared && !shared[s.id]) return false;
    if (mineOnly && !marks[s.id]) return false;
    if (cantons.size && !cantons.has(s.canton)) return false;
    if (radiusKm && here && typeof s.lat === "number" && distanceKm(here, s) > radiusKm) return false;
    if (activeGenre && !s.genres.includes(activeGenre)) return false;
    return !q || matchesSearch(s, q);
  }
  const isVisible = (s) =>
    listMode() ? inList(s) : (!s._past || showPast) && inRange(s) && matchesFilters(s);

  function render() {
    if (loadState !== "ready") return;
    const q = search.value.trim().toLowerCase();
    const visible = shows.filter(isVisible);

    const filtered = Boolean(
      cantons.size || activeGenre || q || mineOnly || shared || rangeActive() || (here && radiusKm),
    );
    el("clear-filters").hidden = !filtered;
    el("share-filters").hidden = !filtered || listMode();
    updateMine();
    updateWhen();
    lastVisible = visible;
    if (!visible.length) syncFilterHash();
    const v = listMode() ? "list" : view; // the list mode always shows the list; the stored view returns on close
    if (!visible.length) {
      list.innerHTML = "";
      calendarEl.innerHTML = "";
      mapRest.innerHTML = "";
      views.hidden = true;
      resultsText.textContent = "";
      el("results-count").textContent = "";
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
    syncFilterHash();
    const span = monthSpan(visible);
    const rangeNote = rangeActive() ? ` · ${rangeLabel()}` : "";
    resultsText.textContent = shared
      ? `Geteilte Liste · ${visible.length} ${visible.length === 1 ? "Show" : "Shows"} · ${span}${rangeNote}`
      : `${visible.length} ${visible.length === 1 ? "Konzert" : "Konzerte"}${filtered ? " für diese Auswahl" : ""} · ${span}${rangeNote}`;
    resultsLive.textContent = resultsText.textContent;
    // The count where the list begins (the full line with the span is in the footer bar).
    el("results-count").textContent = `${visible.length} ${visible.length === 1 ? "Konzert" : "Konzerte"}`;

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

  // --- Filter state in the URL: #q=…&g=…&wo=ZH,BE&r=25&wann=weekend|today|7|2026-10,2026-11&past=1 ---
  // Written with replaceState (a filter tap never adds a history entry), read once on load. A filtered
  // view can thus be reloaded, bookmarked and sent as a link; show links (#<short>) and list links
  // (#m=…) keep the hash for themselves and are never overwritten.
  const FILTER_HASH = /^#?[a-z]+=/;
  const isFilterHash = (h) => FILTER_HASH.test(h) && !SHARED_HASH.test(h);
  function filterParams() {
    const p = new URLSearchParams();
    const q = search.value.trim();
    if (q) p.set("q", q);
    if (activeGenre) p.set("g", activeGenre);
    if (cantons.size) p.set("wo", [...cantons].join(","));
    if (here && radiusKm) p.set("r", String(radiusKm));
    if (months.size)
      p.set(
        "wann",
        monthList
          .filter((d) => months.has(monthKey(d)))
          .map(monthKey)
          .join(","),
      );
    else if (rangeFrom && rangeTo) {
      const kind = ["today", "weekend", "7"].find((k) => {
        const [a, b] = quickRange(k);
        return sameDay(a, rangeFrom) && sameDay(b, rangeTo);
      });
      if (kind) p.set("wann", kind);
    }
    if (showPast && !pastAuto) p.set("past", "1");
    return p.toString().replace(/%2C/g, ",");
  }
  let filterTouched = false; // the render follows a filter tap (not a deep-link landing re-render)
  function syncFilterHash() {
    if (loadState !== "ready" || listMode()) return;
    const h = location.hash;
    // A show link (#<short>) stays while the page lands on it; a filter tap afterwards replaces it.
    if (h && !isFilterHash(h) && !filterTouched) return;
    const next = filterParams();
    if (next === h.slice(1)) return;
    history.replaceState(history.state, "", next ? `#${next}` : location.pathname + location.search);
  }
  function readFilterHash() {
    if (!isFilterHash(location.hash)) return;
    const p = new URLSearchParams(location.hash.slice(1));
    search.value = (p.get("q") || "").slice(0, 80);
    const g = p.get("g") || "";
    activeGenre = genreBar.querySelector(`.chip[data-genre="${CSS.escape(g)}"]`) ? g : "";
    for (const c of genreBar.querySelectorAll(".chip"))
      c.setAttribute("aria-pressed", String(c.dataset.genre === activeGenre));
    for (const c of (p.get("wo") || "").split(",")) if (CANTONS[c] || ABROAD[c]) cantons.add(c);
    const r = Number(p.get("r"));
    if ([10, 25, 50].includes(r)) radiusKm = r; // applies once the position is known
    const wann = p.get("wann") || "";
    if (["today", "weekend", "7"].includes(wann)) setRange(...quickRange(wann));
    else if (wann) {
      const keys = new Set(monthList.map(monthKey));
      for (const k of wann.split(",")) if (keys.has(k)) months.add(k);
      syncPast();
    }
    if (p.get("past") === "1") showPast = true;
    updateWhere();
  }
  // «Link zu dieser Auswahl»: the address bar already holds it – into the clipboard it goes.
  el("share-filters").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const label = btn.querySelector("span");
    syncFilterHash();
    try {
      await navigator.clipboard.writeText(location.href);
      label.textContent = "Kopiert";
    } catch {
      label.textContent = "Link in Adresszeile";
    }
    setTimeout(() => (label.textContent = "Link zu dieser Auswahl"), 1500);
  });

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
        keepRevealed();
      })
      .catch(() => {
        /* venues.json is optional for the page */
      });
  }

  // "Offline · Stand: …": the service worker serves the last copy without a connection; the stamp
  // says so, so the visitor knows the list may have moved on.
  let stampText = "";
  function updateStamp() {
    if (!stampText) return;
    el("updated").textContent = `${navigator.onLine === false ? "Offline · " : ""}${stampText}`;
  }
  window.addEventListener("online", updateStamp);
  window.addEventListener("offline", updateStamp);

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
        .map((s) => ({ ...s, _past: s._day < today, _short: shortId(s.id), _hay: searchText(s) }))
        .sort((a, b) => a._day - b._day || (a.time || "99:99").localeCompare(b.time || "99:99")); // unknown time last

      pastCount = shows.filter((s) => s._past).length;
      loadState = "ready";
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
            return `<button type="button" class="chip${ABROAD[c] ? " abroad" : ""}" data-canton="${escape(c)}" aria-pressed="false" aria-label="${escape(`${name}, ${perCanton.get(c)} ${perCanton.get(c) === 1 ? "Konzert" : "Konzerte"}`)}" title="${escape(title)}"><img src="img/cantons/${escape(c)}.svg" alt="" width="14" height="16">${escape(name)}<small>${perCanton.get(c)}</small></button>`;
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
              `<button type="button" class="chip" data-genre="${escape(g)}" aria-pressed="false" aria-label="${escape(`${genreLabel[g] || g}, ${n === 1 ? "1 Konzert" : `${n} Konzerte`}`)}" title="Nur ${escape(genreLabel[g] || g)} anzeigen (${n})">${escape(genreLabel[g] || g)}<small>${n}</small></button>`,
          )
          .join("");
      updateChipArrows();
      readFilterHash(); // a reloaded, bookmarked or shared filtered view

      if (data.updated) {
        const note = data.source === "mock" ? " · Beispieldaten" : "";
        // The scraper runs every night; a stamp older than two days means the data may be stale
        // (a cached copy, or the routine failed – the watchdog knows, the visitor should too).
        const old =
          Date.now() - new Date(data.updated).getTime() > 48 * 3600e3 ? " · evtl. nicht aktuell" : "";
        stampText = `Stand: ${stampFmt.format(new Date(data.updated))}${note}${old}`;
        updateStamp();
      }
      render();
      revealFromHash();
      loadVenues();
      autoLocate();
    } catch (err) {
      console.error(err);
      loadState = "error";
      // The skeleton rows go, so the message is the first thing under the bar (not below the fold).
      list.innerHTML = "";
      views.hidden = true;
      // «Kein Empfang» only when the browser is really offline; a server or data error while online
      // gets a title that matches, and both get a retry that needs no reload.
      const offline = navigator.onLine === false;
      status.innerHTML =
        `<p class="state-icon">${STATE_ICONS.offline}</p>` +
        `<p class="big">${offline ? "Kein Empfang" : "Daten konnten nicht geladen werden"}</p>` +
        `<p>${offline ? "Ohne Verbindung gibt es keine Agenda – sobald du wieder Netz hast, klappt es." : "Die Konzerte konnten nicht geladen werden. Bitte später nochmals versuchen."}</p>` +
        `<button type="button" class="primary" id="retry" title="Konzerte nochmals laden">Nochmals versuchen</button>`;
    }
  }
  function retry() {
    loadState = "loading";
    status.innerHTML = "";
    list.innerHTML = SKELETON;
    views.hidden = false;
    list.hidden = false;
    init();
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
    closeSheet({ keepHistory: true });
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
    pushOverlay("sheet");
    if (callout()) callout().suspend();
  }
  // The sheet's star mirrors the row's state (label and colour).
  function syncSheetMark() {
    const st = marks[sheetShow.id] || "";
    sheetPanel.classList.toggle("interested", st === "interested");
    sheetPanel.classList.toggle("going", st === "going");
    sheetActions.querySelector(".star span").textContent = MARK_LABEL[st];
  }
  function closeSheet(opts = {}) {
    if (sheet.hidden) return;
    sheet.hidden = true;
    sheetTrigger.setAttribute("aria-expanded", "false");
    if (sheetTrigger.isConnected) sheetTrigger.focus();
    sheetShow = sheetRow = sheetTrigger = null;
    if (!opts.keepHistory) popOverlay();
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
  phoneMq.addEventListener("change", () => closeSheet());

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
    if (e.target.id === "retry") retry();
  });
  el("clear-filters").addEventListener("click", () => {
    resetFilters();
    search.focus(); // the button is gone now; the focus must not drop to <body>
  });

  // Direct links: #<show id> scrolls to the show and highlights it (clearing filters if needed).
  // A re-render in the seconds after the jump (venues.json arrived, the position came in) rebuilds the
  // rows: keepRevealed() puts the highlight back and, while the rows above may still be shifting, scrolls
  // to the row again – otherwise the row ends up under the sticky bar.
  let revealUntil = 0;
  const hashTarget = () => findShow(decodeHashPart(location.hash.slice(1)));
  function keepRevealed() {
    const target = hashTarget();
    const row = target && document.getElementById(target.id);
    if (!row) return;
    row.classList.add("highlight");
    if (Date.now() < revealUntil) row.scrollIntoView({ block: "start" });
  }
  const linkNote = document.createElement("p");
  linkNote.className = "link-note";
  linkNote.setAttribute("role", "status");
  linkNote.hidden = true;
  el("results").after(linkNote);
  function noteLink(text) {
    linkNote.textContent = text;
    linkNote.hidden = !text;
  }
  function revealFromHash() {
    if (/^#(mine|m)=/.test(location.hash)) return showShared();
    const raw = location.hash.slice(1);
    if (!raw || raw.includes("=")) return; // nothing, or the filter state
    const target = findShow(decodeHashPart(raw));
    if (!target) {
      // An in-page anchor (the skip links, «Nach oben») is no show link.
      if (document.getElementById(raw)) return;
      // A stale or mistyped share link: say so instead of silently showing everything.
      if (loadState === "ready") {
        noteLink("Diese Show ist nicht mehr in der Agenda – hier ist alles, was kommt.");
        history.replaceState(history.state, "", location.pathname + location.search);
      }
      return;
    }
    noteLink("");
    const id = target.id;
    if (target._past && !showPast) showPast = true;
    if (target._past) pastAuto = false; // the link asked for it, so a later range reset keeps it
    // Rows only exist in the list view; the calendar and the map link here. An open panel would
    // cover the row (the «Am nächsten bei dir» link sits inside the Wo panel).
    if (view !== "list") setView("list");
    if (openPanel) setPanel(null);
    if (!document.getElementById(id)) resetFilters();
    const row = document.getElementById(id);
    if (!row) return;
    row.classList.remove("highlight");
    void row.offsetWidth; // restart the animation
    row.classList.add("highlight");
    quietScrollUntil = Date.now() + 2000;
    revealUntil = Date.now() + 3000;
    nudgeQuietUntil = Date.now() + 8000; // a friend's link lands on the show, not on a sticker
    const motion = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    row.scrollIntoView({ block: "start", behavior: motion });
    row.tabIndex = -1;
    row.focus({ preventScroll: true }); // the next Tab starts at the show, screen readers announce it
  }
  window.addEventListener("hashchange", revealFromHash);

  // --- History: the Back button (or swipe) closes an open Wo/Wann panel or the action sheet and returns
  // from a view switch or a calendar/map → list jump, instead of leaving the site – the reflex on phones.
  // Overlays and view switches push one entry each; filters never do (they live in the hash, see
  // syncFilterHash, written with replaceState so a filter click does not flood the history).
  const histState = (extra) => ({ jah: 1, view, ...extra });
  history.replaceState(histState(), "");
  let overlayEntry = false; // the current entry is one we pushed for an overlay
  let pendingBack = 0; // history.back() calls of our own: their popstate must not close what opened since
  let fromHistory = false; // closing because the visitor went back, not by ×/Esc/outside click
  function pushOverlay(name) {
    if (overlayEntry) history.replaceState(histState({ overlay: name }), "");
    else history.pushState(histState({ overlay: name }), "");
    overlayEntry = true;
  }
  function popOverlay() {
    if (fromHistory || !overlayEntry) return;
    overlayEntry = false;
    pendingBack++;
    history.back();
  }
  window.addEventListener("popstate", (e) => {
    if (pendingBack > 0) {
      pendingBack--;
      syncFilterHash(); // a filter picked while the panel was open lived on the entry just left
      return;
    }
    overlayEntry = false;
    fromHistory = true;
    if (openPanel) setPanel(null);
    if (!sheet.hidden) closeSheet();
    fromHistory = false;
    const st = e.state && e.state.jah ? e.state : null;
    if (st && st.view && st.view !== view && !listMode()) setView(st.view);
    syncFilterHash();
  });

  // --- Filter panels (Wo / Wann): dropdowns under the sticky bar, only one open at a time. ---
  // Open with the toolbar button, close with ×, Escape, the button again, a click/tap outside or Back.
  const filtersForm = el("filters");
  const PANELS = { where: ["toggle-where", "where-panel"], when: ["toggle-when", "when-panel"] };
  let openPanel = null;
  function setPanel(name) {
    const was = openPanel;
    openPanel = name;
    for (const [key, [btn, panel]] of Object.entries(PANELS)) {
      el(panel).hidden = key !== name;
      el(btn).setAttribute("aria-expanded", String(key === name));
    }
    if (name === "when") updateWhen();
    if (name) {
      pushOverlay(name);
      if (callout()) callout().suspend(); // a sticker never covers the panel's last rows
      // Keyboard and screen-reader users land in the panel, not 12 Tabs away from it.
      const first = el(PANELS[name][1]).querySelector(".chip:not([hidden])");
      if (first) first.focus({ preventScroll: true });
    } else if (was) popOverlay();
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
    toggleWhere.setAttribute("aria-label", `Wo: ${label || "alle Orte"}`); // the badge alone would be the name
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
        keepRevealed();
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
        keepRevealed();
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
    toggleMine.setAttribute("aria-label", `Meine Shows (${n})`); // aria-pressed carries the state
    toggleMine.querySelector("b").textContent = n;
    minePanel.hidden = !listMode() || !listShows().length;
    if (!minePanel.hidden) {
      el("mine-wa").href =
        `https://wa.me/?text=${encodeURIComponent(`${shared ? "Reggae-Shows" : "Meine Reggae-Shows"}: ${listUrl()}`)}`;
      const take = minePanel.querySelector(".take");
      take.hidden = !shared;
      take.disabled = Boolean(shared) && Object.keys(shared).every((id) => marks[id]);
      take.querySelector("span").textContent = take.disabled ? "Alle gemerkt ✓" : "Alle merken";
      const gone = sharedMissing
        ? ` ${sharedMissing === 1 ? "1 Show aus dem Link ist" : `${sharedMissing} Shows aus dem Link sind`} vorbei oder nicht mehr in der Agenda.`
        : "";
      minePanel.querySelector(".mine-note").textContent =
        (!shared
          ? "Gespeichert in diesem Browser. Aufs andere Handy oder zu Freunden: «Liste teilen» und dort «Alle merken»."
          : take.disabled
            ? "Diese Shows sind in deinen Shows (★) gespeichert."
            : "Aus einem Link geöffnet. Bei dir ist nichts gespeichert, bis du «Alle merken» drückst.") +
        gone;
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
    if (mineOnly) scrollViewsUnderBar(); // the list of marked shows comes up, not just the gold star
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
      el("list-title").focus({ preventScroll: true }); // the button turned into text: announce the list
    }
  });

  // A friend's list (#m=…): the page switches to the list mode with exactly those shows; the friend's "going"
  // marks show as a small chip. Nothing is written to the visitor's marks until «Alle merken».
  function showShared() {
    shared = {};
    sharedBy = "";
    sharedMissing = 0;
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
      else if (token) sharedMissing++;
    }
    const ids = Object.keys(shared);
    if (!ids.length) {
      shared = null;
      if (sharedMissing) {
        // Shows pass and are removed daily: an old list link ends up here. Say so, show everything.
        noteLink(
          "Die Shows aus diesem Link sind vorbei oder nicht mehr in der Agenda – hier ist alles, was kommt.",
        );
        history.replaceState(history.state, "", location.pathname + location.search);
      }
      render(); // a list that was on screen before (hashchange) goes
      return;
    }
    noteLink("");
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
  let sharedMissing = 0; // ids in a #m= link that no show matches any more (passed, removed)
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
    sharedMissing = 0;
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
  // "Okt" this year, "Jan ’27" in another year. In the histogram the year is only on the first month of
  // a new year (the labels sit 40 px apart; «Jan ’27 Feb ’27 Mär ’27» ran into each other).
  const monthLabel = (d, i) => {
    const name = shortMonthFmt.format(d).replace(".", "");
    const year = ` ’${String(d.getFullYear()).slice(2)}`;
    if (d.getFullYear() === todayStart().getFullYear()) return name;
    if (i === undefined) return name + year;
    const prev = monthList[i - 1];
    return !prev || prev.getFullYear() !== d.getFullYear() ? name + year : name;
  };
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
    toggleWhen.setAttribute("aria-label", `Wann: ${active ? rangeLabel() : "alle kommenden"}`);
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
      .map((d, i) => {
        const k = monthKey(d);
        const n = counts.get(k) || 0;
        const cls = ["bar"];
        if (!n) cls.push("empty");
        if (d < thisMonth) cls.push("past");
        if (months.size && !months.has(k)) cls.push("dim");
        if (monthKey(d) === monthKey(thisMonth)) cls.push("today");
        const count = n === 1 ? "1 Konzert" : `${n} Konzerte`;
        const title = `${monthFmt.format(d)}: ${count}${d < thisMonth ? " (vergangen)" : ""} – anklicken zum Ein-/Ausschalten`;
        return `<button type="button" class="${cls.join(" ")}" data-month="${k}" aria-pressed="${months.has(k)}" aria-label="${escape(`${monthFmt.format(d)}, ${count}`)}" title="${escape(title)}" style="--h:${(n / max).toFixed(2)}"><b>${n || ""}</b><i></i><span>${monthLabel(d, i)}</span></button>`;
      })
      .join("");
    whenMonths.classList.toggle("can-scroll", whenMonths.scrollWidth > whenMonths.clientWidth + 2);
    for (const chip of whenPanel.querySelectorAll("[data-quick]")) {
      const [qa, qb] = quickRange(chip.dataset.quick);
      chip.setAttribute(
        "aria-pressed",
        String(Boolean(!months.size && rangeFrom && sameDay(qa, rangeFrom) && sameDay(qb, rangeTo))),
      );
      // The weekend chip means this weekend from Friday on, the next one before: the tooltip says which.
      if (chip.dataset.quick === "weekend")
        chip.title = `Wochenende ${dm(qa)}–${dm(qb)} (Freitag bis Sonntag)`;
    }
    const n = shows.filter(isVisible).length;
    whenCount.textContent = active
      ? `${n} ${n === 1 ? "Konzert" : "Konzerte"} im Zeitraum`
      : n === 1
        ? "1 kommendes Konzert"
        : `Alle ${n} kommenden Konzerte`;
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
  function setView(next, opts = {}) {
    if (!VIEWS.includes(next)) return;
    view = next;
    store.set(store.KEYS.VIEW, view);
    markView();
    if (opts.push) history.pushState(histState(), "");
    else history.replaceState(histState(), "");
    if (callout() && opts.push) {
      callout().suspend(); // a nudge steps aside (the map must stay tappable)
      callout().hide(); // a callout opened on purpose closes with the view it belonged to
    }
    render();
    // A switch to the calendar or the map brings that view up under the bar (on a phone it would
    // otherwise start two thirds down the screen, behind the hero).
    if (opts.push && next !== "list") scrollViewsUnderBar();
  }
  function markView() {
    for (const b of viewSwitch.querySelectorAll("[data-view]"))
      b.setAttribute("aria-pressed", String(b.dataset.view === view));
  }
  markView();
  viewSwitch.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view]");
    if (btn && btn.dataset.view !== view) setView(btn.dataset.view, { push: true });
  });

  // Calendar pills and map popups link to the show's row in the list – with the same short hash the
  // share links use, as a history entry of its own (Back returns to the calendar or the map).
  function goToShow(id) {
    const s = shows.find((x) => x.id === id);
    if (!s) return;
    history.pushState(histState({ view: "list" }), "", `#${s._short}`);
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
      const other = d.getMonth() !== m;
      cells.push(`
        <div class="${cls.join(" ")}" data-day="${key}">
          ${
            other
              ? `<span class="cal-num" aria-hidden="true">${d.getDate()}</span>`
              : `<button type="button" class="cal-num" aria-label="${escape(label)}" title="Tag auswählen: ${escape(label)}">${d.getDate()}</button>`
          }
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
    // The arrows stop at the months that have shows (plus today's); an empty month says so and points
    // to the next show.
    const firstMonth = monthList[0];
    const lastMonth = monthList[monthList.length - 1];
    const prevOk = firstMonth && calMonth > firstMonth;
    const nextOk = lastMonth && calMonth < lastMonth;
    const inThisMonth = [...byDay.keys()].some(inMonth);
    const after = visible.find((s) => s._day >= new Date(y, m + 1, 1));
    const before = [...visible].reverse().find((s) => s._day < new Date(y, m, 1));
    const emptyNote = inThisMonth
      ? ""
      : `<p class="cal-empty cal-month-empty">Keine Konzerte im ${escape(monthFmt.format(calMonth))}.${
          after
            ? ` Nächste Show: <a href="#${after._short}" data-id="${escape(after.id)}">${escape(after.title)}</a>, ${escape(shortDate(after._day))}`
            : before
              ? ` Letzte Show: <a href="#${before._short}" data-id="${escape(before.id)}">${escape(before.title)}</a>, ${escape(shortDate(before._day))}`
              : ""
        }</p>`;
    const legend =
      `<p class="cal-legend" aria-hidden="true"><span><i style="background:var(--red)"></i>Ska, Ska-Punk, Rocksteady</span>` +
      `<span><i style="background:var(--green-text)"></i>Dub, Soundsystem</span><span><i style="background:var(--gold)"></i>Reggae &amp; mehr</span></p>`;
    calendarEl.innerHTML = `
      <div class="cal-head">
        <button type="button" class="cal-nav" data-cal="-1" aria-label="Vorheriger Monat" title="Vorheriger Monat"${prevOk ? "" : " disabled"}>&lsaquo;</button>
        <h2 class="cal-title">${escape(monthFmt.format(calMonth))}</h2>
        <button type="button" class="cal-nav" data-cal="1" aria-label="Nächster Monat" title="Nächster Monat"${nextOk ? "" : " disabled"}>&rsaquo;</button>
        <button type="button" class="linkish cal-today" data-cal="0" title="Zum aktuellen Monat springen">Heute</button>
        <button type="button" class="linkish cal-subscribe" data-subscribe title="Alle Shows als Kalender abonnieren – aktualisiert sich von selbst">${ICONS.rss} Abonnieren</button>
      </div>
      <div class="cal-grid">
        ${["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((w) => `<span class="cal-dow">${w}</span>`).join("")}
        ${cells.join("")}
      </div>
      ${emptyNote}${legend}
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
    const pill = e.target.closest(".pill, .cal-month-empty a[data-id]");
    if (pill) {
      e.preventDefault();
      return goToShow(pill.dataset.id);
    }
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
    // The whole day cell selects the day (the number button stays for keyboard and screen readers);
    // a day of the neighbouring month turns the page to that month.
    const cell = e.target.closest("[data-day]");
    if (cell) {
      calDay = cell.dataset.day;
      if (cell.classList.contains("other")) {
        const d = parseDay(calDay);
        calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
      }
      renderCalendar(lastVisible);
      // On the phone the day's shows are listed under the grid – below the fold: bring them up.
      const day = calendarEl.querySelector(".cal-day");
      if (
        day &&
        getComputedStyle(day).display !== "none" &&
        day.getBoundingClientRect().top > innerHeight - 120
      ) {
        quietScrollUntil = Date.now() + 1500;
        day.scrollIntoView({ block: "start", behavior: "smooth" });
      }
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
        css.integrity = LEAFLET_SRI.css;
        css.crossOrigin = "";
        css.onload = css.onerror = done;
        document.head.appendChild(css);
      });
      const js = document.createElement("script");
      js.src = `${LEAFLET}.js`;
      js.integrity = LEAFLET_SRI.js;
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
      // Leaflet's own controls get German tooltips. On touch screens the zoom buttons sit bottom right,
      // where no popup is ever panned underneath them (popups open at the top left).
      const touch = matchMedia("(hover: none)").matches;
      L.control
        .zoom({
          zoomInTitle: "Hineinzoomen",
          zoomOutTitle: "Herauszoomen",
          position: touch ? "bottomright" : "topleft",
        })
        .addTo(map);
      map.attributionControl.setPrefix(
        '<a href="https://leafletjs.com" title="Leaflet-Website öffnen" target="_blank" rel="noopener">Leaflet</a>',
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        className: "map-tiles",
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" title="OpenStreetMap-Lizenz öffnen">OpenStreetMap</a>-Mitwirkende',
      }).addTo(map);
      markerLayer = L.layerGroup().addTo(map);
      // Leaflet stops clicks inside popups from bubbling up to the page, so the
      // show links are handled on the popup element itself (bound once per popup).
      // Keyboard: the focus moves into the popup (first show), Escape closes it, the pin gets it back.
      let popupPin = null;
      map.on("popupopen", (e) => {
        const popup = e.popup.getElement();
        popupPin = e.popup._source && e.popup._source.getElement ? e.popup._source.getElement() : null;
        if (!popup) return;
        const close = popup.querySelector(".leaflet-popup-close-button");
        if (close) {
          close.title = "Schliessen";
          close.setAttribute("aria-label", "Schliessen");
        }
        const first = popup.querySelector("a[data-id]");
        if (first && popupPin && popupPin.contains(document.activeElement))
          first.focus({ preventScroll: true });
        if (popup.dataset.bound) return;
        popup.dataset.bound = "1";
        popup.addEventListener("click", (ev) => {
          const a = ev.target.closest("a[data-id]");
          if (!a) return;
          ev.preventDefault();
          map.closePopup();
          goToShow(a.dataset.id);
        });
      });
      map.on("popupclose", () => {
        if (popupPin && popupPin.isConnected && mapEl.contains(document.activeElement)) popupPin.focus();
        popupPin = null;
      });
      document.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape" && view === "map" && mapEl.querySelector(".leaflet-popup")) map.closePopup();
      });
    }
    markerLayer.clearLayers();

    const hasPos = (s) => typeof s.lat === "number" && typeof s.lon === "number";
    // One marker per venue; its popup lists the venue's shows. Venues at (almost) the same spot – the
    // rooms of one house, like the Reitschule in Bern – share one pin, otherwise the lower pin could
    // never be tapped.
    const venues = new Map();
    for (const s of visible.filter(hasPos)) {
      const key = `${s.venue}|${s.city}`;
      if (!venues.has(key)) venues.set(key, { s, items: [] });
      venues.get(key).items.push(s);
    }
    const places = [];
    for (const v of venues.values()) {
      const near = places.find((p) => distanceKm(p.s, v.s) < 0.12);
      if (near) near.venues.push(v);
      else places.push({ s: v.s, venues: [v] });
    }
    const points = [];
    const swiss = [];
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
    const showList = (items) =>
      `<ul class="popup-shows">${items
        .map(
          (x) =>
            `<li><a href="#${x._short}" data-id="${escape(x.id)}" title="Zur Show in der Liste springen"><time>${shortDate(x._day)}</time> ${escape(x.title)}</a></li>`,
        )
        .join("")}</ul>`;
    for (const { s, venues: vs } of places) {
      const items = vs.flatMap((v) => v.items);
      const names = vs.map((v) => v.s.venue).join(", ");
      const title = `${names}, ${s.city}: ${items.length === 1 ? "1 Show" : `${items.length} Shows`} anzeigen`;
      const marker = L.marker([s.lat, s.lon], {
        icon: pinIcon(pinKind(items), items.length),
        riseOnHover: true,
        zIndexOffset: items.length * 10, // the busier pin on top where pins still overlap
        title,
      })
        .bindPopup(
          vs.length === 1
            ? `<strong>${escape(s.venue)}</strong> · ${escape(s.city)}${showList(items)}`
            : `<strong>${escape(s.city)}</strong>` +
                vs
                  .map(
                    (v) =>
                      `<p class="popup-venue"><strong>${escape(v.s.venue)}</strong></p>${showList(v.items)}`,
                  )
                  .join(""),
          // Leaflet's default popup (300 px + margins + ×) is wider than the map on a phone; the top-left
          // padding keeps a tall popup clear of the zoom control.
          {
            maxWidth: Math.min(320, mapEl.clientWidth - 70),
            autoPanPaddingTopLeft: [60, 24],
            autoPanPaddingBottomRight: [24, 24],
          },
        )
        .addTo(markerLayer);
      // Leaflet names a pin by its text (the count badge): give it the venue instead. The element exists
      // once the marker is on the map, which happens after fitBounds() below (the map has no view yet).
      marker.on("add", () => marker.getElement().setAttribute("aria-label", title));
      points.push([s.lat, s.lon]);
      if (CANTONS[s.canton]) swiss.push([s.lat, s.lon]);
    }
    if (here) {
      L.marker([here.lat, here.lon], { icon: youIcon, zIndexOffset: 1000, title: "Dein Standort" })
        .bindPopup("Du bist hier")
        .addTo(markerLayer);
      points.push([here.lat, here.lon]);
    }
    map.invalidateSize();
    // The frame fits Switzerland (plus the own position); the few venues just across the border are
    // still on the map, but they do not zoom the whole country out to Strasbourg and Munich.
    const frame = swiss.length ? swiss.concat(here ? [[here.lat, here.lon]] : []) : points;
    if (frame.length) map.fitBounds(frame, { padding: [40, 40], maxZoom: 12 });
    else map.setView([46.8, 8.2], 7);

    const rest = visible.filter((s) => !hasPos(s));
    mapRest.innerHTML =
      `<p class="map-legend"><span class="legend-item"><span class="pin-mini"></span>Club mit Shows (Zahl = Anzahl Shows)</span> ` +
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
    callout().show({
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
  let quietScrollUntil = 0; // a scroll the page made itself (deep link, view switch) is not the visitor's
  window.addEventListener(
    "scroll",
    () => {
      if (nudged || window.scrollY < 600 || !shows.length || Date.now() < quietScrollUntil) return;
      nudged = true;
      setTimeout(() => showSubscribe(false), 1500); // callout.js holds it while the page is busy
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
  const viewsTop = () => views.getBoundingClientRect().top + window.scrollY - filters.offsetHeight - 8;
  function renderAndKeepInView() {
    nudgeQuietUntil = Date.now() + 3000; // mid-task: no sticker over the result
    filterTouched = true;
    render();
    filterTouched = false;
    // No result: the «Nichts gefunden» box takes the list's place and must come into view the same
    // way – otherwise a search typed while scrolled leaves the visitor staring at the footer.
    const target = views.hidden ? status : views;
    if (views.hidden && !status.textContent.trim()) return;
    const top = () => target.getBoundingClientRect().top + window.scrollY - filters.offsetHeight - 8;
    if (window.scrollY > top()) {
      quietScrollUntil = Date.now() + 1000;
      window.scrollTo({ top: top() });
      // The bar grows by a row once it sticks: check the target again a moment later.
      setTimeout(() => {
        if (window.scrollY > top()) window.scrollTo({ top: top() });
      }, 80);
    }
  }
  // Scroll down (never up) until the views start right under the bar. The bar grows by a row once
  // it sticks, so the target is checked again a moment later.
  function scrollViewsUnderBar() {
    if (views.hidden || window.scrollY >= viewsTop()) return;
    quietScrollUntil = Date.now() + 1500;
    window.scrollTo({ top: viewsTop() });
    setTimeout(() => {
      if (Math.abs(window.scrollY - viewsTop()) > 2) window.scrollTo({ top: viewsTop() });
    }, 80);
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
  armCallout();
  init();
})();
