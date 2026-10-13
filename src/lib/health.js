/* The scraper's health as the watchdog sees it – a mirror of assess() in scripts/check_freshness.py, so
 * the Mischpult turns red exactly when the watchdog opens its `scraper-failed` issue:
 *   - the newest sign of life (status.json `at`, the newest run in runs.json, shows.json `updated`) is
 *     older than 36 h, or lies more than 2 h in the future (clock or timezone bug);
 *   - status.json says ok: false;
 *   - shows.json holds zero shows (unless it is the mock data);
 *   - there is no timestamp at all.
 * Pure: the files and the clock come in as arguments (tests/console.test.mjs). */

export const MAX_AGE_H = 36;
const H = 3600 * 1000;

/** ISO 8601 → epoch ms; a date-time without an offset counts as UTC (like parse_ts). Unparsable → null. */
export function parseTs(value) {
  if (typeof value !== "string" || !value) return null;
  const naive = /T\d/.test(value) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const t = Date.parse(naive ? `${value}Z` : value);
  return Number.isNaN(t) ? null : t;
}

const fmtH = (ms) => (ms / H).toFixed(1);

/**
 * @param {{status?: any, runs?: any, shows?: any}} files the parsed JSON files (null when missing)
 * @param {number} now epoch ms
 * @returns {{healthy: boolean, problems: string[], newest: number|null, newestFrom: string,
 *   ageH: number|null, dataAt: number|null, dataAgeH: number|null, stale: boolean}}
 */
export function assessHealth({ status, runs, shows } = {}, now = Date.now(), maxAgeH = MAX_AGE_H) {
  const problems = [];
  const stamps = [];
  if (status && typeof status === "object") stamps.push(["status.json", parseTs(status.at)]);
  if (runs && Array.isArray(runs.runs)) {
    const ats = runs.runs.map((r) => (r && typeof r === "object" ? parseTs(r.at) : null)).filter(Boolean);
    stamps.push(["runs.json", ats.length ? Math.max(...ats) : null]);
  }
  const dataAt = shows && typeof shows === "object" ? parseTs(shows.updated) : null;
  stamps.push(["shows.json", dataAt]);

  const known = stamps.filter(([, t]) => t);
  let newest = null;
  let newestFrom = "";
  let stale = false;
  if (!known.length) {
    problems.push("Kein Zeitstempel in status.json, runs.json oder shows.json gefunden.");
  } else {
    [newestFrom, newest] = known.reduce((a, b) => (b[1] > a[1] ? b : a));
    const age = now - newest;
    if (age > maxAgeH * H) {
      stale = true;
      problems.push(`Daten veraltet: ${fmtH(age)} h seit dem letzten Lauf, Limit ${maxAgeH} h.`);
    }
    if (newest > now + 2 * H)
      problems.push("Der letzte Zeitstempel liegt in der Zukunft – Uhr- oder Zeitzonenfehler im Scraper.");
  }

  if (status && typeof status === "object" && status.ok === false) {
    const reason = status.error || status.message || "kein Grund angegeben";
    problems.push(`Der letzte Lauf meldet einen Fehler: ${reason}`);
  }

  if (shows && typeof shows === "object") {
    const n = Array.isArray(shows.shows) ? shows.shows.length : 0;
    if (shows.source !== "mock" && n === 0) problems.push("shows.json enthält keine Shows.");
  }

  return {
    healthy: problems.length === 0,
    problems,
    newest,
    newestFrom,
    ageH: newest ? (now - newest) / H : null,
    dataAt,
    dataAgeH: dataAt ? (now - dataAt) / H : null,
    stale,
  };
}
