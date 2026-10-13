// The filter and list state in the URL hash (src/lib/state-hash.js), the pure half of the filter and
// marks stores: quick picks on a fixed clock, every filter dimension through hash and back, and the
// #m= list links a friend sends. Run: make test (node --test).
import test from "node:test";
import assert from "node:assert/strict";
import {
  quickRange,
  isStateHash,
  encodeFilters,
  decodeFilters,
  parseListHash,
  takeAllMarks,
  QUICK_KINDS,
  Q_MAX,
} from "../src/lib/state-hash.js";

const day = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const range = (kind, today) => quickRange(kind, day(today)).map(iso);

test("quickRange: Heute, Morgen and 7 Tage", () => {
  assert.deepEqual(range("today", "2026-10-13"), ["2026-10-13", "2026-10-13"]);
  assert.deepEqual(range("tomorrow", "2026-10-31"), ["2026-11-01", "2026-11-01"]); // over a month end
  assert.deepEqual(range("7", "2026-12-28"), ["2026-12-28", "2027-01-03"]); // over a year end
});

test("quickRange: Wochenende on every weekday is the coming (or running) Fri–Sun", () => {
  // Mon 2026-10-12 … Sun 2026-10-18: Monday to Thursday look ahead, Friday and Saturday start today,
  // Sunday is that Sunday alone.
  const want = {
    "2026-10-12": ["2026-10-16", "2026-10-18"], // Mo
    "2026-10-13": ["2026-10-16", "2026-10-18"], // Di
    "2026-10-14": ["2026-10-16", "2026-10-18"], // Mi
    "2026-10-15": ["2026-10-16", "2026-10-18"], // Do
    "2026-10-16": ["2026-10-16", "2026-10-18"], // Fr
    "2026-10-17": ["2026-10-17", "2026-10-18"], // Sa
    "2026-10-18": ["2026-10-18", "2026-10-18"], // So
  };
  for (const [today, expected] of Object.entries(want))
    assert.deepEqual(range("weekend", today), expected, today);
});

test("isStateHash: filter parts only, never a list or show link", () => {
  assert.equal(isStateHash("#q=dub&g=ska"), true);
  assert.equal(isStateHash("q=dub"), true);
  assert.equal(isStateHash("#wann=2026-10,2026-11&past=1"), true);
  assert.equal(isStateHash("#m=abc1234g"), false);
  assert.equal(isStateHash("#q=dub&m=abc1234g"), false);
  assert.equal(isStateHash("#mine=x:g"), false);
  assert.equal(isStateHash("#abc1234"), false); // a show link
  assert.equal(isStateHash(""), false);
});

const KNOWN = {
  genres: ["reggae", "ska", "dub"],
  formats: ["festival", "soundsystem"],
  isRegion: (c) => ["ZH", "BE", "LU", "D", "F"].includes(c),
  monthKeys: ["2026-10", "2026-11", "2026-12"],
};

test("encodeFilters → decodeFilters round trip, every dimension", () => {
  const state = {
    q: "  Dub Inc ",
    genre: "ska",
    format: "festival",
    cantons: new Set(["ZH", "D"]),
    radius: 25,
    here: true,
    months: ["2026-10", "2026-12"],
    quick: "weekend", // the months win
    past: true,
  };
  const hash = encodeFilters(state);
  assert.equal(hash, "q=Dub+Inc&g=ska&f=festival&wo=ZH,D&r=25&wann=2026-10,2026-12&past=1");
  assert.deepEqual(decodeFilters(`#${hash}`, KNOWN), {
    q: "Dub Inc",
    genre: "ska",
    format: "festival",
    cantons: ["ZH", "D"],
    radius: 25,
    quick: "",
    months: ["2026-10", "2026-12"],
    past: true,
  });
  for (const quick of QUICK_KINDS) {
    const h = encodeFilters({ quick });
    assert.equal(h, `wann=${quick}`);
    assert.equal(decodeFilters(h, KNOWN).quick, quick);
    assert.deepEqual(decodeFilters(h, KNOWN).months, []);
  }
  assert.equal(encodeFilters({}), "");
  assert.equal(encodeFilters({ q: "   " }), "");
  assert.equal(encodeFilters({ radius: 25 }), ""); // no position, no radius
  assert.equal(decodeFilters("#q=%26+%3D+%23", KNOWN).q, "& = #"); // escapes come back
});

test("decodeFilters drops what the page does not know and caps the search", () => {
  const h = decodeFilters(
    `#q=${"x".repeat(200)}&g=techno&f=rave&wo=ZH,XX,,be,F&r=30&wann=2025-01,2026-11,nonsense`,
    KNOWN,
  );
  assert.equal(h.q.length, Q_MAX);
  assert.equal(h.genre, "");
  assert.equal(h.format, "");
  assert.deepEqual(h.cantons, ["ZH", "F"]); // codes are case-sensitive, unknown ones go
  assert.equal(h.radius, null);
  assert.deepEqual(h.months, ["2026-11"]);
  assert.equal(h.past, false);
  assert.equal(decodeFilters("#past=yes", KNOWN).past, false);
  assert.equal(decodeFilters("#m=abc1234g", KNOWN), null);
  assert.equal(decodeFilters("#abc1234", KNOWN), null);
});

const SHOWS = {
  abc1234: { id: "2026-10-16-a" },
  def5678: { id: "2026-10-17-b" },
  "2026-11-01-c": { id: "2026-11-01-c" },
};
const find = (t) => SHOWS[t];

test("parseListHash: <short><g|i> tokens, the von: name, gone shows counted", () => {
  assert.deepEqual(parseListHash("abc1234g,def5678i,zzzzzzzi,von:Seraina%20%F0%9F%8E%B6", find), {
    map: { "2026-10-16-a": "going", "2026-10-17-b": "interested" },
    by: "Seraina 🎶",
    missing: 1,
  });
});

test("parseListHash: the old id:state form, odd suffixes, bad escapes and empty parts", () => {
  const r = parseListHash("2026-11-01-c:g,abc1234x,,def5678,%E0%A4%A", find);
  // «abc1234x»: an unknown state letter means interested; «def5678» without a letter is token «def567»
  // (the last character is always the state), so it no longer matches; «%E0%A4%A» must not throw.
  assert.deepEqual(r.map, { "2026-11-01-c": "going", "2026-10-16-a": "interested" });
  assert.equal(r.missing, 2);
  assert.equal(r.by, "");
  assert.equal(parseListHash(`von:${"n".repeat(60)}`, find).by.length, 40); // the name is capped
  assert.deepEqual(parseListHash("", find), { map: {}, by: "", missing: 0 });
});

test("takeAllMarks never overwrites or downgrades an own mark, nor copies the friend's «going»", () => {
  const own = { a: "going", b: "interested" };
  const friend = { a: "interested", b: "going", c: "going" };
  assert.deepEqual(takeAllMarks(own, friend), { a: "going", b: "interested", c: "interested" });
  assert.deepEqual(own, { a: "going", b: "interested" }); // a new object, the old one untouched
  assert.deepEqual(takeAllMarks(own, null), own);
});
