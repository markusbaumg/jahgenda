/* Wording and formats the Mischpult sections share (German, de-CH). */
import { stampFmt } from "../lib/dates.js";
import { parseTs } from "../lib/health.js";

/** «13.10.2026, 06:12» – or the raw value when it is no timestamp. */
export const stamp = (iso) => {
  const t = parseTs(iso);
  return t ? stampFmt.format(new Date(t)) : String(iso ?? "");
};

/** «vor 12 Min.», «vor 5,3 h», «vor 3 Tagen» (hours as a number). */
export const ago = (h) => {
  if (h == null) return "";
  if (h < 0) return "in der Zukunft";
  if (h < 1) return `vor ${Math.max(1, Math.round(h * 60))} Min.`;
  if (h < 48) return `vor ${h.toFixed(1).replace(".", ",")} h`;
  return `vor ${Math.round(h / 24)} Tagen`;
};

const dayFmt = new Intl.DateTimeFormat("de-CH", {
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
});
/** «Sa., 18. Oktober 2026» for a YYYY-MM-DD; anything else stays as it is. */
export const day = (d) =>
  /^\d{4}-\d{2}-\d{2}$/.test(d || "") ? dayFmt.format(new Date(`${d}T12:00:00`)) : d || "";

export const RUNNER = {
  cloud: "Cloud-Routine",
  launchd: "Mac (launchd)",
  local: "Mac (lokal)",
  manual: "Handkorrektur",
};
export const SKILL = {
  "scrape-shows": "Konzerte aktualisiert",
  "harvest-bands": "Bands aus Festivals gesammelt",
};
// Per-source status of a run (runs.json → sources[].status).
export const SOURCE_STATUS = {
  ok: "geladen",
  empty: "nichts gefunden",
  failed: "nicht erreichbar",
  skipped: "übersprungen",
};

/** «1 Lauf» / «3 Läufe» and the like. */
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** A URL without scheme, www and trailing slash, for link texts. */
export const bare = (u) =>
  String(u || "")
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/\/$/, "");
