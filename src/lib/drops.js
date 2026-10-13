/* The dropped candidates of the scraper runs (data/runs.json → `dropped`), for the «Aussortiert» tab of
 * the Mischpult. The dedupe mirrors drop_key() / dedupe() in scripts/quality_review.py, so the console and
 * the weekly quality issue count the same candidates: one key per candidate = the first three words of the
 * title (before « @ », « – », « - », a bracket or a colon) plus the day (the `date` field, or a «DD.MM.»
 * the prompt wrote into the title). Pure – tests/console.test.mjs. */

const DATE_IN_TITLE = /\b(\d{1,2})\.(\d{1,2})\.(?:(\d{4}))?/;
const pad2 = (s) => String(s).padStart(2, "0");

/** «words|day» – the tuple of quality_review.drop_key, joined with «|». */
export function dropKey(d) {
  const raw = String((d && d.title) || "");
  const title = raw.split(/ @ | – | - |\(|:/)[0];
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9äöüéèàç ]/g, " ")
    .split(" ")
    .filter(Boolean)
    .slice(0, 3);
  let day = (d && d.date) || "";
  if (!day) {
    const m = DATE_IN_TITLE.exec(raw);
    if (m) day = `${pad2(m[1])}.${pad2(m[2])}`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(String(day))) {
    day = `${day.slice(8, 10)}.${day.slice(5, 7)}`;
  }
  return `${words.join(" ")}|${day}`;
}

const completeness = (d) => ["date", "venue", "city", "url"].filter((f) => d[f]).length;

/**
 * Every dropped candidate of `runs` (newest run first, as runs.json keeps them), one entry per key: the
 * most complete one (date + venue + city + url), on a tie the newest. `count` = in how many runs it was
 * dropped. Entries come in the order of their first appearance.
 * @returns {{at: number, run: object, drop: object, count: number}[]}
 */
export function dedupeDrops(runs, parseAt = (r) => Date.parse(r.at) || 0) {
  const best = new Map();
  for (const run of runs || []) {
    if (!run || typeof run !== "object") continue;
    const at = parseAt(run);
    for (const drop of run.dropped || []) {
      if (!drop || typeof drop !== "object") continue;
      const k = dropKey(drop);
      const s = completeness(drop);
      const b = best.get(k);
      if (!b) best.set(k, { at, run, drop, score: s, count: 1 });
      else {
        b.count += 1;
        if (s > b.score || (s === b.score && at > b.at)) Object.assign(b, { at, run, drop, score: s });
      }
    }
  }
  return [...best.values()].map(({ at, run, drop, count }) => ({ at, run, drop, count }));
}

const REPO_URL = "https://github.com/markusbaumg/jahgenda";

/** «Gehört rein»: a new GitHub issue (labels quality + scraper) with the candidate prefilled. */
export function issueUrl(d, when) {
  const title = `Gehört rein: ${d.title}${d.date ? ` (${d.date})` : ""}`;
  const body = [
    `**Kandidat:** ${d.title}`,
    d.date ? `**Datum:** ${d.date}` : "",
    d.venue ? `**Venue:** ${d.venue}${d.city ? `, ${d.city}` : ""}` : "",
    d.url ? `**Quelle:** ${d.url}` : "",
    `**Scraper-Begründung:** ${d.why}`,
    `**Lauf:** ${when}`,
    "",
    "Warum er rein gehört:",
    "",
    "- …",
  ]
    .filter(Boolean)
    .join("\n");
  return `${REPO_URL}/issues/new?labels=quality,scraper&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
