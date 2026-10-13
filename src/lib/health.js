/* The scraper's health as the watchdog sees it – a mirror of assess() in scripts/check_freshness.py, so
 * the Mischpult turns red exactly when the watchdog opens its `scraper-failed` issue:
 *   - the newest sign of life of the daily scraper (status.json `at` while it holds a scrape-shows heartbeat,
 *     the newest scrape-shows run in runs.json, shows.json `updated`) is older than 36 h, or lies more than
 *     2 h in the future (clock or timezone bug) – a harvest-bands run or a hand correction (runner
 *     "manual") is no sign of life;
 *   - the newest scrape-shows verdict (status.json or that run's own runs.json entry) says ok: false;
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

/** A status.json or runs.json entry of a scrape-shows run (no `skill` = older entry, it was one); a hand
 * correction logged with runner "manual" is not a run of the scraper. Mirrors is_scrape(). */
function isScrape(entry) {
  return (
    !!entry &&
    typeof entry === "object" &&
    (entry.skill ?? "scrape-shows") === "scrape-shows" &&
    entry.runner !== "manual"
  );
}

/** The error of the newest scrape-shows verdict, null when it was ok (mirrors last_scrape_failure()):
 * status.json or the run's own entry, the newer wins, a tie goes to status.json. */
function lastScrapeFailure(status, run) {
  const cands = [status, run].filter(Boolean);
  if (!cands.length) return null;
  const at = (e) => parseTs(e.at) ?? 0;
  const newest = cands.reduce((a, b) => (at(b) > at(a) || (at(b) === at(a) && b === status) ? b : a));
  if (newest.ok !== false) return null;
  return newest.error || newest.message || "kein Grund angegeben";
}

/**
 * @param {{status?: any, runs?: any, shows?: any}} files the parsed JSON files (null when missing)
 * @param {number} now epoch ms
 * @returns {{healthy: boolean, problems: string[], newest: number|null, newestFrom: string,
 *   ageH: number|null, dataAt: number|null, dataAgeH: number|null, stale: boolean, failed: string|null}}
 */
export function assessHealth({ status, runs, shows } = {}, now = Date.now(), maxAgeH = MAX_AGE_H) {
  const problems = [];
  const stamps = [];
  const scrapeStatus = isScrape(status) ? status : null;
  const scrapeRuns = (runs && Array.isArray(runs.runs) ? runs.runs : [])
    .filter((r) => isScrape(r) && parseTs(r.at))
    .sort((a, b) => parseTs(b.at) - parseTs(a.at));
  if (scrapeStatus) stamps.push(["status.json", parseTs(scrapeStatus.at)]);
  if (runs && Array.isArray(runs.runs))
    stamps.push(["runs.json", scrapeRuns.length ? parseTs(scrapeRuns[0].at) : null]);
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

  const failed = lastScrapeFailure(scrapeStatus, scrapeRuns[0]);
  if (failed !== null) problems.push(`Der letzte Lauf meldet einen Fehler: ${failed}`);

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
    failed,
  };
}
