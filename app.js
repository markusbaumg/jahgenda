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
  const nudgeBlocked = () => Boolean(openPanel) || view === "map" || Date.now() < nudgeQuietUntil;
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
  // Headline of the empty state: «Kein Dub im Tessin», «Nichts in Bern am Wochenende», «Nichts zu «xy»» …
  const IM = new Set(["AG", "TG", "TI", "VS", "JU"]); // cantons that take «im», the rest take «in»
  const QUICK_WHEN = {
    today: "heute",
    tomorrow: "morgen",
    weekend: "am Wochenende",
    7: "in den nächsten 7 Tagen",
  };
  // A search term as a label (pill, offer, headline): long input is cut so nothing overflows a phone.
  const qLabel = (q) => (q.length > 24 ? `${q.slice(0, 22).trimEnd()}…` : q);
  function emptyHeadline(quick) {
    const q = search.value.trim();
    // «Kein Dub», «Kein Festival», «Kein Dub-Festival»
    const genreWord = activeGenre && (genreLabel[activeGenre] || activeGenre);
    const genre = activeFormat
      ? `${genreWord ? `${genreWord}-` : ""}${FORMAT_LABEL[activeFormat]}`
      : genreWord;
    const what = q ? ` zu «${qLabel(q)}»` : "";
    // Where: «im Tessin», «in Bern, Zürich», «in 4 Kantonen», «im Umkreis von 25 km».
    const codes = [...cantons];
    let where = "";
    if (codes.length === 1) where = ` ${IM.has(codes[0]) ? "im" : "in"} ${shortRegion(codes[0])}`;
    else if (codes.length && codes.length <= 3) where = ` in ${codes.map(shortRegion).join(", ")}`;
    else if (codes.length) where = ` in ${codes.length} Kantonen`;
    if (here && radiusKm) where += ` im Umkreis von ${radiusKm} km`;
    // When: «heute», «am Wochenende», «im November», «in den gewählten Monaten», «vom 16.10. bis 20.10.».
    let when = "";
    if (quick) when = ` ${QUICK_WHEN[quick]}`;
    else if (months.size === 1)
      when = ` im ${monthNameFmt.format(monthList.find((d) => months.has(monthKey(d))))}`;
    else if (months.size) when = " in den gewählten Monaten";
    else if (rangeFrom && rangeTo)
      when = sameDay(rangeFrom, rangeTo)
        ? ` am ${dm(rangeFrom)}`
        : ` vom ${dm(rangeFrom)} bis ${dm(rangeTo)}`;
    if (genre) return `Kein ${genre}${where}${when}${what}`;
    if (!where && quick) return `${QUICK_EMPTY[quick]} läuft nichts${what}`;
    return where || when || what ? `Nichts${where}${when}${what}` : "Nichts gefunden";
  }
  // Region name for pills and headlines: «Bern», «Deutschland» (no «(grenznah)» – the row says that).
  const shortRegion = (c) => (ABROAD[c] ? ABROAD[c].replace(/ \(grenznah\)$/, "") : regionName(c));

  // Escaped text with the search hit wrapped in <mark> (first occurrence, case-insensitive).
  function markHit(text, q) {
    const low = text.toLowerCase();
    const i = q && low.length === text.length ? low.indexOf(q) : -1;
    if (i < 0) return escape(text);
    return `${escape(text.slice(0, i))}<mark>${escape(text.slice(i, i + q.length))}</mark>${escape(text.slice(i + q.length))}`;
  }
  // Accessible name of the canton button in a row (§5): «Nur Bern anzeigen», abroad «Deutschland, grenznah».
  // The visible code is part of the name, so what is read matches what is seen (Lighthouse).
  const cantonLabel = (c) =>
    ABROAD[c]
      ? `${ABROAD[c].replace(" (grenznah)", ", grenznah")} – nur diese Shows anzeigen (${c})`
      : `Nur ${CANTONS[c] || c} anzeigen (${c})`;

  // One row inside a day group (see renderDays), §3.6: the 3-line stack (title, acts, meta), the side column
  // (coat of arms + abbreviation as a filter button, the star) and the actions line under the stack.
  // Line-up block (festival-spec.md §3.1): with more than 5 acts (festival or not) the acts line shows the
  // first 4 and a <details class="lineup"> holds the rest – by day when `days` exists, else the flat list.
  // Open when the visitor opened it before (openIds), when a search hit sits inside it, or from a deep
  // link. A festival without acts says «Line-up folgt».
  const LINEUP_PREVIEW = 4;
  const LINEUP_FROM = 6;
  function lineupHtml(s, q, hit) {
    const n = s.acts.length;
    const open = hit || openIds.has(s.id);
    const days = s.days && typeof s.days === "object" ? s.days : {};
    const keys = Object.keys(days)
      .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && Array.isArray(days[k]) && days[k].length)
      .sort();
    const actList = (list) =>
      `<span class="a">${list.map((a) => `<span>${markHit(String(a), q)}</span>`).join("")}</span>`;
    let body;
    if (keys.length) {
      // «Tag offen» = acts that sit in no day; compared like the validator's artist_key (venueKey is the
      // same rule), so «DUB INC.» in days matches «Dub Inc» in acts.
      const placed = new Set();
      body = keys
        .map((k) => {
          for (const a of days[k]) placed.add(venueKey(String(a)));
          const d = parseDay(k);
          return `<span class="d">${dowFmt.format(d).replace(".", "")} ${d.getDate()}.</span>${actList(days[k])}`;
        })
        .join("");
      const rest = s.acts.filter((a) => !placed.has(venueKey(a)));
      if (rest.length) body += `<span class="d">Tag offen</span>${actList(rest)}`;
    } else body = `<span class="d sr">Acts</span>${actList(s.acts)}`;
    const label = keys.length ? `Alle ${n} Acts nach Tag` : `Alle ${n} Acts`;
    return (
      `<details class="lineup${open ? " is-open" : ""}"${open ? " open" : ""}>` +
      `<summary aria-label="Line-up anzeigen (${n} Acts)" title="${escape(label)}"><span class="open">${escape(label)}</span><span class="close">Weniger</span></summary>` +
      `<div class="lineup-body"><div><div class="days">${body}</div></div></div></details>`
    );
  }
  // The acts line only names who is not in the title already («The Slackers (US)» / «The Slackers»
  // doubled most rows; «Scorchers feat. Capital Soul Sinners» names its guests in the title).
  const extraActs = (s) => {
    const t = fold(s.title);
    return s.acts.filter((a) => !t.includes(fold(a)));
  };
  function renderShow(s) {
    const url = safeUrl(s.url);
    // A title with a URL is recognisable as a link: dotted gold underline, «↗» and sr text.
    const title = url
      ? `<a class="ext" href="${escape(url)}" target="_blank" rel="noopener" title="Konzertseite beim Veranstalter öffnen">${escape(s.title)}<span class="ext-mark" aria-hidden="true">↗</span><span class="sr"> (öffnet externe Seite)</span></a>`
      : escape(s.title);
    const time = s.time ? `<time>${escape(s.time)}</time> · ` : "";
    // Genres are muted words at the end of the meta line; the active genre chip is not repeated.
    const genreWords = s.genres
      .filter((g) => g !== activeGenre && g !== activeFormat)
      .map((g) => ` · <span class="genre">${escape(genreLabel[g] || g)}</span>`)
      .join("");
    // Festival (§3.7): «3 Tage» leads the meta line, the door time (a weekender) follows.
    const nDays = s._end ? Math.round((s._end - s._day) / 864e5) + 1 : 0;
    const daysWord = nDays ? `<span class="ndays">${nDays} Tage</span> · ` : "";
    // With a known position the distance sits before the genres (§3.6); the hover-only placeholder that
    // asks for the position goes last, so its invisible width leaves no hole in the line.
    const dist = distanceLabel(s);
    const past = s._past ? ` · <span class="vorbei">vorbei</span>` : "";
    const extra = extraActs(s);
    const hasActs = extra.length > 0;
    // A search hit inside the line-up is highlighted, and the line (clamped to 2 lines on phones) opens up.
    const q = search.value.trim().toLowerCase();
    const hit = hasActs && Boolean(q) && s.acts.some((a) => a.toLowerCase().includes(q));
    const long = s.acts.length >= LINEUP_FROM;
    const preview = long ? extra.slice(0, LINEUP_PREVIEW) : extra;
    let acts = hasActs
      ? `<p class="acts${hit ? " hit" : ""}">${preview.map((a) => `<span>${markHit(a, q)}</span>`).join("")}</p>`
      : "";
    if (long) acts += lineupHtml(s, q, hit);
    else if (s._end && !s.acts.length) acts = `<p class="acts none">Line-up folgt</p>`;
    return `
      <li class="show${s._past ? " past" : ""}${s._end ? " festival" : ""}${markClass(s)}" id="${escape(s.id)}" data-id="${escape(s.id)}">
        <div class="body">
          <h3 class="title">${title}</h3>
          ${acts}
          <p class="meta">${daysWord}${time}${venueLink(s)} · ${escape(s.city)}${here ? dist : ""}${genreWords}${past}${here ? "" : dist}</p>
        </div>
        <div class="side">
          <button type="button" class="canton${ABROAD[s.canton] ? " abroad" : ""}" data-canton="${escape(s.canton)}" aria-pressed="${cantons.has(s.canton)}" aria-label="${escape(cantonLabel(s.canton))}" title="${escape(regionName(s.canton))} als Filter ein-/ausschalten"><img src="img/cantons/${escape(s.canton)}.svg" alt="" loading="lazy" decoding="async">${escape(s.canton)}</button>
          ${starButton(s)}
        </div>
        <div class="foot-row">
          ${shared && shared[s.id] === "going" ? `<span class="goes">${ICONS.star}geht hin</span>` : ""}
          <div class="mark-slot">${markSegHtml(s)}</div>
          <div class="actions">${actionsHtml(s)}</div>
        </div>
      </li>`;
  }

  // Day groups (§3.5): one <section class="day"> per date with a single <time> cell that every show of
  // that day shares. Today and tomorrow get a red HEUTE / MORGEN pill in the DOW slot while the data is
  // fresh; Fr/Sa/So of the coming weekend get a red DOW and, in the list, a «Wochenende» rule before the
  // first of them.
  function renderDays(items, { weekendRule = false } = {}) {
    const today = todayStart();
    const tomorrow = addDays(today, 1);
    const [wkStart, wkEnd] = weekendRange(today);
    const fresh = isFresh();
    // A festival (§3.7) is a card of its own with a range date cell, never grouped with the day's shows.
    const days = new Map();
    for (const s of items) {
      const key = s._end ? `${s.date}/${s.id}` : s.date;
      if (!days.has(key)) days.set(key, []);
      days.get(key).push(s);
    }
    let ruleDue = weekendRule;
    return [...days]
      .map(([, rows]) => {
        const s0 = rows[0];
        const d = s0._day;
        const end = s0._end || d;
        const date = s0.date;
        const isToday = sameDay(d, today);
        const isTomorrow = sameDay(d, tomorrow);
        const inWeekend = d <= wkEnd && end >= wkStart;
        const cls = ["day"];
        if (s0._past) cls.push("past");
        if (inWeekend) cls.push("weekend");
        if (isToday) cls.push("today");
        if (s0._end) cls.push("festival");
        let rule = "";
        if (ruleDue && inWeekend) {
          ruleDue = false;
          rule = `<p class="rule-weekend"><span>Wochenende</span></p>`;
        }
        let dow, num, label, datetime;
        if (s0._end) {
          // «FR–SO» over «16–18»; across a month boundary «30» over «–1.8.»; «LÄUFT» while it runs.
          const sameMonth = d.getMonth() === end.getMonth() && d.getFullYear() === end.getFullYear();
          dow = s0._now
            ? `<span class="dow now live">Läuft</span>`
            : `<span class="dow range">${dowFmt.format(d).replace(".", "")}–${dowFmt.format(end).replace(".", "")}</span>`;
          num = sameMonth
            ? `<span class="num range">${d.getDate()}–${end.getDate()}</span>`
            : `<span class="num range">${d.getDate()}</span><span class="day-end">–${end.getDate()}.${end.getMonth() + 1}.</span>`;
          label = `${s0._now ? "Läuft, " : ""}${fullDayFmt.format(d)} bis ${fullDayFmt.format(end)}`;
          datetime = `${date}/${s0.end_date}`;
        } else {
          const pill = fresh && (isToday || isTomorrow) ? (isToday ? "Heute" : "Morgen") : "";
          dow = pill
            ? `<span class="dow now">${pill}</span>`
            : `<span class="dow">${dowFmt.format(d).replace(".", "")}</span>`;
          num = `<span class="num">${d.getDate()}</span>`;
          // The aria-label replaces the cell's text for screen readers, so the pill word goes in front of it.
          label = `${pill ? `${pill}, ` : ""}${fullDayFmt.format(d)}`;
          datetime = date;
        }
        return `${rule}
        <section class="${cls.join(" ")}" data-date="${escape(date)}">
          <time class="date" datetime="${escape(datetime)}" aria-label="${escape(label)}">${dow}${num}</time>
          <ul class="day-shows">${rows.map(renderShow).join("")}</ul>
        </section>`;
      })
      .join("");
  }
  // The line-up disclosures stay open across re-renders (render() rebuilds the DOM on every keystroke).
  const openIds = new Set();

  // The actions line of a row (§3.6): Kalender (.ics) · Google · Teilen · Link, plus «Tickets ↗» and
  // «Infos ↗» when the show has those URLs. Links carry their href, buttons carry data-act – both are
  // handled by runAction(). Teilen is navigator.share where it exists; elsewhere it stays the WhatsApp
  // link, so WhatsApp never disappears for anyone. Labels are visible from 600 px, icon-only below
  // (44 × 44, the aria-label keeps the name); the feedback word («Kopiert» …) appears next to the icon.
  const waUrl = (s) => `https://wa.me/?text=${encodeURIComponent(shareText(s))}`;
  const extNote = `<span class="ext-mark" aria-hidden="true">↗</span><span class="sr"> (öffnet externe Seite)</span>`;
  function actionsHtml(s) {
    const url = safeUrl(s.url);
    const tickets = safeUrl(s.tickets);
    return [
      `<button type="button" class="act" data-act="cal" aria-label="In Kalender speichern (.ics)" title="Als .ics speichern (Apple, Outlook …)">${ICONS.cal}<span class="lbl">Kalender</span></button>`,
      `<a class="act" href="${escape(gcalUrl(s))}" target="_blank" rel="noopener" aria-label="In Google Kalender eintragen" title="In Google Kalender eintragen">${ICONS.gcal}<span class="lbl">Google</span></a>`,
      navigator.share
        ? `<button type="button" class="act" data-act="share" aria-label="Show teilen" title="Teilen (WhatsApp, Mail, …)">${ICONS.share}<span class="lbl">Teilen</span></button>`
        : `<a class="act" href="${waUrl(s)}" target="_blank" rel="noopener" aria-label="Per WhatsApp teilen" title="Per WhatsApp teilen">${ICONS.wa}<span class="lbl">Teilen</span></a>`,
      `<button type="button" class="act" data-act="link" aria-label="Link zu dieser Show kopieren" title="Link zu dieser Show kopieren">${ICONS.link}<span class="lbl">Link</span></button>`,
      tickets
        ? `<a class="act tickets" href="${escape(tickets)}" target="_blank" rel="noopener" aria-label="Tickets kaufen (öffnet externe Seite)" title="Tickets kaufen">${ICONS.ticket}<span class="lbl">Tickets</span>${extNote}</a>`
        : "",
      url
        ? `<a class="act event" href="${escape(url)}" target="_blank" rel="noopener" aria-label="Infos beim Veranstalter (öffnet externe Seite)" title="Event-Seite des Veranstalters öffnen">${ICONS.event}<span class="lbl">Infos</span>${extNote}</a>`
        : "",
      // The timetable is also an action (the SBB badge in the meta line only shows on hover – touch
      // screens have none).
      sbbUrl(s)
        ? `<a class="act sbb-act" href="${escape(sbbUrl(s))}" target="_blank" rel="noopener" aria-label="SBB-Fahrplan nach ${escape(s.city)} (öffnet externe Seite)" title="SBB-Fahrplan ${escape(homeCity)} → ${escape(s.city)}, Ankunft eine Stunde vor der Show">${ICONS.train}<span class="lbl">SBB</span>${extNote}</a>`
        : "",
    ].join("");
  }
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

  // --- Counts helper (§7 S6): how many shows a choice would show, with every other filter as it is. The
  // chips («dub 4», «Bern 2»), the empty state («Tessin entfernen → 4 Shows») and the month histogram
  // all count this way, so a number on a control is always the number of rows a tap on it yields.
  const countWith = (o) => shows.filter((s) => isVisible(s, o)).length;
  const nShows = (n) => `${n} ${n === 1 ? "Show" : "Shows"}`;
  // Each active filter as a removable dimension: what it is, how to name it, and what removing it yields.
  // In a stable order (search, genre, cantons, radius, time) – the pills; the empty state sorts by yield.
  function activeDims() {
    const dims = [];
    const q = search.value.trim();
    if (q) dims.push({ kind: "q", label: `«${qLabel(q)}»`, count: countWith({ q: "" }) });
    if (activeGenre)
      dims.push({
        kind: "genre",
        label: genreLabel[activeGenre] || activeGenre,
        count: countWith({ genre: "" }),
      });
    if (activeFormat)
      dims.push({ kind: "format", label: FORMAT_LABEL[activeFormat], count: countWith({ format: "" }) });
    for (const c of cantons) {
      const rest = new Set(cantons);
      rest.delete(c);
      dims.push({ kind: "canton", value: c, label: shortRegion(c), count: countWith({ cantons: rest }) });
    }
    if (here && radiusKm)
      dims.push({ kind: "radius", label: `≤ ${radiusKm} km`, count: countWith({ radius: 0 }) });
    if (months.size)
      for (const d of monthList.filter((d) => months.has(monthKey(d)))) {
        const rest = new Set(months);
        rest.delete(monthKey(d));
        dims.push({
          kind: "month",
          value: monthKey(d),
          label: monthLabel(d),
          count: countWith({ months: rest, range: null }),
        });
      }
    else if (rangeFrom && rangeTo)
      dims.push({ kind: "range", label: rangeLabel(), count: countWith({ months: new Set(), range: null }) });
    return dims;
  }
  // Remove one filter dimension (a pill, or an offer in the empty state); "all" resets every filter.
  function removeFilter(kind, value) {
    if (kind === "all") return resetFilters();
    if (kind === "q") search.value = "";
    if (kind === "genre") setGenre("");
    if (kind === "format") setFormat("");
    if (kind === "canton") toggleCanton(value);
    if (kind === "radius") {
      radiusKm = 0;
      updateWhere();
    }
    if (kind === "month") {
      months.delete(value);
      syncPast();
    }
    if (kind === "range") clearRange();
    renderAndKeepInView();
  }
  // Active filters (§3.4) as gold pills under the results row, one per dimension, «Alles zurücksetzen»
  // only from two on. Nothing in the list mode: there the filters are bypassed, not active.
  const resultsEl = el("results");
  function renderPills() {
    const dims = listMode() ? [] : activeDims();
    resultsEl.classList.toggle("empty", !dims.length);
    resultsEl.innerHTML =
      dims
        .map(
          (d) =>
            `<button type="button" class="fpill" data-remove="${d.kind}"${d.value ? ` data-value="${escape(d.value)}"` : ""} title="Filter «${escape(d.label)}» entfernen" aria-label="Filter ${escape(d.label)} entfernen">${escape(d.label)}<span class="x" aria-hidden="true">✕</span></button>`,
        )
        .join("") +
      (dims.length >= 2
        ? `<button type="button" class="linkish clear" data-remove="all" title="Alle Filter zurücksetzen">Alles zurücksetzen</button>`
        : "");
  }
  resultsEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-remove]");
    if (b) removeFilter(b.dataset.remove, b.dataset.value);
  });
  // Chip counts follow the other filters: «dub 4» is what a tap on dub yields right now. The numbers
  // change, the chips do not move (reserved width in CSS).
  function updateCounts() {
    if (listMode()) return;
    // Screen readers hear «Reggae, 75 Konzerte»: the unit sits in the count as sr text, so the accessible
    // name still contains the visible words (an aria-label with the same words would not).
    const count = (n) =>
      `<span class="sr">, </span>${n}<span class="sr"> ${n === 1 ? "Konzert" : "Konzerte"}</span>`;
    for (const c of genreBar.querySelectorAll(".chip[data-genre]")) {
      const n = countWith({ genre: c.dataset.genre });
      const sm = c.querySelector("small");
      if (sm) sm.innerHTML = count(n);
      const name = genreLabel[c.dataset.genre] || c.dataset.genre;
      c.title = c.dataset.genre ? `Nur ${name} anzeigen (${n})` : `Alle Genres anzeigen (${n})`;
    }
    for (const c of formatBar.querySelectorAll(".chip[data-format]")) {
      const n = countWith({ format: c.dataset.format });
      const sm = c.querySelector("small");
      if (sm) sm.innerHTML = count(n);
      c.title = `Nur Festivals anzeigen (${n})`;
    }
    for (const c of cantonChips.querySelectorAll(".chip[data-canton]")) {
      const code = c.dataset.canton;
      const n = countWith({ cantons: new Set(code ? [code] : []) });
      const sm = c.querySelector("small");
      if (sm) sm.innerHTML = count(n);
      c.title = code
        ? `${regionName(code)}: ${nShows(n)} – anklicken zum Ein-/Ausschalten`
        : `Alle Kantone anzeigen (${n})`;
    }
  }

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
    // Festivals are counted apart from the concerts: «12 Konzerte · 1 Festival · Juli 2027».
    const nFest = visible.filter(isFestival).length;
    const nConc = visible.length - nFest;
    const festNote = nFest ? `${nConc ? " · " : ""}${nFest} ${nFest === 1 ? "Festival" : "Festivals"}` : "";
    const concerts = nConc ? `${nConc} ${nConc === 1 ? "Konzert" : "Konzerte"}` : "";
    resultsText.textContent = shared
      ? `Geteilte Liste · ${visible.length} ${visible.length === 1 ? "Show" : "Shows"} · ${span}${rangeNote}`
      : `${concerts}${festNote}${filtered ? " für diese Auswahl" : ""} · ${span}${rangeNote}`;
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
    observeMonths();
  }
  // Sticky month heads: a 1 px gold hairline draws in while a head is stuck under the bar (§4). The
  // observer looks at the heads of the current render; a head is stuck once its top meets the bar.
  // The bar height is read from a head's resolved sticky `top` (the --bar-h token is a calc() string,
  // which would parse as NaN); a head that is not sticky at all (max-height: 500px) is left alone.
  let monthObserver = null;
  function observeMonths() {
    if (!("IntersectionObserver" in window)) return;
    if (monthObserver) monthObserver.disconnect();
    const first = list.querySelector(".month");
    if (!first) return;
    const bar = parseFloat(getComputedStyle(first).top);
    if (!(bar >= 0)) return;
    monthObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const r = e.boundingClientRect;
          // Stuck: partly cut by the bar's edge, its top at the bar, its bottom still below it. A head
          // inside a month that content-visibility has skipped reports an empty box and is never stuck.
          e.target.classList.toggle("stuck", e.intersectionRatio < 1 && r.top <= bar + 1 && r.bottom > bar);
        }
      },
      { threshold: [1], rootMargin: `-${Math.round(bar) + 1}px 0px 0px 0px` },
    );
    for (const h of list.querySelectorAll(".month")) monthObserver.observe(h);
  }
  // «So 1. Aug.» – the last day of a festival for the ghost row (non-breaking, so it never wraps to «Aug.»).
  const endLabel = (s) =>
    `${dowFmt.format(s._end).replace(".", "")} ${s._end.getDate()}. ${shortMonthFmt.format(s._end)}`;

  // --- Filter state in the URL: #q=…&g=…&wo=ZH,BE&r=25&wann=weekend|today|7|2026-10,2026-11&past=1 ---
  // Written with replaceState (a filter tap never adds a history entry), read once on load. A filtered
  // view can thus be reloaded, bookmarked and sent as a link; show links (#<short>) and list links
  // (#m=…) keep the hash for themselves and are never overwritten.
  const FILTER_HASH = /^#?[a-z]+=/;
  // A list link (#m=…) or a view link (#view=…) is not a filter hash, even when combined with "&".
  const isFilterHash = (h) => FILTER_HASH.test(h) && !/(^#?|&)(mine|m|view)=/.test(h);
  function filterParams() {
    const p = new URLSearchParams();
    const q = search.value.trim();
    if (q) p.set("q", q);
    if (activeGenre) p.set("g", activeGenre);
    if (activeFormat) p.set("f", activeFormat);
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
      const kind = Object.keys(QUICK).find((k) => {
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
    const f = p.get("f") || "";
    setFormat(formatBar.querySelector(`.chip[data-format="${CSS.escape(f)}"]`) ? f : "");
    for (const c of (p.get("wo") || "").split(",")) if (CANTONS[c] || ABROAD[c]) cantons.add(c);
    const r = Number(p.get("r"));
    if ([10, 25, 50].includes(r)) radiusKm = r; // applies once the position is known
    const wann = p.get("wann") || "";
    if (QUICK[wann]) setRange(...quickRange(wann));
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
        `<p>${offline ? "Ohne Verbindung gibt es keine Agenda – sobald du wieder Netz hast, klappt es." : "Die Konzerte konnten nicht geladen werden. Bitte später nochmals versuchen."}</p>` +
        `<button type="button" class="primary" id="retry" title="Konzerte nochmals laden">Nochmals versuchen</button>`;
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

  // Canton badge in a row: toggles that canton in the Wo filter.
  list.addEventListener("click", (e) => {
    const c = e.target.closest(".canton[data-canton]");
    if (!c) return;
    toggleCanton(c.dataset.canton);
    renderAndKeepInView();
  });

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

  function resetFilters() {
    cantons.clear();
    radiusKm = 0;
    updateWhere();
    search.value = "";
    setGenre("");
    setFormat("");
    mineOnly = false;
    clearRange();
    if (shared) {
      shared = null;
      setHash("");
    }
    render();
  }
  status.addEventListener("click", (e) => {
    if (e.target.id === "reset") {
      resetFilters();
      search.focus();
      return;
    }
    if (e.target.id === "retry") return retry();
    const b = e.target.closest("[data-remove]");
    if (b) removeFilter(b.dataset.remove, b.dataset.value);
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
      fitPanel();
      pushOverlay(name);
      if (callout()) callout().suspend(); // a sticker never covers the panel's last rows
      // Keyboard and screen-reader users land in the panel, not 12 Tabs away from it.
      const first = el(PANELS[name][1]).querySelector(".chip:not([hidden])");
      if (first) first.focus({ preventScroll: true });
    } else if (was) popOverlay();
  }
  // The panel's max-height counts from the bar's real bottom edge (style.css .filters .panel): at the top
  // of the page the bar is not stuck yet and sits under the header, so the panel would otherwise run
  // ~135 px past the fold with its last chips unreachable.
  function fitPanel() {
    const bottom = Math.max(0, filtersForm.getBoundingClientRect().bottom);
    filtersForm.style.setProperty("--panel-top", `${Math.round(bottom)}px`);
  }
  window.addEventListener("scroll", () => openPanel && fitPanel(), { passive: true });
  window.addEventListener("resize", () => openPanel && fitPanel());
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
  const cantonChips = el("canton-chips");
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
  cantonChips.addEventListener("click", (e) => {
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
    locateBtn.classList.add("locating"); // the ring pulses until a fix (§4)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locating = false;
        locateBtn.classList.remove("locating");
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
            `<svg class="geo-pin" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg><span class="sr">Standort gefunden. </span>Am nächsten bei dir: ` +
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
        locateBtn.classList.remove("locating");
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
  // Undo toast «Entfernt · Rückgängig» (4 s): one at a time, the newest un-mark wins.
  let undo = null; // { id, state, mineOnly, timer }
  const undoToast = document.createElement("div");
  undoToast.id = "undo";
  undoToast.className = "toast undo";
  undoToast.setAttribute("role", "status");
  undoToast.hidden = true;
  undoToast.innerHTML = `<span></span><button type="button" title="Markierung wiederherstellen">Rückgängig</button>`;
  document.body.appendChild(undoToast);
  function unmark(s, row) {
    const state = marks[s.id];
    if (!state) return;
    undo = { id: s.id, state, mineOnly, timer: 0 };
    setMark(s, "", row);
    undoToast.hidden = false; // shown first, then filled: a live region announces only what changes while visible
    undoToast.querySelector("span").textContent = `«${s.title}» entfernt`;
    clearTimeout(undo.timer);
    undo.timer = setTimeout(hideUndo, 4000);
  }
  function hideUndo() {
    if (undo) clearTimeout(undo.timer);
    undo = null;
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
        await navigator.share({ title: listTitle(), text: listTitle(), url });
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
  const listShareText = () => `${listTitle()}: ${listUrl()}`;
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

  // --- Wann: quick picks (Heute / Wochenende / 7 Tage) or any set of months. ---
  // The choice lives for this visit only (nothing is stored). Default = no range = everything upcoming.
  const toggleWhen = el("toggle-when");
  const whenPanel = el("when-panel");
  const whenMonths = el("when-months");
  const whenCount = el("when-count");
  const togglePast = el("toggle-past");
  const pastLabel = togglePast.closest("label");
  const listFoot = el("list-foot");
  const pastFoot = el("past-foot");
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
  // `o` replaces the time filters for what-if counts: { months: Set, range: [from, to] | null }.
  // A festival counts for every month and every quick range it touches.
  const inRange = (s, o) => {
    o = opt(o);
    const ms = "months" in o ? o.months : months;
    const end = s._end || s._day;
    if (ms.size) {
      for (let m = monthStart(s._day); m <= end; m = monthStart(addDays(m, 32)))
        if (ms.has(monthKey(m))) return true;
      return false;
    }
    const [from, to] = "range" in o ? o.range || [] : [rangeFrom, rangeTo];
    return !(from && to) || (s._day <= to && end >= from);
  };
  // Quick picks (§7 S3: Heute · Morgen · Wochenende · 7 Tage), one exclusive choice; the badge, the chips
  // and the empty state name the pick rather than its dates.
  const QUICK = { today: "Heute", tomorrow: "Morgen", weekend: "Wochenende", 7: "7 Tage" };
  const QUICK_EMPTY = {
    today: "Heute",
    tomorrow: "Morgen",
    weekend: "Am Wochenende",
    7: "In den nächsten 7 Tagen",
  };
  const quickActive = () =>
    (!months.size &&
      rangeFrom &&
      Object.keys(QUICK).find((k) => {
        const [a, b] = quickRange(k);
        return sameDay(a, rangeFrom) && sameDay(b, rangeTo);
      })) ||
    "";
  function rangeLabel() {
    if (months.size) {
      const picked = monthList.filter((d) => months.has(monthKey(d)));
      return picked.length > 2 ? `${picked.length} Monate` : picked.map(monthLabel).join(", ");
    }
    const quick = quickActive();
    if (quick) return QUICK[quick];
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
    if (kind === "tomorrow") return [addDays(today, 1), addDays(today, 1)];
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
      if (quickActive() === quick.dataset.quick) clearRange();
      else setRange(...quickRange(quick.dataset.quick));
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
  // The footer row: the past days appear above it, so the page scrolls up to the first of them; hiding
  // them again keeps the results in view.
  pastFoot.addEventListener("click", () => {
    showPast = !showPast;
    pastAuto = false;
    if (!showPast) return renderAndKeepInView();
    render();
    const first = list.querySelector(".day.past");
    if (first) first.scrollIntoView({ block: "start", behavior: reducedMotion.matches ? "auto" : "smooth" });
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
  // The segmented control writes #view=calendar / #view=map (a plain link for the list), so a view can be
  // linked; a show link in the hash is consumed by the switch. Not in the list mode, whose #m= link stays.
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
  const genreColor = (s) =>
    s._end ? "var(--gold)" : GENRE_COLORS[s.genres.find((g) => GENRE_COLORS[g])] || "var(--gold)";

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

    // A festival is on the grid on each of its days.
    const byDay = new Map();
    for (const s of visible) {
      for (let d = s._day; d <= (s._end || s._day); d = addDays(d, 1)) {
        const key = dayKey(d);
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key).push(s);
      }
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
              : `<button type="button" class="cal-num" aria-pressed="${key === calDay}" aria-label="${escape(label)}" title="Tag auswählen: ${escape(label)}">${d.getDate()}</button>`
          }
          <span class="cal-dots" aria-hidden="true">${items
            .slice(0, 3)
            .map(
              (s) =>
                `<i class="${marks[s.id] === "going" ? "going" : ""}" style="background:${genreColor(s)}"></i>`,
            )
            .join("")}</span>
          <div class="cal-pills">${items
            .map(
              (s) =>
                `<button type="button" class="pill${marks[s.id] === "going" ? " going" : ""}" data-id="${escape(s.id)}" style="--pill:${genreColor(s)}" title="${escape(`${s.title} · ${s.venue}, ${s.city}`)} – zur Show in der Liste springen">${marks[s.id] === "going" ? "★ " : ""}${escape(s.title)}</button>`,
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
      `<span><i style="background:var(--green-text)"></i>Dub, Soundsystem</span><span><i style="background:var(--gold)"></i>Reggae &amp; mehr, Festival</span>` +
      `${visible.some((s) => marks[s.id] === "going") ? `<span><i class="going" style="background:var(--green-text)"></i>★ Ich gehe</span>` : ""}</p>`;
    calendarEl.innerHTML = `
      <div class="cal-head rule-tri">
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
            ? `<div class="shows">${renderDays(selected)}</div>`
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
      const hadFocus = cell.contains(document.activeElement);
      renderCalendar(lastVisible);
      // The grid was rebuilt: a keyboard user keeps the focus on the day just chosen (§5: never <body>).
      if (hadFocus) {
        const btn = calendarEl.querySelector(`[data-day="${calDay}"] .cal-num`);
        if (btn && btn.focus) btn.focus({ preventScroll: true });
      }
      // On the phone the day's shows are listed under the grid – below the fold: bring them up, but only
      // as far as needed (the grid stays on screen while flicking through days, unless the day's list
      // is taller than the room under the bar).
      const day = calendarEl.querySelector(".cal-day");
      if (day && getComputedStyle(day).display !== "none") {
        const r = day.getBoundingClientRect();
        const room = innerHeight - 16;
        if (r.top > innerHeight - 120) {
          quietScrollUntil = Date.now() + 1500;
          const by = Math.min(r.bottom - room, r.top - filters.offsetHeight - 40);
          if (by > 0) window.scrollBy({ top: by, behavior: reducedMotion.matches ? "auto" : "smooth" });
        }
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
  let pins = []; // { lat, lon, marker, shows } – every venue pin of the current render, clustered by zoom
  let pinSignature = ""; // the grouping of the last layoutPins(): unchanged → the layers (and an open popup) stay
  let clusterLayer = null;
  const touch = matchMedia("(hover: none)").matches; // zoom control bottom right, popups sized for a thumb

  // Pins that would sit on top of each other at the current zoom (the whole Mittelland at the start view
  // of a portrait phone: 57 pins in a 160 px patch, 42 of them unreachable) are folded into one cluster
  // badge; a tap on it zooms into that group until the pins come apart. Re-run on every zoom.
  const CLUSTER_PX = 50;
  function layoutPins() {
    if (!map || !pins.length) return;
    const zoom = map.getZoom();
    const groups = [];
    for (const p of [...pins].sort((a, b) => b.shows - a.shows)) {
      const px = map.project([p.lat, p.lon], zoom);
      const g = groups.find((x) => x.px.distanceTo(px) < CLUSTER_PX);
      if (g) g.members.push(p);
      else groups.push({ px, members: [p] });
    }
    const signature = groups.map((g) => g.members.map((p) => `${p.lat},${p.lon}`).join("|")).join(";");
    if (signature === pinSignature) return;
    pinSignature = signature;
    if (clusterLayer) clusterLayer.remove();
    clusterLayer = L.layerGroup().addTo(map);
    for (const p of pins) p.marker.remove();
    for (const g of groups) {
      if (g.members.length === 1) {
        g.members[0].marker.addTo(markerLayer);
        continue;
      }
      const n = g.members.reduce((sum, p) => sum + p.shows, 0);
      const lat = g.members.reduce((sum, p) => sum + p.lat, 0) / g.members.length;
      const lon = g.members.reduce((sum, p) => sum + p.lon, 0) / g.members.length;
      const title = `${g.members.length} Clubs mit ${n} Shows: hineinzoomen`;
      const cluster = L.marker([lat, lon], {
        icon: L.divIcon({
          className: "cluster-icon",
          html: `<span><b>${g.members.length}</b></span>`,
          iconSize: [44, 44],
          iconAnchor: [22, 40], // sits on its spot like a pin, so pin heads and badges share one height
        }),
        title,
        zIndexOffset: 500,
      });
      cluster.on("add", () => cluster.getElement().setAttribute("aria-label", title));
      cluster.on("click", () => {
        // (Enter on the focused badge arrives as a click: Leaflet's keyboard handling for markers.)
        map.fitBounds(
          g.members.map((p) => [p.lat, p.lon]),
          { padding: [48, 48], maxZoom: 16 },
        );
      });
      cluster.addTo(clusterLayer);
    }
  }

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
  mapEl.addEventListener("click", (e) => {
    const a = e.target.closest("[data-view-link]");
    if (!a) return;
    e.preventDefault();
    setView(a.dataset.viewLink, { push: true });
  });
  // Back online while the offline note shows: the map loads now.
  window.addEventListener("online", () => {
    if (view === "map" && !window.L && !views.hidden) render();
  });

  // «Karte braucht Netz» (§3.12): offline, or Leaflet could not be fetched – with the way to the list.
  const mapOfflineNote = () =>
    `<p class="map-note offline"><strong>Karte braucht Netz</strong>Ohne Verbindung gibt es keine Karte – die Shows stehen alle in der <a href="#" data-view-link="list">Liste</a>.</p>`;
  function renderMap(visible) {
    if (!window.L) {
      if (navigator.onLine === false) {
        mapEl.innerHTML = mapOfflineNote();
        return;
      }
      mapEl.innerHTML = `<p class="map-note">Karte wird geladen …</p>`;
      loadLeaflet().then(
        () => view === "map" && render(),
        () => {
          mapEl.innerHTML = mapOfflineNote();
        },
      );
      return;
    }
    if (!map) {
      mapEl.innerHTML = "";
      map = L.map(mapEl, { scrollWheelZoom: false, zoomControl: false, zoomSnap: 0.5 }); // half steps: the start view fits the country one notch closer on a portrait phone
      // Leaflet's own controls get German tooltips. On touch screens the zoom buttons sit bottom right,
      // where no popup is ever panned underneath them (popups open at the top left).
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
      // Until the first tiles are painted the frame is a plain dark square with pins floating on it: a
      // «Karte lädt …» corner note (CSS .map.tiles-pending) says that the map is still on its way.
      mapEl.classList.add("tiles-pending");
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        className: "map-tiles",
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" title="OpenStreetMap-Lizenz öffnen">OpenStreetMap</a>-Mitwirkende',
      })
        .once("load", () => mapEl.classList.remove("tiles-pending"))
        .addTo(map);
      markerLayer = L.layerGroup().addTo(map);
      map.on("zoomend", layoutPins);
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
    pins = [];
    pinSignature = "";

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
      // Centre by role (§3.12): dark dot = venue, gold star = «Ich gehe», gold dot = festival.
      const centre =
        kind === "going"
          ? `<circle cx="14" cy="13.5" r="7.5" fill="#14110e"/><path d="${STAR}" fill="#f2b632"/>`
          : kind === "festival"
            ? `<circle cx="14" cy="13.5" r="6.5" fill="#14110e"/><circle cx="14" cy="13.5" r="4" fill="#f2b632"/>`
            : `<circle cx="14" cy="13.5" r="5.5" fill="#14110e"/>`;
      return L.divIcon({
        className: `pin-icon${kind === "going" ? " going" : ""}${kind === "festival" ? " festival" : ""}`,
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
    const pinKind = (items) =>
      items.some((x) => marks[x.id] === "going") ? "going" : items.some(isFestival) ? "festival" : "venue";
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
      }).bindPopup(
        vs.length === 1
          ? `<strong>${escape(s.venue)}</strong> · ${escape(s.city)}${showList(items)}`
          : `<strong>${escape(s.city)}</strong>` +
              vs
                .map(
                  (v) =>
                    `<p class="popup-venue"><strong>${escape(v.s.venue)}</strong></p>${showList(v.items)}`,
                )
                .join(""),
        // Leaflet's default popup (300 px + margins + ×) is wider than the map on a phone: the wrapper
        // (content + 2 × 14 px margin + 2 px) stays one gutter inside the frame on both sides, and the
        // auto-pan padding never asks for more room than that. On a pointer screen the zoom control
        // sits top left, so a tall popup keeps clear of it.
        {
          maxWidth: Math.min(320, mapEl.clientWidth - 62),
          autoPanPaddingTopLeft: [touch ? 16 : 60, 24],
          autoPanPaddingBottomRight: [16, 24],
        },
      );
      // Leaflet names a pin by its text (the count badge): give it the venue instead. The element exists
      // once the marker is on the map, which happens after fitBounds() below (the map has no view yet).
      marker.on("add", () => marker.getElement().setAttribute("aria-label", title));
      pins.push({ lat: s.lat, lon: s.lon, marker, shows: items.length });
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
    layoutPins();

    const rest = visible.filter((s) => !hasPos(s));
    mapRest.innerHTML =
      `<p class="map-legend"><span class="legend-item"><span class="pin-mini"></span>Club mit Shows (Zahl = Anzahl Shows)</span> ` +
      `<span class="legend-item"><span class="pin-mini star">★</span>«Ich gehe»</span>` +
      `${visible.some(isFestival) ? ` <span class="legend-item"><span class="pin-mini fest"></span>Festival</span>` : ""}` +
      `${here ? ` <span class="legend-item"><span class="pin-mini you"></span>du</span>` : ""}</p>` +
      (rest.length
        ? `<section><h2 class="month">Ohne Standort</h2><div class="shows">${renderDays(rest)}</div></section>`
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

  // --- Sticky bar ---
  // Its height is frozen in CSS (--bar-h: 84 px on phones, 96 px from 768 px); nothing is measured here.
  const filters = el("filters");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  // Shadow and tricolor edge only once the bar is actually stuck.
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => filters.classList.toggle("stuck", !entry.isIntersecting)).observe(
      el("stuck-sentinel"),
    );
  }

  // Mini-brand in the stuck bar: back to the top, without touching the hash (deep links stay intact).
  filters.querySelector(".mini-brand").addEventListener("click", (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: reducedMotion.matches ? "auto" : "smooth" });
  });

  // Note pill: <details> that opens as a card; closing waits for the collapse transition.
  const note = el("note");
  const noteBody = note.querySelector(".note-body");
  function closeNote() {
    if (!note.open || note.dataset.closing) return;
    note.dataset.closing = "1";
    note.classList.remove("is-open");
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      delete note.dataset.closing;
      note.open = false;
    };
    if (reducedMotion.matches) return finish(); // 0 ms transitions fire no transitionend
    noteBody.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, 450); // safety net should the transition be interrupted
  }
  note.querySelector("summary").addEventListener("click", (e) => {
    if (!note.open) return; // opening: let the browser do it, then animate in (toggle event)
    e.preventDefault();
    closeNote();
  });
  note.addEventListener("toggle", () => {
    if (note.open) requestAnimationFrame(() => note.classList.add("is-open"));
  });
  document.addEventListener("click", (e) => {
    if (note.open && !note.contains(e.target)) closeNote();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeNote();
  });
  // The card floats above the list; once its row scrolls under the stuck bar it closes instead of
  // overlapping the bar.
  window.addEventListener(
    "scroll",
    () => {
      if (note.open && note.getBoundingClientRect().top < filters.getBoundingClientRect().bottom) closeNote();
    },
    { passive: true },
  );

  // After filtering, the list may get shorter than the current scroll position;
  // jump back to the start of the results so the user doesn't land in empty space.
  const resultsRow = resultsEl.closest(".results-row");
  const underBar = (elm) => elm.getBoundingClientRect().top + window.scrollY - filters.offsetHeight - 8;
  const viewsTop = () => underBar(views);
  function renderAndKeepInView(after) {
    nudgeQuietUntil = Date.now() + 3000; // mid-task: no sticker over the result
    filterTouched = true;
    // Filter change (§4): the swap runs inside a view transition where the browser has one (a --t-2
    // cross-fade; the rows then enter staggered); elsewhere #list dips in opacity over --t-2.
    const swap = () => {
      render();
      filterTouched = false;
    };
    // `after` runs once the new DOM is in (the transition's callback is asynchronous), e.g. a scroll
    // to a panel that only exists after the render.
    const settle = () => {
      keepInView();
      if (after) after();
    };
    if (document.startViewTransition && !reducedMotion.matches) {
      document.startViewTransition(swap).updateCallbackDone.then(settle, settle);
    } else {
      list.classList.remove("dip");
      void list.offsetWidth; // restart the dip
      list.classList.add("dip");
      swap();
      settle();
    }
  }
  function keepInView() {
    // No result: the «Nichts gefunden» box takes the list's place and must come into view the same
    // way – otherwise a search typed while scrolled leaves the visitor staring at the footer.
    // The start of the results is the results row: the count, the view switch and the filter pills
    // («Bern ✕») must be in view after a tap on a row's coat of arms, otherwise the filter cannot be
    // undone where it was made. In the list mode the row is folded away: the list actions start it.
    const target = views.hidden ? status : listMode() ? minePanel : resultsRow;
    if (views.hidden && !status.textContent.trim()) return;
    const top = () => underBar(target.hidden ? views : target);
    if (window.scrollY > top()) {
      quietScrollUntil = Date.now() + 1000;
      window.scrollTo({ top: top() });
      // The bar grows by a row once it sticks: check the target again a moment later.
      setTimeout(() => {
        if (window.scrollY > top()) window.scrollTo({ top: top() });
      }, 80);
    }
  }
  // Scroll down (never up) until the target (the views, or the Meine-Shows panel above them) starts right
  // under the bar. The bar grows by a row once it sticks, so the target is checked again a moment later.
  function scrollUnderBar(target) {
    if (views.hidden || window.scrollY >= underBar(target)) return;
    quietScrollUntil = Date.now() + 1500;
    window.scrollTo({ top: underBar(target) });
    setTimeout(() => {
      if (Math.abs(window.scrollY - underBar(target)) > 2) window.scrollTo({ top: underBar(target) });
    }, 80);
  }
  const scrollViewsUnderBar = () => scrollUnderBar(views);

  // Scroll arrows for the chip row: only shown when there is something hidden in that direction.
  const chipWrap = chipRow.parentElement;
  function updateChipArrows() {
    const canLeft = chipRow.scrollLeft > 2;
    const canRight = chipRow.scrollLeft + chipRow.clientWidth < chipRow.scrollWidth - 2;
    chipWrap.classList.toggle("can-left", canLeft);
    chipWrap.classList.toggle("can-right", canRight);
    chipWrap.querySelector(".scroll-btn.left").hidden = !canLeft;
    chipWrap.querySelector(".scroll-btn.right").hidden = !canRight;
  }
  chipRow.addEventListener("scroll", updateChipArrows, { passive: true });
  window.addEventListener("resize", updateChipArrows);
  chipWrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".scroll-btn");
    if (btn)
      chipRow.scrollBy({
        left: Number(btn.dataset.dir) * chipRow.clientWidth * 0.7,
      });
  });

  // Drag the chip row with the mouse (touch scrolls natively). A real drag suppresses the click.
  let drag = null;
  chipRow.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") return;
    drag = { x: e.clientX, left: chipRow.scrollLeft, moved: false };
    chipRow.style.scrollBehavior = "auto";
  });
  chipRow.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) drag.moved = true;
    chipRow.scrollLeft = drag.left - dx;
  });
  const endDrag = () => {
    if (!drag) return;
    chipRow.style.scrollBehavior = "";
    const moved = drag.moved;
    drag = null;
    if (moved)
      chipRow.addEventListener("click", (e) => e.stopPropagation(), {
        capture: true,
        once: true,
      });
  };
  chipRow.addEventListener("pointerup", endDrag);
  chipRow.addEventListener("pointerleave", endDrag);
  chipRow.addEventListener("pointercancel", endDrag);

  // Set the genre ("" = all), press its chip and keep that chip in view (the row scrolls smoothly unless
  // motion is reduced).
  function setGenre(g) {
    activeGenre = g;
    let btn = null;
    for (const c of genreBar.querySelectorAll(".chip")) {
      c.setAttribute("aria-pressed", String(c.dataset.genre === activeGenre));
      if (c.dataset.genre === activeGenre) btn = c;
    }
    if (!activeGenre) chipRow.scrollTo({ left: 0 });
    else if (btn) btn.scrollIntoView({ inline: "nearest", block: "nearest" });
  }
  genreBar.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip[data-genre]");
    if (!btn) return;
    setGenre(activeGenre === btn.dataset.genre ? "" : btn.dataset.genre);
    renderAndKeepInView();
  });
  // Format chips (Festival): a toggle of its own next to the genre, so «Dub» + «Festival» = dub festivals.
  function setFormat(f) {
    activeFormat = f;
    for (const c of formatBar.querySelectorAll(".chip[data-format]"))
      c.setAttribute("aria-pressed", String(c.dataset.format === activeFormat));
  }
  formatBar.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip[data-format]");
    if (!btn) return;
    setFormat(activeFormat === btn.dataset.format ? "" : btn.dataset.format);
    if (activeFormat) btn.scrollIntoView({ inline: "nearest", block: "nearest" });
    renderAndKeepInView();
  });

  // Line-up disclosure (§4: grid-template-rows 0fr → 1fr over --t-3). Opening: the browser opens the
  // <details>, the class animates the body in on the next frame. Closing: the click is intercepted, the body
  // animates out, then the <details> closes. Reduced motion: 0 ms transitions fire no transitionend, so it
  // closes at once. The open state is remembered per show (openIds) across re-renders.
  views.addEventListener(
    "toggle",
    (e) => {
      const d = e.target;
      if (!(d instanceof HTMLDetailsElement) || !d.classList.contains("lineup")) return;
      const row = d.closest(".show");
      if (!row) return;
      if (d.open) {
        openIds.add(row.dataset.id);
        requestAnimationFrame(() => d.classList.add("is-open"));
      } else openIds.delete(row.dataset.id);
    },
    true,
  );
  views.addEventListener("click", (e) => {
    const summary = e.target.closest("details.lineup > summary");
    if (!summary) return;
    const d = summary.parentElement;
    if (!d.open || d.dataset.closing) return;
    e.preventDefault();
    d.dataset.closing = "1";
    d.classList.remove("is-open");
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      delete d.dataset.closing;
      d.open = false;
    };
    if (reducedMotion.matches) return finish();
    d.querySelector(".lineup-body").addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, 450);
  });

  // Search: debounced 120 ms so typing does not re-render on every key.
  let searchTimer = 0;
  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderAndKeepInView, 120);
  });
  armCallout();
  init();
})();
