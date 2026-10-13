// Pins the festival rules of src/lib/festival.js (design/festival-spec.md): day count, calendar days,
// ghost months, the line-up by day with «Tag offen», the disclosure label and the empty-state word.
// Run: make test (node --test tests/).
import test from "node:test";
import assert from "node:assert/strict";
import { parseDay } from "../src/lib/text.js";
import { endLabel } from "../src/lib/dates.js";
import {
  LINEUP_FROM,
  LINEUP_PREVIEW,
  dayCount,
  daysOf,
  ghostMonths,
  lineupDays,
  lineupLabel,
  formatWord,
} from "../src/lib/festival.js";

const fest = (date, end, over = {}) => ({
  date,
  end_date: end,
  _day: parseDay(date),
  _end: end ? parseDay(end) : null,
  acts: [],
  ...over,
});
const ymd = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

test("thresholds: 6+ acts fold into the line-up, 4 stay in the acts line", () => {
  assert.equal(LINEUP_FROM, 6);
  assert.equal(LINEUP_PREVIEW, 4);
});

test("dayCount: inclusive range, 0 for a normal show, DST-safe", () => {
  assert.equal(dayCount(fest("2027-07-16", "2027-07-18")), 3);
  assert.equal(dayCount(fest("2026-10-24", "2026-10-26")), 3); // over the end of summer time
  assert.equal(dayCount(fest("2027-07-16", null)), 0);
});

test("daysOf: every day of the range (the calendar grid), one day for a show", () => {
  assert.deepEqual(daysOf(fest("2027-07-30", "2027-08-01")).map(ymd), ["2027-7-30", "2027-7-31", "2027-8-1"]);
  assert.deepEqual(daysOf(fest("2027-07-16", null)).map(ymd), ["2027-7-16"]);
});

test("ghostMonths: each later month the festival reaches into", () => {
  assert.deepEqual(ghostMonths(fest("2027-07-16", "2027-07-18")), []);
  assert.deepEqual(ghostMonths(fest("2027-07-30", "2027-08-01")).map(ymd), ["2027-8-1"]);
  assert.deepEqual(ghostMonths(fest("2027-12-31", "2028-01-02")).map(ymd), ["2028-1-1"]);
  assert.deepEqual(ghostMonths(fest("2027-07-16", null)), []);
});

test("lineupDays: sorted valid days, «Tag offen» compared by artist_key", () => {
  const s = fest("2027-07-16", "2027-07-18", {
    acts: ["Dub Inc", "Mellow Mood", "Iration", "Jah Prayzah"],
    days: { "2027-07-17": ["Mellow Mood"], "2027-07-16": ["DUB INC."], "2027-07-18": [], junk: ["x"] },
  });
  const r = lineupDays(s);
  assert.deepEqual(
    r.days.map((d) => [d.key, d.acts]),
    [
      ["2027-07-16", ["DUB INC."]],
      ["2027-07-17", ["Mellow Mood"]],
    ],
  );
  assert.equal(ymd(r.days[0].day), "2027-7-16");
  assert.deepEqual(r.rest, ["Iration", "Jah Prayzah"]);
  assert.deepEqual(lineupDays(fest("2027-07-16", "2027-07-18", { acts: ["A"] })), { days: [], rest: [] });
});

test("lineupLabel and formatWord: the German copy", () => {
  const s = { acts: Array(12).fill("x") };
  assert.equal(lineupLabel(s, true), "Alle 12 Acts nach Tag");
  assert.equal(lineupLabel(s, false), "Alle 12 Acts");
  assert.equal(formatWord("Dub", "Festival"), "Dub-Festival");
  assert.equal(formatWord("", "Festival"), "Festival");
  assert.equal(formatWord("Dub", ""), "Dub");
});

test("endLabel: «So 1. Aug.» with non-breaking spaces (the ghost row never wraps before the month)", () => {
  assert.match(endLabel(fest("2027-07-30", "2027-08-01")), /^So 1\. Aug\.?$/);
});
