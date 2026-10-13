/* Festivals (design/festival-spec.md): a show with `end_date` is a range entry – one card with a range
 * date cell, a line-up by day and a ghost row in every later month it reaches into. The pure rules live
 * here (no DOM, no store), so the list, the calendar and the tests share them; tests/festival.test.mjs
 * pins them. Ported from app.js (renderDays, lineupHtml, the month groups, renderCalendar, emptyHeadline). */
import { venueKey, parseDay } from "./text.js";
import { addDays, monthStart } from "./dates.js";
import { t } from "../i18n/core.js";

// With more than 5 acts (festival or not) the acts line shows the first 4 and a <details class="lineup">
// holds the rest (§3.1).
export const LINEUP_PREVIEW = 4;
export const LINEUP_FROM = 6;

// Number of days of a range entry («3 Tage» leads the meta line, §3.7); 0 for a normal show.
export const dayCount = (s) => (s._end ? Math.round((s._end - s._day) / 864e5) + 1 : 0);

// Every calendar day a show is on: a festival is on the calendar grid on each of its days.
export function daysOf(s) {
  const out = [];
  for (let d = s._day; d <= (s._end || s._day); d = addDays(d, 1)) out.push(d);
  return out;
}

// The month starts after the start month that a festival still touches – one ghost row in each
// («↳ Reeds Festival läuft noch bis So 1. Aug.», §3.5). Empty for a normal show.
export function ghostMonths(s) {
  const out = [];
  if (!s._end) return out;
  for (let m = monthStart(addDays(monthStart(s._day), 32)); m <= s._end; m = monthStart(addDays(m, 32)))
    out.push(m);
  return out;
}

// The line-up by day: the valid, non-empty day keys in order and the acts that sit in no day («Tag
// offen»). Acts are compared like the validator's artist_key (venueKey is the same rule), so «DUB INC.»
// in days matches «Dub Inc» in acts.
export function lineupDays(s) {
  const days = s.days && typeof s.days === "object" ? s.days : {};
  const keys = Object.keys(days)
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && Array.isArray(days[k]) && days[k].length)
    .sort();
  const placed = new Set();
  for (const k of keys) for (const a of days[k]) placed.add(venueKey(String(a)));
  const rest = keys.length ? (s.acts || []).filter((a) => !placed.has(venueKey(a))) : [];
  return {
    days: keys.map((k) => ({ key: k, day: parseDay(k), acts: days[k].map(String) })),
    rest,
  };
}

// The summary of the line-up disclosure: «Alle 12 Acts nach Tag» with days, else «Alle 12 Acts».
export const lineupLabel = (s, byDay) =>
  t(byDay ? "lineup.allByDay" : "lineup.all", { n: (s.acts || []).length });

// The genre word of the empty-state headline with an active format: «Kein Festival», «Kein Dub-Festival».
export const formatWord = (genreWord, formatLabel) =>
  formatLabel
    ? genreWord
      ? t("empty.genreFormat", { genre: genreWord, format: formatLabel })
      : formatLabel
    : genreWord;
