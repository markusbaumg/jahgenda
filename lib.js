/* Jahgenda – the pure helpers behind the public URL and file contract: short hashes in share links,
 * .ics export and the Google Calendar link, plus the small text/geo helpers app.js uses everywhere.
 *
 * No DOM, no location, no clock inside: everything that varies is an explicit argument, so
 * tests/lib.test.mjs can pin the exact output (node --test, run by `make test`). In the browser it is
 * window.jahLib; in node (and later in Vite) it is a plain module. app.js still carries its own copies
 * of these functions until the UI revamp wires this file in (CLAUDE.md, story #33). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.jahLib = factory();
})(globalThis, function () {
  const SHOW_HOURS = 3; // shows have no end time in the data: a calendar entry lasts three hours

  const pad2 = (n) => String(n).padStart(2, "0");

  // Dates are local calendar days ("YYYY-MM-DD"); parse without timezone shifts.
  const parseDay = (s) => {
    const [y, m, d] = String(s).split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  const venueKey = (name) =>
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");

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

  // Straight-line distance in km (haversine).
  function distanceKm(a, b) {
    const rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }

  // Short, stable hash per show for links: FNV-1a over the id, base36 (6-7 chars), e.g. #k3f9zq.
  // Every shared link carries one of these, so the algorithm must never change.
  function shortId(id) {
    let h = 0x811c9dc5;
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36);
  }

  // ---- Calendar export ------------------------------------------------------------------------
  // Local-time stamp YYYYMMDDTHHMM00 (floating time: lands at the right hour in Switzerland).
  const localStamp = (x) =>
    `${x.getFullYear()}${pad2(x.getMonth() + 1)}${pad2(x.getDate())}T${pad2(x.getHours())}${pad2(x.getMinutes())}00`;

  // [start, end] of a timed show; the end is start + SHOW_HOURS wall-clock hours.
  const showSpan = (show) => {
    const day = parseDay(show.date);
    const [h, m] = show.time.split(":").map(Number);
    const [y, mo, d] = [day.getFullYear(), day.getMonth(), day.getDate()];
    return [new Date(y, mo, d, h, m), new Date(y, mo, d, h + SHOW_HOURS, m)];
  };

  // RFC 5545 text escaping; a bare CR would end the content line, so it is dropped.
  const icsEscape = (t) =>
    String(t)
      .replace(/\r/g, "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");

  const description = (show, url) => `${safeUrl(show.url) || ""}\n${url}`.trim();

  // One VEVENT (as lines) for a show. opts: { url: the show's page on Jahgenda, now: Date for
  // DTSTAMP, status: "CONFIRMED" | "TENTATIVE" | undefined }.
  function vevent(show, opts) {
    const { url = "", now = new Date(), status } = opts || {};
    let when;
    if (show.time) {
      const [start, end] = showSpan(show);
      when = `DTSTART:${localStamp(start)}\r\nDTEND:${localStamp(end)}`;
    } else {
      when = `DTSTART;VALUE=DATE:${show.date.replace(/-/g, "")}`;
    }
    return [
      "BEGIN:VEVENT",
      `UID:${show.id}@jahgenda`,
      `DTSTAMP:${now.toISOString().replace(/[-:]|\.\d+/g, "")}`,
      when,
      `SUMMARY:${icsEscape(show.title)}`,
      `LOCATION:${icsEscape(`${show.venue}, ${show.city}`)}`,
      `DESCRIPTION:${icsEscape(description(show, url))}`,
      `URL:${url}`,
      ...(status ? [`STATUS:${status}`] : []),
      "END:VEVENT",
    ];
  }

  const icsWrap = (events) =>
    ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Jahgenda//DE", ...events, "END:VCALENDAR", ""].join("\r\n");

  // The .ics file for one show; opts as for vevent.
  const icsFor = (show, opts) => icsWrap(vevent(show, opts));

  // "Add to Google Calendar" link (works in the Google Calendar app and on the web). opts: { url }.
  function gcalUrl(show, opts) {
    const { url = "" } = opts || {};
    let dates;
    if (show.time) {
      const [start, end] = showSpan(show);
      dates = `${localStamp(start)}/${localStamp(end)}`;
    } else {
      const day = parseDay(show.date);
      const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
      dates = `${show.date.replace(/-/g, "")}/${localStamp(next).slice(0, 8)}`;
    }
    const p = new URLSearchParams({
      action: "TEMPLATE",
      text: show.title,
      dates,
      ctz: "Europe/Zurich",
      location: `${show.venue}, ${show.city}`,
      details: description(show, url),
    });
    return `https://calendar.google.com/calendar/render?${p}`;
  }

  // SBB timetable link from the visitor's town to the show's town, arriving `lead` minutes before the
  // show (20:00 when the show has no time). Empty when there is no origin or it is the show's own town.
  function sbbUrl(show, from, opts) {
    const { lead = 60 } = opts || {};
    if (!from || !show.city || from === show.city) return "";
    const [h, m] = (show.time || "20:00").split(":").map(Number);
    const day = parseDay(show.date);
    const arrive = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m - lead);
    const time = `${pad2(arrive.getHours())}:${pad2(arrive.getMinutes())}`;
    const p = `von=${encodeURIComponent(from)}&nach=${encodeURIComponent(show.city)}&date=${show.date}&time=${encodeURIComponent(time)}&moment=ARRIVAL`;
    return `https://www.sbb.ch/de?${p}`;
  }

  // ---- Links --------------------------------------------------------------------------------
  // One parser for every hash the page writes or accepts: #<short hash or id> (a show), #m=<list> /
  // #mine=<list> (a shared list) and #view=<name> (the view switch); parts may be combined with "&" in
  // any order, e.g. #view=map&m=…. Returns { id, mine, view } with "" for what is absent; a bad escape in
  // the id never throws. `views` lists the view names that count.
  function parseHash(hash, views = ["list", "calendar", "map"]) {
    const out = { id: "", mine: "", view: "" };
    for (const part of String(hash || "")
      .replace(/^#/, "")
      .split("&")) {
      if (/^(mine|m)=/.test(part)) out.mine = part.replace(/^(mine|m)=/, "");
      else if (part.startsWith("view=")) {
        const v = part.slice(5);
        if (views.includes(v)) out.view = v;
      } else if (part && !out.id) {
        try {
          out.id = decodeURIComponent(part);
        } catch {
          out.id = part;
        }
      }
    }
    return out;
  }

  return {
    shortId,
    parseHash,
    venueKey,
    safeUrl,
    escape,
    distanceKm,
    parseDay,
    vevent,
    icsWrap,
    icsFor,
    gcalUrl,
    sbbUrl,
  };
});
