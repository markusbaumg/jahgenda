/* Calendar export (.ics, Google Calendar), the SBB timetable link, festival line-up text and the date
 * text of share messages. Everything that varies (the show's page URL, the clock) is an argument, so
 * tests/lib.test.mjs can pin the exact output. */
import { pad2, parseDay, venueKey, safeUrl } from "./text.js";
import { dow, dm as dayMonth, dayMonthYearFmt } from "./dates.js";
import { t, getLocale } from "../i18n/core.js";

const SHOW_HOURS = 3; // shows have no end time in the data: a calendar entry lasts three hours

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
// Zurich wall-clock stamp YYYYMMDDTHHMM00 (used with TZID, see vevent).
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

// ---- Festivals (design/festival-spec.md) ------------------------------------------------------
// A show with `end_date` is a range entry. Its line-up as text lines: one per day from `days`
// («Fr 16.7.: Dub Inc, Mellow Mood»), then the acts without a day («Tag offen: …»); without days the
// flat list. Empty without acts. Used by the calendar export (.ics, Google) and the share text.
// In the locale of the page (German in the tests): «Fr 16.7.», «Fri 16/7».
const dowShort = dow;
const dm = dayMonth;
export function lineupLines(show) {
  const acts = (show.acts || []).map(String);
  const days = show.days && typeof show.days === "object" ? show.days : {};
  const keys = Object.keys(days).sort();
  if (!acts.length && !keys.length) return [];
  if (!keys.length) return [acts.join(", ")];
  const placed = new Set();
  const out = [];
  for (const key of keys) {
    const list = (days[key] || []).map(String);
    const d = parseDay(key);
    out.push(`${dowShort(d)} ${dm(d)}: ${list.join(", ")}`);
    for (const a of list) placed.add(venueKey(a)); // the validator's artist_key rule
  }
  const rest = acts.filter((a) => !placed.has(venueKey(a)));
  if (rest.length) out.push(`${t("lineup.open")}: ${rest.join(", ")}`);
  return out;
}

// «Fr 16.7.2026» for a show, «Fr 16.7. – So 18.7.2027» for a range entry.
export function dateText(show) {
  const a = parseDay(show.date);
  if (!show.end_date) return `${dowShort(a)} ${dayMonthYearFmt.format(a)}`;
  const b = parseDay(show.end_date);
  return `${dowShort(a)} ${dm(a)} – ${dowShort(b)} ${dayMonthYearFmt.format(b)}`;
}

// The day after a calendar day as YYYYMMDD (exclusive DTEND of an all-day event).
const nextDayStamp = (s) => {
  const day = parseDay(s);
  return localStamp(new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)).slice(0, 8);
};

const description = (show, url) =>
  [...(show.end_date ? lineupLines(show) : []), safeUrl(show.url) || "", url].filter(Boolean).join("\n");

// One VEVENT (as lines) for a show. opts: { url: the show's page on Jahgenda, now: Date for
// DTSTAMP, status: "CONFIRMED" | "TENTATIVE" | undefined }.
export function vevent(show, opts) {
  const { url = "", now = new Date(), status } = opts || {};
  let when;
  if (show.end_date) {
    // A festival is one all-day event over the whole range; its door time is not a start time.
    when = `DTSTART;VALUE=DATE:${show.date.replace(/-/g, "")}\r\nDTEND;VALUE=DATE:${nextDayStamp(show.end_date)}`;
  } else if (show.time) {
    const [start, end] = showSpan(show);
    when = `DTSTART;TZID=${TZID}:${localStamp(start)}\r\nDTEND;TZID=${TZID}:${localStamp(end)}`;
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

export const icsWrap = (events) =>
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

// The .ics file for one show; opts as for vevent.
export const icsFor = (show, opts) => icsWrap(vevent(show, opts));

// "Add to Google Calendar" link (works in the Google Calendar app and on the web). opts: { url }.
export function gcalUrl(show, opts) {
  const { url = "" } = opts || {};
  let dates;
  if (show.end_date) {
    dates = `${show.date.replace(/-/g, "")}/${nextDayStamp(show.end_date)}`;
  } else if (show.time) {
    const [start, end] = showSpan(show);
    dates = `${localStamp(start)}/${localStamp(end)}`;
  } else {
    dates = `${show.date.replace(/-/g, "")}/${nextDayStamp(show.date)}`;
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
export function sbbUrl(show, from, opts) {
  const { lead = 60 } = opts || {};
  if (!from || !show.city || from === show.city) return "";
  const [h, m] = (show.time || "20:00").split(":").map(Number);
  const day = parseDay(show.date);
  const arrive = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m - lead);
  const time = `${pad2(arrive.getHours())}:${pad2(arrive.getMinutes())}`;
  const p = `von=${encodeURIComponent(from)}&nach=${encodeURIComponent(show.city)}&date=${show.date}&time=${encodeURIComponent(time)}&moment=ARRIVAL`;
  return `https://www.sbb.ch/${getLocale()}?${p}`;
}
