(() => {
  const DATA_URL = "data/shows.json";
  const VENUES_URL = "data/venues.web.json"; // venues.json trimmed to city/lat/lon/url (format_data.py)
  const GENRES_URL = "data/genres.json";
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
  // The Wo panel groups the canton chips like the spec's <optgroup>s (§3.2); bilingual Freiburg and
  // Wallis count as Romandie, Bern as Deutschschweiz.
  const REGIONS = [
    [
      "Deutschschweiz",
      [
        "AG",
        "AI",
        "AR",
        "BE",
        "BL",
        "BS",
        "GL",
        "GR",
        "LU",
        "NW",
        "OW",
        "SG",
        "SH",
        "SO",
        "SZ",
        "TG",
        "UR",
        "ZG",
        "ZH",
      ],
    ],
    ["Romandie", ["FR", "GE", "JU", "NE", "VD", "VS"]],
    ["Ticino", ["TI"]],
    ["Grenznah", ["D", "F", "I", "A", "FL"]],
  ];
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
  // Hash parts come from a URL someone typed or pasted: never let a bad escape throw.
  const decodeHashPart = (t) => {
    try {
      return decodeURIComponent(t);
    } catch {
      return t;
    }
  };
  // One parser for every hash the page writes or accepts (§7 S6): #<short hash or id> (a show),
  // #m=<list> / #mine=<list> (a shared list, S5) and #view=calendar|map (the segmented control). Parts may
  // be combined with "&" in any order, e.g. #view=map&m=…; what is absent is "". revealFromHash(),
  // showShared() and the view bootstrap all consume this and nothing else reads location.hash.
  function parseHash(hash = location.hash) {
    const out = { id: "", mine: "", view: "" };
    for (const part of hash.replace(/^#/, "").split("&")) {
      if (/^(mine|m)=/.test(part)) out.mine = part.replace(/^(mine|m)=/, "");
      else if (part.startsWith("view=")) {
        const v = part.slice(5);
        if (VIEWS.includes(v)) out.view = v;
      } else if (part && !part.includes("=") && !out.id) out.id = decodeHashPart(part); // q=… is a filter
    }
    return out;
  }
  // Write a hash without a navigation (empty = none); path and query stay as they are.
  const setHash = (h) =>
    history.replaceState(history.state, "", `${location.pathname}${location.search}${h ? `#${h}` : ""}`);
  let view = "list";
  {
    // #view= in the link wins over the view this browser remembers.
    const stored = store.get(store.KEYS.VIEW, "list");
    if (VIEWS.includes(stored)) view = stored;
    view = parseHash().view || view;
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
  let revealUntil = 0; // a deep-linked row may be scrolled to again while the rows above still shift
  // "loading" | "ready" | "error": while loading or after an error a filter tap must not replace the
  // skeleton or the error message with a false «Noch nichts im Kalender».
  let loadState = "loading";
  const SKELETON = status.innerHTML; // the skeleton day groups (index.html), shown again on a retry
  const resultsText = el("results-text");
  const resultsLive = el("results-live"); // screen readers: the count after every filter change
  let showPast = false;
  let pastCount = 0;
  const cantons = new Set(); // selected canton / region codes (empty = all)
  let radiusKm = 0; // 0 = no distance filter; only applies once the position is known
  const search = el("q");
  const genreBar = el("genres"); // genre chips
  const formatBar = el("formats"); // format chips (Festival) – a group of its own, not a genre (§3.3)
  const chipRow = el("chips"); // the scrolling chip row (frozen height, arrows, drag)
  let activeGenre = "";
  let activeFormat = ""; // "" or "festival"
  const FORMAT_LABEL = { festival: "Festival" };
  const isFestival = (s) => Boolean(s._end);

  const monthFmt = new Intl.DateTimeFormat("de-CH", {
    month: "long",
    year: "numeric",
  });
  const monthNameFmt = new Intl.DateTimeFormat("de-CH", { month: "long" });
  const dowFmt = new Intl.DateTimeFormat("de-CH", { weekday: "short" });
  const fullDayFmt = new Intl.DateTimeFormat("de-CH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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
  // Past and running (festival-spec.md §4): a range entry is past only after its last day, and «läuft»
  // while today lies inside [date, end_date]. Computed at load and again when the tab comes back.
  function setTimeFlags(s, today) {
    s._past = (s._end || s._day) < today;
    s._now = Boolean(s._end) && s._day <= today && today <= s._end;
  }

  // --- Time dimension (design/ui-revamp.md §7 S3) ---
  // The coming weekend is Fri–Sun of this week until Sunday is over (on a Saturday it is the current one).
  // Only its DOWs go red, and the «Wochenende» rule is drawn once before its first day in the list.
  function weekendRange(today) {
    const dow = today.getDay(); // 0 = Sunday
    const fri = dow === 0 ? addDays(today, -2) : addDays(today, 5 - dow);
    return [fri, addDays(fri, 2)];
  }
  // HEUTE / MORGEN pills only while the data is fresher than 48 h: stale data must not claim a day.
  let dataUpdated = 0;
  const isFresh = () => dataUpdated > 0 && Date.now() - dataUpdated < 48 * 3600 * 1000;

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
  const ICONS = {
    rss: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.2 15.6a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zM4 9.5a10.5 10.5 0 0 1 10.5 10.5h-3A7.5 7.5 0 0 0 4 12.5v-3zM4 3.5A16.5 16.5 0 0 1 20.5 20h-3A13.5 13.5 0 0 0 4 6.5v-3z"/></svg>',
    event:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14V3zM5 5h6v2H5v12h12v-6h2v8H3V5h2z"/></svg>',
    ticket:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7zm2 0v2.2A4 4 0 0 1 5 14.8V17h14v-2.2a4 4 0 0 1 0-5.6V7H5zm5 2h2v6h-2V9zm4 0h2v6h-2V9z"/></svg>',
    // Google Calendar: the same frame as the .ics calendar, but with its «31» – a glyph that reads as
    // Google's calendar next to the plain one (the old «E» looked like a second .ics on a phone).
    gcal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zM6 8v12h12V8H6z"/><text x="12" y="17.6" text-anchor="middle" font-family="system-ui, sans-serif" font-size="8.5" font-weight="800" fill="currentColor">31</text></svg>',
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zm-1 8v10h12V10H6zm2 2h3v3H8v-3z"/></svg>',
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.2 14.8l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 0 1 12 4zm-3 4.5c-.2 0-.5 0-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.2 5 4.4 2.5 1 3 .8 3.5.7.5 0 1.7-.7 2-1.4.2-.7.2-1.2.1-1.4l-.5-.3-1.8-.9c-.3-.1-.5-.1-.6.1l-.9 1.1c-.2.2-.3.2-.6.1a6.5 6.5 0 0 1-3.3-2.9c-.2-.4.3-.4.8-1.4.1-.2 0-.4 0-.5l-.9-2c-.2-.5-.4-.4-.6-.4H9z"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10.6 13.4a1 1 0 0 1 0 1.4 4 4 0 0 1-5.7-5.7l3-3a4 4 0 0 1 5.6 0 1 1 0 1 1-1.4 1.4 2 2 0 0 0-2.8 0l-3 3a2 2 0 0 0 2.9 2.9 1 1 0 0 1 1.4 0zm2.8-2.8a1 1 0 0 1 0-1.4 4 4 0 0 1 5.7 5.7l-3 3a4 4 0 0 1-5.6 0 1 1 0 1 1 1.4-1.4 2 2 0 0 0 2.8 0l3-3a2 2 0 0 0-2.9-2.9 1 1 0 0 1-1.4 0z"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.2 6.8.8-5 4.7 1.3 6.8L12 17.6 6 21l1.3-6.8-5-4.7 6.8-.8z"/></svg>',
    share:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 7.5 6.5l1.4 1.4L11 5.8V15h2V5.8l2.1 2.1 1.4-1.4zM5 10h4v2H7v9h10v-9h-2v-2h4v13H5z"/></svg>',
    train:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2c-4 0-8 .5-8 4v9.5A3.5 3.5 0 0 0 7.5 19L6 20.5V21h2l2-2h4l2 2h2v-.5L16.5 19a3.5 3.5 0 0 0 3.5-3.5V6c0-3.5-4-4-8-4zm-5.5 4c.2-1 2.6-2 5.5-2s5.3 1 5.5 2H6.5zM6 8h12v4H6V8zm1.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>',
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
  // A nudge (install, subscribe) waits while the visitor is busy with a panel, the map, a filter they
  // just touched, or has just landed on a shared show. callout.js is the last script on the page, and
  // the agenda can be in before it has run (a cached or fixture response beats a busy server): the
  // blocker is handed over once both are there, whichever comes last.
  const nudgeBlocked = () =>
    Boolean(openPanel) || view === "map" || Date.now() < nudgeQuietUntil || !undoToast.hidden;
  function armCallout() {
    if (callout()) callout().setBlocker(nudgeBlocked);
    else if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", armCallout, { once: true });
  }

  // «Fr 16.7.2026» for a show, «Fr 16.7. – So 18.7.2027» for a festival (same as lib.dateText).
  const dmy = (d) => `${d.getDate()}.${d.getMonth() + 1}.`;
  const dateText = (s) =>
    s._end
      ? `${dowFmt.format(s._day).replace(".", "")} ${dmy(s._day)} – ${dowFmt.format(s._end).replace(".", "")} ${dmy(s._end)}${s._end.getFullYear()}`
      : `${dowFmt.format(s._day).replace(".", "")} ${dmy(s._day)}${s._day.getFullYear()}`;
  // Festival line-up as text lines (same as lib.lineupLines): one per day, then «Tag offen: …».
  function lineupLines(s) {
    const days = s.days && typeof s.days === "object" ? s.days : {};
    const keys = Object.keys(days).sort();
    if (!s.acts.length && !keys.length) return [];
    if (!keys.length) return [s.acts.join(", ")];
    const placed = new Set();
    const out = [];
    for (const key of keys) {
      const list = (days[key] || []).map(String);
      const d = parseDay(key);
      out.push(`${dowFmt.format(d).replace(".", "")} ${dmy(d)}: ${list.join(", ")}`);
      for (const a of list) placed.add(venueKey(a));
    }
    const rest = s.acts.filter((a) => !placed.has(venueKey(a)));
    if (rest.length) out.push(`Tag offen: ${rest.join(", ")}`);
    return out;
  }
  const shareText = (s) =>
    s._end
      ? `${s.title} – ${dateText(s)} · ${s.venue}, ${s.city}` +
        `${s.acts.length ? `\nmit ${s.acts.slice(0, 4).join(", ")}${s.acts.length > 4 ? ` +${s.acts.length - 4}` : ""}` : ""}\n${showUrl(s)}`
      : `${s.title} – ${dateText(s)}${s.time ? ` ${s.time}` : ""} · ${s.venue}, ${s.city}\n${showUrl(s)}`;
  // The day after a calendar day as YYYYMMDD (exclusive DTEND of an all-day event).
  const nextDayStamp = (d) =>
    localStamp(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)).slice(0, 8);
  const calDescription = (s) =>
    [...(s._end ? lineupLines(s) : []), safeUrl(s.url) || "", showUrl(s)].filter(Boolean).join("\n");

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
    if (s._end) {
      // A festival is one all-day event over the whole range; its door time is not a start time.
      when = `DTSTART;VALUE=DATE:${s.date.replace(/-/g, "")}\r\nDTEND;VALUE=DATE:${nextDayStamp(s._end)}`;
    } else if (s.time) {
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
      `DESCRIPTION:${esc(calDescription(s))}`,
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
    if (s._end) {
      dates = `${s.date.replace(/-/g, "")}/${nextDayStamp(s._end)}`;
    } else if (s.time) {
      const [start, end] = showSpan(s);
      dates = `${localStamp(start)}/${localStamp(end)}`;
    } else {
      dates = `${s.date.replace(/-/g, "")}/${nextDayStamp(s._day)}`;
    }
    const p = new URLSearchParams({
      action: "TEMPLATE",
      text: s.title,
      dates,
      ctz: "Europe/Zurich",
      location: `${s.venue}, ${s.city}`,
      details: calDescription(s),
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
    // Sun over mountains in the brand line weight (logo 06 «Alpen & Sonne», design/logos.html), for the
    // «nothing for this selection» state.
    empty:
      '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="42" cy="21" r="8"/><path d="M42 5v4M42 33v4M26 21h4M54 21h4M30.7 9.7l2.8 2.8M50.5 29.5l2.8 2.8M53.3 9.7l-2.8 2.8M30.7 32.3l2.8-2.8"/><path d="M4 56 22 28l10 16 8-10 20 22"/><path d="M19.5 32l2.5-2.5 2.5 2.5M37.5 37l2.5-2.5 2.5 2.5"/><path d="M4 56h56"/></svg>',
  };
  // Region name for pills and headlines: «Bern», «Deutschland» (no «(grenznah)» – the row says that).
  const shortRegion = (c) => (ABROAD[c] ? ABROAD[c].replace(/ \(grenznah\)$/, "") : regionName(c));

  // Line-up block (lineupHtml, LINEUP_PREVIEW / LINEUP_FROM): ported to src/components/festival/Lineup.svelte
  // and src/lib/festival.js (M5).
  // Every filter except the date range (the histogram in the "Wann" panel uses exactly these). `o` replaces
  // single filters for what-if counts (countWith): { q, cantons, radius, genre }.
  // o: overrides for the facet counts ({q, cantons, radius, genre, format, months, range}); anything that is
  // not an object (Array.prototype.filter passes the index) means "the current filters".
  const opt = (o) => (o && typeof o === "object" ? o : {});
  function matchesFilters(s, o) {
    o = opt(o);
    const q = fold("q" in o ? o.q : search.value.trim());
    const cs = "cantons" in o ? o.cantons : cantons;
    const radius = "radius" in o ? o.radius : radiusKm;
    const genre = "genre" in o ? o.genre : activeGenre;
    const format = "format" in o ? o.format : activeFormat;
    if (shared && !shared[s.id]) return false;
    if (mineOnly && !marks[s.id]) return false;
    if (cs.size && !cs.has(s.canton)) return false;
    if (radius && here && typeof s.lat === "number" && distanceKm(here, s) > radius) return false;
    if (genre && !s.genres.includes(genre)) return false;
    if (format && !s.genres.includes(format)) return false;
    return !q || matchesSearch(s, q);
  }
  const isVisible = (s, o) =>
    listMode() ? inList(s) : (!s._past || showPast) && inRange(s, opt(o)) && matchesFilters(s, opt(o));

  // Focus (§5): what had the focus inside a region that render() rebuilds is found again by its place –
  // the row's data-id (or the calendar day) plus its own tag, classes and data attributes (data-act,
  // data-state, data-canton, data-view, data-remove …). Gone for good → #results (tabindex=-1), so a
  // keyboard user never lands on <body> after a filter.
  const focusRegions = () => [views, status, resultsEl];
  function focusPath(a) {
    const part = (n, withClasses) => {
      let s = n.tagName.toLowerCase();
      if (withClasses) for (const c of n.classList) if (c !== "fb-on") s += `.${CSS.escape(c)}`;
      for (const { name, value } of n.attributes)
        if (name.startsWith("data-")) s += `[${name}="${CSS.escape(value)}"]`;
      return s;
    };
    const scope = a.closest("[data-id], [data-day]");
    return (scope && scope !== a ? `${part(scope, false)} ` : "") + part(a, true);
  }
  function render() {
    const prev = document.activeElement;
    const path =
      prev && prev !== document.body && focusRegions().some((r) => r.contains(prev)) ? focusPath(prev) : "";
    renderInner();
    if (!path || prev.isConnected) return;
    const next = focusRegions()
      .map((r) => r.querySelector(path))
      .find(Boolean);
    (next || resultsEl).focus({ preventScroll: true });
  }

  function renderInner() {
    if (loadState !== "ready") return; // data not in yet (or an error): the skeleton / message stays
    const q = search.value.trim().toLowerCase();
    const visible = shows.filter((s) => isVisible(s));

    const filtered = Boolean(
      cantons.size ||
        activeGenre ||
        activeFormat ||
        q ||
        mineOnly ||
        shared ||
        rangeActive() ||
        (here && radiusKm),
    );
    renderPills();
    updateCounts();
    el("share-filters").hidden = !filtered || listMode();
    updateMine();
    updateWhen();
    renderedStamp = renderStamp();
    lastVisible = visible;
    if (!visible.length) syncFilterHash();
    const v = listMode() ? "list" : view; // the list mode always shows the list; the stored view returns on close
    // «↑ n vergangene Shows anzeigen»: the last row under the list (§3.10). n counts only what the current
    // filters would bring back, so «Heute» never offers past shows it cannot show. The list mode shows its
    // past shows anyway, and the other views keep the switch in the Wann panel.
    const past = listMode() ? 0 : shows.filter((s) => s._past && inRange(s) && matchesFilters(s)).length;
    listFoot.hidden = !past || v !== "list"; // also under the empty state: the match may lie in the past
    pastFoot.innerHTML = showPast
      ? `<span class="arrow" aria-hidden="true">↓</span> Vergangene ausblenden`
      : `<span class="arrow" aria-hidden="true">↑</span> ${past} vergangene ${past === 1 ? "Show" : "Shows"} anzeigen`;
    if (!visible.length) {
      list.innerHTML = "";
      calendarEl.innerHTML = "";
      mapRest.innerHTML = "";
      views.hidden = true;
      resultsText.textContent = "";
      el("results-count").textContent = "";
      resultsLive.textContent = ""; // #status (role=status) announces the empty state itself
      if (listMode()) {
        status.innerHTML = `<p class="state-icon">${STATE_ICONS.search}</p><p class="big">Diese Liste ist leer</p><p>Keine der Shows ist mehr in der Agenda.</p><button type="button" class="primary" id="reset" title="Zurück zur Agenda">Zurück zur Agenda</button>`;
        return;
      }
      if (!shows.some((s) => !s._past)) {
        status.innerHTML = `<p class="state-icon">${STATE_ICONS.calendar}</p><p class="big">Noch nichts im Kalender</p><p>Sobald der Scraper etwas findet, steht es hier.</p>`;
        return;
      }
      // Empty state (§3.8): names the cause («Kein Dub im Tessin»), offers to remove each filter with what
      // that yields – the removal with the most shows first – and, with a quick pick, points to the next show.
      const quick = quickActive();
      const next = quick && shows.find((x) => !x._past && matchesFilters(x));
      const dims = activeDims().sort((a, b) => b.count - a.count); // the richest removal first
      const fixes = dims
        .map(
          (d) =>
            `<button type="button" class="chip fix${d.count ? "" : " none"}" data-remove="${d.kind}"${d.value ? ` data-value="${escape(d.value)}"` : ""} title="Filter «${escape(d.label)}» entfernen">${escape(d.label)} entfernen <b>→ ${nShows(d.count)}</b></button>`,
        )
        .join("");
      const hint = next
        ? `<p>Nächste Show: <a href="#${next._short}" title="Zur Show in der Liste springen"><strong>${escape(next.title)}</strong></a>, ${escape(dayShort(next))} in ${escape(next.city)}</p>`
        : "";
      status.innerHTML =
        `<p class="state-icon">${STATE_ICONS.empty}</p><p class="big">${escape(emptyHeadline(quick))}</p>` +
        `<p>Für diese Auswahl gibt es gerade nichts.</p>${hint}` +
        (fixes ? `<div class="fixes">${fixes}</div>` : "") +
        (dims.length >= 2
          ? `<button type="button" class="linkish reset" id="reset" title="Alle Filter zurücksetzen">Alles zurücksetzen</button>`
          : "");
      return;
    }
    status.innerHTML = "";
    views.hidden = false;
    syncFilterHash();
    const span = monthSpan(visible);
    const rangeNote = rangeActive() ? ` · ${rangeLabel()}` : "";
    // Festivals are counted apart from the concerts: «12 Shows · 1 Festival · Juli 2027».
    const nFest = visible.filter(isFestival).length;
    const nConc = visible.length - nFest;
    const festNote = nFest ? `${nConc ? " · " : ""}${nFest} ${nFest === 1 ? "Festival" : "Festivals"}` : "";
    const concerts = nConc ? `${nConc} ${nConc === 1 ? "Show" : "Shows"}` : "";
    resultsText.textContent = shared
      ? `Geteilte Liste · ${visible.length} ${visible.length === 1 ? "Show" : "Shows"} · ${span}${rangeNote}`
      : `${concerts}${festNote}${filtered ? " für diese Auswahl" : ""} · ${span}${rangeNote}`;
    resultsLive.textContent = resultsText.textContent;
    // The count where the list begins (the full line with the span is in the footer bar).
    el("results-count").textContent = `${visible.length} ${visible.length === 1 ? "Show" : "Shows"}`;

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

    // Month groups, keyed sortably; a festival sits in its start month and leaves a ghost row («↳ … läuft
    // noch bis So 1. Aug.») at the top of every later month it touches – creating that month if needed.
    const groups = new Map();
    const group = (d) => {
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
      if (!groups.has(key)) groups.set(key, { first: monthStart(d), items: [], ghosts: [] });
      return groups.get(key);
    };
    for (const s of visible) group(s._day).items.push(s);
    for (const s of visible.filter(isFestival)) {
      for (
        let m = monthStart(addDays(monthStart(s._day), 32));
        m <= s._end;
        m = addDays(m, 32), m = monthStart(m)
      )
        group(m).ghosts.push(s);
    }

    // The «Wochenende» rule is drawn once, before the first day of the coming weekend – not while a Heute /
    // Morgen / Wochenende quick pick already says which days these are.
    const [wkStart, wkEnd] = weekendRange(todayStart());
    let ruleDue = !["today", "tomorrow", "weekend"].includes(quickActive());
    list.innerHTML = [...groups]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, { first, items, ghosts }]) => {
        const weekendRule = ruleDue && items.some((s) => s._day >= wkStart && s._day <= wkEnd);
        if (weekendRule) ruleDue = false;
        const ghostRows = ghosts
          .map(
            (s) =>
              `<p class="ghost"><a href="#${s._short}" title="Zum Festival in der Liste springen"><span class="arrow" aria-hidden="true">↳</span> ${escape(s.title)} läuft noch bis ${escape(endLabel(s))}</a></p>`,
          )
          .join("");
        return `
        <section style="--rows: ${items.length}">
          <h2 class="month">${escape(monthNameFmt.format(first))} <span class="year">${first.getFullYear()}</span></h2>
          <div class="shows">${ghostRows}${renderDays(items, { weekendRule })}</div>
        </section>`;
      })
      .join("");
    // Motion (§4): the first ten rows enter one --stagger apart (CSS: .enter + --i); the distances in every
    // row fade in with the same rhythm.
    list.querySelectorAll(".show").forEach((row, i) => {
      row.style.setProperty("--i", String(Math.min(i, 9)));
      if (i < 10) row.classList.add("enter");
    });
  }
  // «So 1. Aug.» – the last day of a festival for the ghost row (non-breaking, so it never wraps to «Aug.»).
  const endLabel = (s) =>
    `${dowFmt.format(s._end).replace(".", "")} ${s._end.getDate()}. ${shortMonthFmt.format(s._end)}`;

  // "Oktober 2026" or "Oktober 2026 – Dezember 2026": the months a (sorted) list of shows spans.
  function monthSpan(visible) {
    const first = visible[0]._day;
    const last = visible.reduce(
      (m, s) => (s._end && s._end > m ? s._end : m),
      visible[visible.length - 1]._day,
    );
    return first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()
      ? monthFmt.format(first)
      : `${monthFmt.format(first)} – ${monthFmt.format(last)}`;
  }

  // HEUTE / MORGEN, the coming weekend and «vorbei» depend on the clock: when the tab comes back on
  // another day (or the data has gone stale meanwhile), the list is rendered again.
  let renderedStamp = "";
  const renderStamp = () => `${todayStart().getTime()}:${isFresh() ? "fresh" : "stale"}`;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !shows.length) return;
    if (renderStamp() === renderedStamp) return;
    const today = todayStart();
    for (const s of shows) setTimeFlags(s, today);
    pastCount = shows.filter((s) => s._past).length;
    render();
  });

  // Tagline: the inline script in index.html picked one of the slogans before the first paint (a fetch
  // used to replace the default line ~2 s after it was painted on slow 4G); the sticky bar mirrors it.
  {
    const mini = el("mini-tag");
    const tag = el("tagline");
    if (mini && tag) mini.textContent = tag.textContent;
  }

  // The venue database is not needed for the first paint – the venue names become links and the SBB
  // start town is known a moment later. render() is idempotent, so a second pass is cheap. The page
  // reads the derived venues.web.json (the fields used here, ~6 KB gzipped); data/venues.json itself is
  // 100 KB, 60 % of it the scraper's notes, and used to be fetched on every visit.
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
          // A range entry (festival-spec.md): end_date after date, else it is a normal show.
          _end:
            /^\d{4}-\d{2}-\d{2}$/.test(s.end_date || "") && s.end_date > s.date ? parseDay(s.end_date) : null,
          genres: Array.isArray(s.genres) ? s.genres.map((g) => String(g).toLowerCase()) : [],
          acts: Array.isArray(s.acts) ? s.acts.map(String).filter(Boolean) : [],
        }))
        .map((s) => ({ ...s, _short: shortId(s.id), _hay: searchText(s) }))
        .sort((a, b) => a._day - b._day || (a.time || "99:99").localeCompare(b.time || "99:99")); // unknown time last
      for (const s of shows) setTimeFlags(s, today);

      pastCount = shows.filter((s) => s._past).length;
      dataUpdated = data.updated ? Date.parse(data.updated) || 0 : 0;
      loadState = "ready";
      setupWhen();
      // Canton chips (multi-select, with counts) inside the Wo panel, grouped like the spec's <optgroup>s:
      // Deutschschweiz · Romandie · Ticino · Grenznah, A–Z inside a group; cantons without an upcoming
      // show are not listed. The counts are filled by updateCounts() on every render.
      const upcoming = new Set(shows.filter((s) => !s._past).map((s) => s.canton));
      const groups = REGIONS.map(([name, codes]) => [
        name,
        codes
          .filter((c) => upcoming.has(c))
          .sort((a, b) => shortRegion(a).localeCompare(shortRegion(b), "de")),
      ]).filter(([, codes]) => codes.length);
      cantonChips.innerHTML =
        `<button type="button" class="chip" data-canton="" aria-pressed="true" title="Alle Kantone anzeigen">Alle</button>` +
        groups
          .map(
            ([name, codes]) =>
              `<div class="canton-group" role="group" aria-label="${escape(name)}"><span class="group-label">${escape(name)}</span>` +
              codes
                .map(
                  (c) =>
                    `<button type="button" class="chip${ABROAD[c] ? " abroad" : ""}" data-canton="${escape(c)}" aria-pressed="false"><img src="img/cantons/${escape(c)}.svg" alt="" width="14" height="16">${escape(shortRegion(c))}<small></small></button>`,
                )
                .join("") +
              `</div>`,
          )
          .join("");
      updateWhere();

      // Genre chips: one toggle per genre that occurs at least once, in the order of data/genres.json
      // (unknown slugs go last, alphabetically). Counts come from updateCounts().
      // «Festival» is a format, not a genre (§3.3): its own chip group after the genres.
      const genres = new Set(shows.flatMap((s) => s.genres));
      const rank = (g) => (genreOrder.includes(g) ? genreOrder.indexOf(g) : genreOrder.length);
      genreBar.innerHTML =
        `<button type="button" class="chip" data-genre="" aria-pressed="true" title="Alle Genres anzeigen">Alle</button>` +
        [...genres]
          .filter((g) => !FORMAT_LABEL[g])
          .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
          .map(
            (g) =>
              `<button type="button" class="chip" data-genre="${escape(g)}" aria-pressed="false">${escape(genreLabel[g] || g)}<small></small></button>`,
          )
          .join("");
      formatBar.innerHTML = Object.keys(FORMAT_LABEL)
        .filter((f) => genres.has(f))
        .map(
          (f) =>
            `<button type="button" class="chip" data-format="${f}" aria-pressed="false">${FORMAT_LABEL[f]}<small></small></button>`,
        )
        .join("");
      chipRow.scrollLeft = 0; // the row starts at «Alle», whatever snapped before the chips existed
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
      status.classList.remove("loading"); // the skeleton rows make way for the list
      render();
      if (savedScrollY && !parseHash().id && !parseHash().mine) {
        quietScrollUntil = Date.now() + 1500;
        window.scrollTo(0, savedScrollY); // back to the rows the visitor was looking at (history, above)
      }
      savedScrollY = 0;
      revealFromHash();
      loadVenues();
      autoLocate();
    } catch (err) {
      console.error(err);
      status.classList.remove("loading");
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
        `<p>${offline ? "Ohne Verbindung gibt es keine Agenda – sobald du wieder Netz hast, klappt es." : "Die Shows konnten nicht geladen werden. Bitte später nochmals versuchen."}</p>` +
        `<button type="button" class="primary" id="retry" title="Shows nochmals laden">Nochmals versuchen</button>`;
      // The only recovery must be on screen: on a 320 px phone and in landscape the card (header + bar +
      // results row above it) ends below the fold – the page scrolls just far enough to show the button.
      const revealRetry = () => {
        const btn = el("retry");
        if (!btn) return;
        const below = btn.getBoundingClientRect().bottom + 16 - innerHeight;
        if (below <= 0) return;
        quietScrollUntil = Date.now() + 1500;
        window.scrollTo({ top: Math.min(underBar(status), window.scrollY + below) });
      };
      revealRetry();
      // The display face may still be loading: once it is in, the heading is a few px taller.
      document.fonts.ready.then(revealRetry);
      setTimeout(revealRetry, 300);
    }
  }
  function retry() {
    loadState = "loading";
    status.innerHTML = SKELETON; // the skeleton rows again, until the data is in
    status.classList.add("loading");
    views.hidden = false;
    list.hidden = false;
    init();
  }
  // Feedback word (§3.6): a 1.2 s inline word next to the icon («Kopiert», «Gespeichert», «Ich gehe»),
  // mirrored into the page-level live region so screen readers hear it as well.
  const feedback = el("feedback");
  function flashWord(btn, word) {
    if (!btn || !word) return;
    feedback.textContent = "";
    setTimeout(() => (feedback.textContent = word), 30); // cleared first, so the same word is announced again
    let fb = btn.querySelector(".fb");
    if (!fb) {
      fb = document.createElement("span");
      fb.className = "fb";
      fb.setAttribute("aria-hidden", "true");
      btn.appendChild(fb);
    }
    fb.textContent = word;
    btn.classList.add("fb-on");
    clearTimeout(btn._fb);
    btn._fb = setTimeout(() => {
      btn.classList.remove("fb-on");
      fb.remove();
    }, 1200);
  }
  const STATE_WORD = { interested: "Interessiert", going: "Ich gehe" };

  // Per-show button actions (mark / state / calendar / share / copy link); the other actions are plain links.
  async function runAction(btn, s, row) {
    const act = btn.dataset.act;
    if (act === "mark") {
      // The click that ends a long press: «Ich gehe» is already set. A touch screen may not send that click
      // at all, so the flag is a timestamp that expires by itself instead of swallowing the next tap or Enter.
      if (btn._longAt && Date.now() - btn._longAt < 1000) {
        btn._longAt = 0;
        return;
      }
      if (marks[s.id]) unmark(s, row);
      else {
        setMark(s, "interested", row);
        flashWord(btn, "Gemerkt");
      }
    }
    if (act === "state") {
      // A pressed segment stays pressed: the toggle never un-marks (that is the star's job).
      const next = btn.dataset.state;
      if (marks[s.id] !== next) {
        setMark(s, next, row);
        if (next === "interested") flashWord(row.querySelector(".star"), STATE_WORD[next]);
      }
    }
    if (act === "cal") {
      downloadIcs(icsFor(s), `${s.id}.ics`);
      flashWord(btn, "Gespeichert");
    }
    if (act === "share") {
      try {
        await navigator.share({ title: s.title, text: shareText(s).split("\n")[0], url: showUrl(s) });
        flashWord(btn, "Geteilt");
      } catch (err) {
        // Cancelled: nothing to do. Not possible here: the WhatsApp link, like everywhere without share().
        if (!err || err.name !== "AbortError") window.open(waUrl(s), "_blank", "noopener");
      }
    }
    if (act === "link") {
      history.replaceState(history.state, "", `#${s._short}`);
      try {
        await navigator.clipboard.writeText(showUrl(s));
        flashWord(btn, "Kopiert");
      } catch {
        flashWord(btn, "Link in Adresszeile");
      }
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

  // A re-render in the seconds after a deep-link jump (venues.json arrived, the position came in) rebuilds
  // the rows: keepRevealed() puts the highlight back and, while the rows above may still be shifting,
  // scrolls to the row again – otherwise the row ends up under the sticky bar.
  function keepRevealed() {
    const target = findShow(parseHash().id);
    const row = target && document.getElementById(target.id);
    if (!row) return;
    row.classList.add("highlight");
    if (Date.now() < revealUntil) row.scrollIntoView({ block: "start" });
  }
  // «Diese Show ist nicht mehr in der Agenda …»: a line under the results row for a stale link.
  const linkNote = document.createElement("p");
  linkNote.className = "link-note";
  linkNote.setAttribute("role", "status");
  linkNote.hidden = true;
  resultsEl.closest(".results-row").after(linkNote);
  function noteLink(text) {
    linkNote.textContent = text;
    linkNote.hidden = !text;
  }

  // Direct links (one parser, §7 S6): #m=… opens a shared list, #view=… switches the view, #<short hash or
  // id> scrolls to the show and highlights it (clearing filters if needed).
  function revealFromHash() {
    const h = parseHash();
    if (h.mine) return showShared(h.mine);
    if (shared) {
      // The #m= link left the address bar (Back, or a new link): the friend's list goes with it.
      shared = null;
      sharedBy = "";
      sharedMissing = 0;
      render();
    }
    if (h.view && h.view !== view && !listMode()) setView(h.view);
    if (!h.id) return; // nothing, or the filter state
    const target = findShow(h.id);
    if (!target) {
      // An in-page anchor (the skip links, «Nach oben») is no show link.
      if (document.getElementById(h.id)) return;
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
    // A shared link lands on the open line-up.
    const lineup = row.querySelector("details.lineup");
    if (lineup && !lineup.open) {
      lineup.open = true;
      lineup.classList.add("is-open");
      openIds.add(id);
    }
    quietScrollUntil = Date.now() + 2000;
    revealUntil = Date.now() + 3000;
    nudgeQuietUntil = Date.now() + 8000; // a friend's link lands on the show, not on a sticker
    const motion = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    row.scrollIntoView({ block: "start", behavior: motion });
    row.tabIndex = -1;
    row.focus({ preventScroll: true }); // the next Tab starts at the show, screen readers announce it
  }
  window.addEventListener("hashchange", revealFromHash);

  // --- History: the Back button (or swipe) closes an open Wo/Wann panel and returns
  // from a view switch or a calendar/map → list jump, instead of leaving the site – the reflex on phones.
  // Overlays and view switches push one entry each; filters never do (they live in the hash, see
  // syncFilterHash, written with replaceState so a filter click does not flood the history).
  const histState = (extra) => ({ jah: 1, view, ...extra });
  // Reload, tab restore (iOS evicts tabs freely) and Back from log.html: left to the browser, the scroll
  // offset is restored into the skeleton page (clamped to its bottom, footer in view) and scroll anchoring
  // then keeps the footer in view while the list is inserted above it – the visitor lands in April. So the
  // offset travels in the history entry (written when the page goes away) and is restored after the
  // first render, before a show link (if any) takes over.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  let savedScrollY = history.state && history.state.jah ? Number(history.state.sy) || 0 : 0;
  history.replaceState(histState(), "");
  const rememberScroll = () => {
    if (!history.state || !history.state.jah || history.state.sy === Math.round(window.scrollY)) return;
    try {
      history.replaceState({ ...history.state, sy: Math.round(window.scrollY) }, "");
    } catch {
      /* Safari caps replaceState at 100 per 30 s – then the last written offset stands */
    }
  };
  // Written once the scrolling stops (a reload discards what pagehide writes) and when the tab goes away.
  let scrollMemo = 0;
  window.addEventListener(
    "scroll",
    () => {
      clearTimeout(scrollMemo);
      scrollMemo = setTimeout(rememberScroll, 400);
    },
    { passive: true },
  );
  window.addEventListener("pagehide", rememberScroll);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") rememberScroll();
  });
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
    const st = e.state && e.state.jah ? e.state : null;
    fromHistory = true;
    if (openPanel) {
      // Back behaves like Escape: the focus returns to the toggle, the next Tab continues from there.
      const btn = PANELS[openPanel][0];
      setPanel(null);
      el(btn).focus({ preventScroll: true });
    }
    // Meine Shows pushed an entry of its own (★): Back closes it – unless the entry landed on IS that one
    // (returning from a view switch made while the list was open).
    const onMine = Boolean(st && st.overlay === "mine" && mineOnly);
    overlayEntry = onMine;
    if (mineOnly && !onMine) {
      mineOnly = false;
      renderAndKeepInView();
      toggleMine.focus({ preventScroll: true });
    }
    fromHistory = false;
    if (st && st.view && st.view !== view && !listMode()) setView(st.view);
    // An entry without our state is a navigation the page did not make (a URL typed, a link tapped in
    // this tab): a state hash is applied here; a show or list link is left for revealFromHash (the
    // hashchange event follows) instead of being written over with the filters.
    if (!st) {
      applyStateHash();
      if (location.hash && !isStateHash(location.hash)) return;
    }
    syncFilterHash();
  });

  // --- Meine Shows (§7 S5): the star is Merken on / off, the state «Interessiert | Ich gehe» is a separate
  // two-segment toggle inside every marked row – nothing cycles, so a tap never un-marks by accident. A
  // long press on the star is the shortcut straight to «Ich gehe». Un-marking shows a 4 s toast with
  // Rückgängig. Marks live only in this browser (localStorage); without it they last for the page view.
  const MARK_LABEL = {
    "": "Merken",
    interested: "Gemerkt: Interessiert",
    going: "Gemerkt: Ich gehe",
  };
  // Tooltip of the star button: what a click does.
  const MARK_TITLE = {
    "": "Merken (lang drücken: Ich gehe)",
    interested: "Nicht mehr merken",
    going: "Nicht mehr merken",
  };
  let marks = {};
  // Only keep well-formed entries; anything else in storage is ignored.
  for (const [id, st] of Object.entries(store.get(store.KEYS.MARKS, {}) || {}))
    if (st === "interested" || st === "going") marks[id] = st;
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
    `<button type="button" class="act star" data-act="mark" aria-pressed="${Boolean(marks[s.id])}" title="${MARK_TITLE[marks[s.id] || ""]}">${ICONS.star}<span class="lbl">${MARK_LABEL[marks[s.id] || ""]}</span></button>`;
  // The state toggle of a marked row (§5: a role="group" of two aria-pressed buttons with visible words, so
  // the state is readable without colour). Empty while the show is not marked.
  const markSegHtml = (s) => {
    const st = marks[s.id];
    if (!st) return "";
    const seg = (state, word, title) =>
      `<button type="button" class="act" data-act="state" data-state="${state}" aria-pressed="${st === state}" title="${title}">${word}</button>`;
    return (
      `<div class="mark-seg" role="group" aria-label="Status der Markierung">` +
      seg("interested", "Interessiert", "Vielleicht – ich schaue es mir an") +
      seg("going", "Ich gehe", "Ich bin dabei") +
      `</div>`
    );
  };
  const dayShort = (s) =>
    `${dowFmt.format(s._day).replace(".", "")} ${s._day.getDate()}.${s._day.getMonth() + 1}.`;
  const mineUrl = () =>
    `${location.origin}${location.pathname}#m=` +
    markedShows()
      .map((s) => `${s._short}${marks[s.id][0]}`)
      .join(",");

  // Panel under the list head (§7 S5): the «nur in diesem Browser» line, then Kalender (.ics) · Teilen ·
  // Link. Teilen is navigator.share where it exists, the WhatsApp link everywhere else (so WhatsApp never
  // disappears); Link copies the #m= link.
  minePanel.innerHTML =
    `<span class="mine-note"></span>` +
    `<button type="button" class="act take" data-mine="take" title="Alle Shows dieser Liste in meine Shows übernehmen" hidden>${ICONS.star}<span class="lbl">Alle merken</span></button>` +
    `<button type="button" class="act" data-mine="ics" title="Diese Liste als .ics speichern (Apple, Outlook …)">${ICONS.cal}<span class="lbl">Kalender (.ics)</span></button>` +
    (navigator.share
      ? `<button type="button" class="act" data-mine="share" title="Liste teilen (WhatsApp, Mail, …)">${ICONS.share}<span class="lbl">Teilen</span></button>`
      : `<a class="act" id="mine-wa" href="#" target="_blank" rel="noopener" title="Liste per WhatsApp teilen">${ICONS.wa}<span class="lbl">Teilen</span></a>`) +
    `<button type="button" class="act" data-mine="link" title="Link zu dieser Liste kopieren">${ICONS.link}<span class="lbl">Link</span></button>`;

  // The ★ button is always there; without marks it is muted and only explains itself (title).
  function updateMine() {
    const n = markedShows().length;
    toggleMine.classList.toggle("empty", n === 0);
    toggleMine.setAttribute("aria-disabled", String(n === 0));
    toggleMine.setAttribute("aria-pressed", String(mineOnly));
    toggleMine.title =
      n === 0
        ? "Shows merken · nur in diesem Browser"
        : mineOnly
          ? "Wieder alle Shows anzeigen"
          : "Nur meine Shows anzeigen";
    toggleMine.setAttribute("aria-label", `Meine Shows (${n})`); // aria-pressed carries the state
    toggleMine.querySelector("b").textContent = n;
    minePanel.hidden = !listMode() || !listShows().length;
    if (!minePanel.hidden) {
      const wa = el("mine-wa");
      if (wa) wa.href = `https://wa.me/?text=${encodeURIComponent(listShareText())}`;
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

  // Set a show's mark ("" removes it) and patch its row in place: fader class, star, state toggle. In the
  // Meine-Shows list an un-marked row leaves, so the list is rendered again (the toast offers Rückgängig).
  function setMark(s, next, row) {
    const prev = marks[s.id] || "";
    if (next === prev) return;
    if (next) marks[s.id] = next;
    else delete marks[s.id];
    saveMarks();
    if (mineOnly && !next) {
      if (!markedShows().length) {
        popOverlay(); // the last mark went: the list closes, its history entry with it
        mineOnly = false;
      }
      render();
      return;
    }
    for (const r of document.querySelectorAll(`.show[data-id="${CSS.escape(s.id)}"]`)) patchRow(s, r);
    if (row && next === "going" && prev !== "going") echo(row.querySelector(".star"));
    updateMine();
  }
  function patchRow(s, row) {
    const st = marks[s.id] || "";
    row.classList.toggle("interested", st === "interested");
    row.classList.toggle("going", st === "going");
    const star = row.querySelector(".star");
    star.querySelector(".lbl").textContent = MARK_LABEL[st];
    star.title = MARK_TITLE[st];
    star.setAttribute("aria-pressed", String(Boolean(st)));
    const slot = row.querySelector(".mark-slot");
    if (!slot) return;
    const seg = slot.querySelector(".mark-seg");
    if (st && seg) {
      // Keep the toggle's buttons (and the keyboard focus on them): only the pressed segment changes.
      for (const b of seg.querySelectorAll("[data-state]"))
        b.setAttribute("aria-pressed", String(b.dataset.state === st));
    } else slot.innerHTML = markSegHtml(s);
  }
  // Echo (§4, gesture 2): three ghost stars scale 1 → 1.8 and fade, 120 ms apart – only on «Ich gehe».
  function echo(star) {
    if (!star || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (let i = 0; i < 3; i++) {
      const g = document.createElement("i");
      g.className = "echo";
      g.setAttribute("aria-hidden", "true");
      g.style.animationDelay = `${i * 120}ms`;
      g.innerHTML = ICONS.star;
      star.appendChild(g);
      g.addEventListener("animationend", () => g.remove(), { once: true });
      setTimeout(() => g.remove(), 1500); // whatever happens to the animation
    }
  }
  // Undo toast «‹Titel› entfernt · Rückgängig» (8 s, WCAG 2.2.1: the clock stops while the toast is hovered
  // or focused): one at a time, the newest un-mark wins. It sits right after the views in the DOM, so a
  // keyboard user reaches Rückgängig a few Tabs after the row, not behind the footer.
  const UNDO_MS = 8000;
  let undo = null; // { id, state, mineOnly, timer }
  const undoToast = document.createElement("div");
  undoToast.id = "undo";
  undoToast.className = "toast undo";
  undoToast.setAttribute("role", "status");
  undoToast.hidden = true;
  undoToast.innerHTML = `<span><b class="t"></b> entfernt</span><button type="button" title="Markierung wiederherstellen">Rückgängig</button>`;
  views.after(undoToast);
  function unmark(s, row) {
    const state = marks[s.id];
    if (!state) return;
    undo = { id: s.id, state, mineOnly, timer: 0 };
    setMark(s, "", row);
    if (row) flashWord(row.querySelector(".star"), "Entfernt");
    undoToast.hidden = false; // shown first, then filled: a live region announces only what changes while visible
    undoToast.querySelector(".t").textContent = `«${s.title}»`;
    if (callout()) callout().suspend(); // one thing at the bottom edge at a time (the nudge comes back later)
    undoClock();
  }
  function undoClock() {
    if (!undo) return;
    clearTimeout(undo.timer);
    undo.timer = setTimeout(hideUndo, UNDO_MS);
  }
  undoToast.addEventListener("pointerenter", () => undo && clearTimeout(undo.timer));
  undoToast.addEventListener("focusin", () => undo && clearTimeout(undo.timer));
  undoToast.addEventListener("pointerleave", undoClock);
  undoToast.addEventListener("focusout", undoClock);
  function hideUndo() {
    if (undo) clearTimeout(undo.timer);
    const id = undo && undo.id;
    undo = null;
    // The focus never vanishes with the toast: back to the row's star (or the ★ in the bar).
    if (undoToast.contains(document.activeElement)) {
      const star = id && document.querySelector(`.show[data-id="${CSS.escape(id)}"] .star`);
      (star || toggleMine).focus({ preventScroll: true });
    }
    undoToast.hidden = true;
  }
  undoToast.querySelector("button").addEventListener("click", () => {
    if (!undo) return;
    const { id, state, mineOnly: wasMine } = undo;
    const s = shows.find((x) => x.id === id);
    hideUndo();
    if (!s) return;
    // The list was left because its last show went: open it again. In any list (Meine Shows opened since, or
    // a shared one) the row has to be rendered, so the list is drawn again; in the agenda the row is patched.
    if (wasMine && !shared && !mineOnly) {
      mineOnly = true;
      pushOverlay("mine");
    }
    if (listMode()) {
      marks[s.id] = state;
      saveMarks();
      render();
    } else setMark(s, state, document.querySelector(`.show[data-id="${CSS.escape(s.id)}"]`));
    flashWord(document.querySelector(`.show[data-id="${CSS.escape(s.id)}"] .star`), "Wieder gemerkt");
  });

  // Long press on the star (500 ms) = «Ich gehe» in one go; the click that follows the release is swallowed.
  const LONG_PRESS = 500;
  let pressTimer = 0;
  let pressed = null; // the star button of a running press
  views.addEventListener("pointerdown", (e) => {
    const star = e.target.closest(".act.star");
    if (!star || e.button !== 0) return;
    const row = star.closest(".show");
    const s = shows.find((x) => x.id === row.dataset.id);
    if (!s) return;
    pressed = star;
    star._longAt = 0;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      pressTimer = 0;
      star._longAt = Date.now(); // consumed by the click handler
      if (marks[s.id] !== "going") {
        setMark(s, "going", row);
        flashWord(star, "Ich gehe");
      }
    }, LONG_PRESS);
  });
  const endPress = () => {
    clearTimeout(pressTimer);
    pressTimer = 0;
    pressed = null;
  };
  views.addEventListener("pointerup", endPress);
  views.addEventListener("pointercancel", endPress);
  views.addEventListener("pointerleave", endPress);
  // The press must not open the browser's context menu on a touch screen.
  views.addEventListener("contextmenu", (e) => {
    if (pressed && e.target.closest(".act.star")) e.preventDefault();
  });

  toggleMine.addEventListener("click", () => {
    if (!markedShows().length) {
      // Nothing marked yet: on a touch screen the tooltip never shows, so the button says it itself.
      flashWord(toggleMine, "Zuerst bei einer Show ★ tippen");
      return;
    }
    mineOnly = !mineOnly;
    // The list is a full-screen mode with its own «Zurück»: Back closes it like a panel (one entry; an
    // open Wo/Wann panel's entry is taken over, the panel folds away in syncListMode).
    if (mineOnly) pushOverlay("mine");
    else popOverlay();
    // The list actions (Kalender · Teilen · Link) and the rows come up under the bar, not just the gold star.
    renderAndKeepInView(() => mineOnly && scrollUnderBar(minePanel.hidden ? views : minePanel));
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
      const url = listUrl();
      if (!shared) history.replaceState(history.state, "", url);
      try {
        await navigator.share({
          title: listTitle(),
          text: `${listTitle()}\n${listShareLines().join("\n")}`,
          url,
        });
        flashWord(btn, "Geteilt");
      } catch (err) {
        if (!err || err.name !== "AbortError") flashWord(btn, "Teilen nicht möglich");
      }
    }
    if (btn.dataset.mine === "link") {
      // The #m= link is the shareable artefact: it goes to the clipboard and into the address bar.
      const url = listUrl();
      if (!shared) history.replaceState(history.state, "", url);
      try {
        await Promise.race([
          navigator.clipboard.writeText(url),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 1000)),
        ]);
        flashWord(btn, "Kopiert");
      } catch {
        flashWord(btn, "Link in Adresszeile");
      }
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
  function showShared(raw) {
    shared = {};
    sharedBy = "";
    sharedMissing = 0;
    // New form #m=<short><g|i>,…[,von:<Name>] ; old form #mine=<id>:<g|i>,… still accepted.
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
      mineOnly = false; // «hier ist alles, was kommt» must be true: a Meine-Shows mode on screen goes too
      render(); // a list that was on screen before (hashchange) goes
      return;
    }
    noteLink("");
    // The visitor's own link (every marked show, nothing else): that is simply "Meine Shows".
    if (ids.length === markedShows().length && ids.every((id) => marks[id])) {
      shared = null;
      setHash("");
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
  const listTitle = () => (shared ? "Reggae-Shows" : "Meine Reggae-Shows");
  // The message names the shows («Fr 16.10. Rude & Rebel Ska Fest, Luzern», the first five, «+n weitere»)
  // and ends with the link – a bare «Meine Reggae-Shows» + link told the friend nothing.
  const listShareLines = () => {
    const l = listShows();
    const lines = l.slice(0, 5).map((s) => `${dayShort(s)} ${s.title}, ${s.city}`);
    if (l.length > 5) lines.push(`+${l.length - 5} weitere`);
    return lines;
  };
  const listShareText = () => `${listTitle()}\n${listShareLines().join("\n")}\n${listUrl()}`;
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
      if (was && parseHash().mine) setHash("");
      return;
    }
    if (!was && openPanel) {
      // Fold Wo/Wann away; their settings survive. Without popping the history entry: the list mode took
      // it over (pushOverlay("mine") in the ★ handler) or came from a #m= hash navigation.
      fromHistory = true;
      setPanel(null);
      fromHistory = false;
    }
    const l = listShows();
    const n = l.length;
    const span = n ? `<i> · ${monthSpan(l)}</i>` : ""; // phones drop the months (the heading below has them)
    el("list-title").innerHTML = shared
      ? `${ICONS.star}<span class="t">${sharedBy ? `<i>Geteilte </i>Liste von ${escape(sharedBy)}` : "Geteilte Liste"}</span><b class="n">${n} ${n === 1 ? "Show" : "Shows"}${span}</b>`
      : `${ICONS.star}<span class="t">Meine Shows</span><b class="n">${n}${span}</b>`;
  }
  function closeListMode() {
    if (mineOnly) popOverlay(); // the ★ entry goes with the list (a #m= list came from a hash navigation)
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
  // Capture phase, so that the Wo/Wann panels (which own Esc while open) go first.
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || !listMode() || openPanel) return;
      closeListMode();
    },
    true,
  );
  // --- Views: Liste | Kalender | Karte → src/stores/views.svelte.js, src/components/views/ (story #33 M4) ---

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

  // Ported to src/components/filters (story #33 M1): the sticky bar, note pill, chip row, search,
  // filter panels, Wo / Wann, the view switch, the filter hash, pills, counts and the empty state.
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  // renderAndKeepInView / keepInView / scrollUnderBar → src/components/views/scroll.js (changeList, keepInView,
  // scrollUnderBar; story #33 M4).
  // Format chips (setFormat, the #formats click) and the line-up disclosure animation: ported to
  // src/components/festival/FormatChips.svelte + Lineup.svelte and src/stores/festival.svelte.js (M5).
  armCallout();
  init();
})();
