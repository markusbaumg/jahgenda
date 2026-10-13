/* Calendar arithmetic and the formatters of the page – in the locale of the page (de-CH / fr-CH / en-GB,
 * src/i18n/core.js; German by default and in the node tests). Local calendar days throughout. */
import { pad2 } from "./text.js";
import { localeFmt, getLocale } from "../i18n/core.js";

export const monthFmt = localeFmt({ month: "long", year: "numeric" });
export const monthNameFmt = localeFmt({ month: "long" });
export const shortMonthFmt = localeFmt({ month: "short" });
const dowFmt = localeFmt({ weekday: "short" });
export const fullDayFmt = localeFmt({
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
export const stampFmt = localeFmt({ dateStyle: "medium", timeStyle: "short" });
// «16.10.» (de-CH, fr-CH) / «16/10» (en-GB); with the year «16.7.2026».
const dayMonthFmt = localeFmt({ day: "numeric", month: "numeric" });
export const dayMonthYearFmt = localeFmt({ day: "numeric", month: "numeric", year: "numeric" });
export const dm = (d) => dayMonthFmt.format(d);

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
export const dayShort = (s) => `${dow(s._day)} ${dm(s._day)}`;
// «So 1. Aug.» – the end of a festival in a ghost row, non-breaking (\u00a0), so it never wraps to «Aug.».
export const endLabel = (s) =>
  getLocale() === "de"
    ? `${dow(s._end)}\u00a0${s._end.getDate()}.\u00a0${shortMonthFmt.format(s._end)}`
    : localeFmt({ weekday: "short", day: "numeric", month: "short" }).format(s._end).replace(/ /g, "\u00a0");
