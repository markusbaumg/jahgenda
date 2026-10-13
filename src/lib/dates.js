/* Calendar arithmetic and the de-CH formatters of the page. Local calendar days throughout. */
import { pad2 } from "./text.js";

export const monthFmt = new Intl.DateTimeFormat("de-CH", { month: "long", year: "numeric" });
export const monthNameFmt = new Intl.DateTimeFormat("de-CH", { month: "long" });
export const shortMonthFmt = new Intl.DateTimeFormat("de-CH", { month: "short" });
export const dowFmt = new Intl.DateTimeFormat("de-CH", { weekday: "short" });
export const fullDayFmt = new Intl.DateTimeFormat("de-CH", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
export const stampFmt = new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short" });

// «Fr» – the short weekday without its dot.
export const dow = (d) => dowFmt.format(d).replace(".", "");

export const todayStart = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const sameDay = (a, b) => a.getTime() === b.getTime();
export const monthStart = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
// Sortable month key «2026-10» (the list groups) – not the histogram's unpadded «2026-10».
export const monthKeyPadded = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

// The coming weekend is Fri–Sun of this week until Sunday is over (on a Saturday it is the current one).
// Only its DOWs go red, and the «Wochenende» rule is drawn once before its first day in the list.
export function weekendRange(today) {
  const dow = today.getDay(); // 0 = Sunday
  const fri = dow === 0 ? addDays(today, -2) : addDays(today, 5 - dow);
  return [fri, addDays(fri, 2)];
}

// Past and running (festival-spec.md §4): a range entry is past only after its last day, and «läuft»
// while today lies inside [date, end_date]. Computed at load and again when the tab comes back.
export function setTimeFlags(s, today) {
  s._past = (s._end || s._day) < today;
  s._now = Boolean(s._end) && s._day <= today && today <= s._end;
}

// «Fr 16.7.» for the empty-state hint and the Meine-Shows panel.
export const dayShort = (s) => `${dow(s._day)} ${s._day.getDate()}.${s._day.getMonth() + 1}.`;
// «So 1. Aug.» – the end of a festival in a ghost row, non-breaking (\u00a0), so it never wraps to «Aug.».
export const endLabel = (s) =>
  `${dow(s._end)}\u00a0${s._end.getDate()}.\u00a0${shortMonthFmt.format(s._end)}`;
