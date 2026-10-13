// Pins the public URL/file contract of lib.js: short hashes in share links, .ics export and the
// Google Calendar link. Run: make test (node --test tests/).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const lib = require("../lib.js");
const shows = require("../data/shows.json").shows;

const PAGE = "https://markusbaumg.github.io/jahgenda/#1tsjh1k";
const NOW = new Date("2026-10-13T06:00:00Z");
const show = (over = {}) => ({
  id: "2026-10-16-dub-collective-bern",
  date: "2026-10-16",
  time: "20:30",
  title: "Dub Collective",
  venue: "Dachstock",
  city: "Bern",
  url: "",
  ...over,
});

test("shortId: pinned values (every shared link depends on them) and uniqueness over the data", () => {
  const pinned = {
    "2026-10-16-dub-collective-bern": "1tsjh1k",
    "2026-10-13-the-slackers-geneve": "1llepoq",
    "2026-10-14-soul-explicit-annecy": "vpg0p9",
    "2026-10-15-brushy-one-string-thun": "8457sz",
    "2026-10-16-rude-rebel-ska-fest-luzern": "189g2nh",
    "2026-10-16-boom-ah-yeah-luzern": "yy7wmy",
    "2026-10-16-scorchers-bern": "8hvjmi",
  };
  for (const [id, short] of Object.entries(pinned)) assert.equal(lib.shortId(id), short, id);
  const all = shows.map((s) => lib.shortId(s.id));
  assert.equal(new Set(all).size, shows.length, "short ids collide");
  for (const short of all) assert.match(short, /^[0-9a-z]{1,7}$/);
});

test("venueKey, safeUrl, escape, distanceKm", () => {
  assert.equal(lib.venueKey("Dachstock (Reitschule)"), "dachstockreitschule");
  assert.equal(lib.venueKey("Schüür"), "schr");
  assert.equal(lib.safeUrl("https://x.ch/a"), "https://x.ch/a");
  assert.equal(lib.safeUrl("javascript:alert(1)"), "");
  assert.equal(lib.safeUrl(undefined), "");
  assert.equal(
    lib.escape(`<a href="x">Tom & Jerry's</a>`),
    "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;",
  );
  assert.equal(lib.escape(null), "");
  const km = lib.distanceKm({ lat: 46.948, lon: 7.447 }, { lat: 47.377, lon: 8.541 });
  assert.ok(Math.abs(km - 95) < 1, `Bern-Zürich ${km} km`);
  assert.equal(lib.distanceKm({ lat: 46.948, lon: 7.447 }, { lat: 46.948, lon: 7.447 }), 0);
});

test("icsFor: one timed show, CRLF, Zurich time with TZID and VTIMEZONE, three hours long", () => {
  const ics = lib.icsFor(show(), { url: PAGE, now: NOW });
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!/[^\r]\n/.test(ics), "every line break is CRLF");
  const lines = ics.split("\r\n");
  assert.deepEqual(lines.slice(0, 4), [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Jahgenda//DE",
    "X-WR-TIMEZONE:Europe/Zurich",
  ]);
  assert.ok(lines.includes("BEGIN:VTIMEZONE") && lines.includes("TZID:Europe/Zurich"), "VTIMEZONE block");
  assert.ok(lines.includes("RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU"), "EU summer-time rule");
  assert.ok(lines.indexOf("END:VTIMEZONE") < lines.indexOf("BEGIN:VEVENT"), "VTIMEZONE precedes the events");
  assert.ok(lines.includes("UID:2026-10-16-dub-collective-bern@jahgenda"));
  assert.ok(lines.includes("DTSTAMP:20261013T060000Z"), "DTSTAMP comes from the injected clock");
  assert.ok(lines.includes("DTSTART;TZID=Europe/Zurich:20261016T203000"));
  assert.ok(lines.includes("DTEND;TZID=Europe/Zurich:20261016T233000"));
  assert.ok(lines.includes("SUMMARY:Dub Collective"));
  assert.ok(lines.includes("LOCATION:Dachstock\\, Bern"));
  assert.ok(lines.includes(`DESCRIPTION:${PAGE}`), "no leading blank line when the show has no url");
  assert.ok(lines.includes(`URL:${PAGE}`));
  assert.ok(!lines.some((l) => l.startsWith("STATUS:")));
});

test("icsFor: late show ends the next day, all-day show has no DTEND, status is passed through", () => {
  const late = lib.icsFor(show({ time: "23:00" }), { url: PAGE, now: NOW });
  assert.ok(
    late.includes("DTSTART;TZID=Europe/Zurich:20261016T230000\r\nDTEND;TZID=Europe/Zurich:20261017T020000"),
  );
  const allDay = lib.icsFor(show({ time: "" }), { url: PAGE, now: NOW });
  assert.ok(allDay.includes("DTSTART;VALUE=DATE:20261016"));
  assert.ok(!allDay.includes("DTEND"));
  const going = lib.icsFor(show(), { url: PAGE, now: NOW, status: "CONFIRMED" });
  assert.ok(going.includes("\r\nSTATUS:CONFIRMED\r\n"));
});

test("icsFor: RFC 5545 escaping of ; , \\ and newlines; a bare CR never survives", () => {
  const ics = lib.icsFor(show({ title: "A\r\nB; C, D\\E", url: "https://x.ch/e?a=1,2" }), {
    url: PAGE,
    now: NOW,
  });
  assert.ok(ics.includes("SUMMARY:A\\nB\\; C\\, D\\\\E"));
  assert.ok(ics.includes(`DESCRIPTION:https://x.ch/e?a=1\\,2\\n${PAGE}`));
  assert.ok(!/\r(?!\n)/.test(ics), "no lone CR anywhere");
});

test("icsWrap + vevent: a list export with one VEVENT per show", () => {
  const events = [show(), show({ id: "2026-10-17-x-bern", date: "2026-10-17", time: "" })].flatMap((s) =>
    lib.vevent(s, { url: PAGE, now: NOW, status: "TENTATIVE" }),
  );
  const ics = lib.icsWrap(events);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.equal((ics.match(/STATUS:TENTATIVE/g) || []).length, 2);
});

test("gcalUrl: timed and all-day dates, Zurich timezone, trimmed details, encoded text", () => {
  const u = new URL(lib.gcalUrl(show({ title: "Dub & Ska Night" }), { url: PAGE }));
  assert.equal(u.origin + u.pathname, "https://calendar.google.com/calendar/render");
  assert.equal(u.searchParams.get("action"), "TEMPLATE");
  assert.equal(u.searchParams.get("dates"), "20261016T203000/20261016T233000");
  assert.equal(u.searchParams.get("ctz"), "Europe/Zurich");
  assert.equal(u.searchParams.get("text"), "Dub & Ska Night");
  assert.ok(u.search.includes("text=Dub+%26+Ska+Night"), "text is URL-encoded");
  assert.equal(u.searchParams.get("location"), "Dachstock, Bern");
  assert.equal(u.searchParams.get("details"), PAGE, "details are trimmed when the show has no url");
  const allDay = new URL(lib.gcalUrl(show({ time: "" }), { url: PAGE }));
  assert.equal(allDay.searchParams.get("dates"), "20261016/20261017");
  const withUrl = new URL(lib.gcalUrl(show({ url: "https://x.ch/e" }), { url: PAGE }));
  assert.equal(withUrl.searchParams.get("details"), `https://x.ch/e\n${PAGE}`);
  const unsafe = new URL(lib.gcalUrl(show({ url: "javascript:alert(1)" }), { url: PAGE }));
  assert.equal(unsafe.searchParams.get("details"), PAGE, "non-http urls are dropped");
});

test("sbbUrl: arrival one hour before the show, 20:00 default, encoded towns, empty without origin or in town", () => {
  assert.equal(
    lib.sbbUrl(show(), "Sursee"),
    "https://www.sbb.ch/de?von=Sursee&nach=Bern&date=2026-10-16&time=19%3A30&moment=ARRIVAL",
  );
  assert.equal(lib.sbbUrl(show({ time: "" }), "Zürich").split("&time=")[1], "19%3A00&moment=ARRIVAL");
  assert.equal(lib.sbbUrl(show({ time: "00:30" }), "Zürich").split("&time=")[1], "23%3A30&moment=ARRIVAL");
  assert.ok(lib.sbbUrl(show({ city: "Genève" }), "Zürich").includes("von=Z%C3%BCrich&nach=Gen%C3%A8ve"));
  assert.equal(lib.sbbUrl(show(), "Zürich", { lead: 90 }).split("&time=")[1], "19%3A00&moment=ARRIVAL");
  assert.equal(lib.sbbUrl(show(), ""), "");
  assert.equal(lib.sbbUrl(show(), "Bern"), "");
});
