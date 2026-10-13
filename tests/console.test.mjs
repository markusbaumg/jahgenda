// The pure helpers behind the Mischpult (the owners' console): the watchdog mirror (src/lib/health.js),
// the dedupe of dropped candidates and the «Gehört rein» link (src/lib/drops.js), the Markdown renderer.
// The dedupe and the health verdict are checked against the Python originals (quality_review.py,
// check_freshness.py), so the console and the GitHub issues never disagree. Run: make test.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { assessHealth, parseTs } from "../src/lib/health.js";
import { dropKey, dedupeDrops, issueUrl } from "../src/lib/drops.js";
import { markdown } from "../src/lib/markdown.js";

const require = createRequire(import.meta.url);
const ROOT = new URL("..", import.meta.url).pathname;
const runs = require("../data/runs.json").runs;

const NOW = Date.parse("2026-10-13T12:00:00Z");
const ago = (h) => new Date(NOW - h * 3600e3).toISOString();
const shows = (n = 3, extra = {}) => ({
  updated: ago(1),
  source: "scraper",
  shows: Array(n).fill({}),
  ...extra,
});

test("parseTs: offsets, Z and naive timestamps (naive = UTC, like check_freshness.parse_ts)", () => {
  assert.equal(parseTs("2026-10-13T06:12:00+02:00"), Date.parse("2026-10-13T04:12:00Z"));
  assert.equal(parseTs("2026-10-13T04:12:00"), Date.parse("2026-10-13T04:12:00Z"));
  assert.equal(parseTs("2026-10-13T04:12:00Z"), Date.parse("2026-10-13T04:12:00Z"));
  assert.equal(parseTs("nonsense"), null);
  assert.equal(parseTs(""), null);
  assert.equal(parseTs(undefined), null);
});

test("assessHealth: fresh and ok is healthy", () => {
  const h = assessHealth(
    { status: { ok: true, at: ago(2) }, runs: { runs: [{ at: ago(2) }] }, shows: shows() },
    NOW,
  );
  assert.equal(h.healthy, true);
  assert.deepEqual(h.problems, []);
  assert.equal(h.newestFrom, "shows.json");
  assert.ok(Math.abs(h.ageH - 1) < 1e-9);
});

test("assessHealth: older than 36 h is stale (the newest of the three stamps counts)", () => {
  const files = {
    status: { ok: true, at: ago(40) },
    runs: { runs: [{ at: ago(37) }] },
    shows: shows(3, { updated: ago(50) }),
  };
  const h = assessHealth(files, NOW);
  assert.equal(h.healthy, false);
  assert.equal(h.stale, true);
  assert.equal(h.newestFrom, "runs.json");
  assert.match(h.problems[0], /^Daten veraltet: 37\.0 h/);
  assert.equal(assessHealth({ ...files, runs: { runs: [{ at: ago(35) }] } }, NOW).healthy, true);
});

test("assessHealth: ok:false, zero shows, future stamps and no stamps are red; mock data with zero shows is not", () => {
  const fail = assessHealth({ status: { ok: false, at: ago(1), error: "ENOTFOUND" }, shows: shows() }, NOW);
  assert.equal(fail.healthy, false);
  assert.equal(fail.stale, false);
  assert.match(fail.problems.join(), /ENOTFOUND/);
  assert.equal(assessHealth({ shows: shows(0) }, NOW).healthy, false);
  assert.equal(assessHealth({ shows: shows(0, { source: "mock" }) }, NOW).healthy, true);
  assert.equal(
    assessHealth({ shows: shows(1, { updated: new Date(NOW + 3 * 3600e3).toISOString() }) }, NOW).healthy,
    false,
  );
  assert.equal(assessHealth({}, NOW).healthy, false);
});

test("assessHealth agrees with scripts/check_freshness.py on the real data", () => {
  const py = execFileSync(
    "python3",
    [
      "-c",
      "import sys, json; from datetime import datetime, timezone, timedelta; sys.path.insert(0, 'scripts');" +
        "import check_freshness as c; ok, _ = c.assess(datetime.now(timezone.utc), timedelta(hours=36)); print(json.dumps(ok))",
    ],
    { cwd: ROOT, encoding: "utf8" },
  );
  const files = {
    status: require("../data/status.json"),
    runs: require("../data/runs.json"),
    shows: require("../data/shows.json"),
  };
  assert.equal(assessHealth(files, Date.now()).healthy, JSON.parse(py));
});

test("dropKey: structured and prose entries share a key; another day stays apart (quality_review cases)", () => {
  const a = { title: "Sean Koch – Europe 2026", date: "2026-10-18", venue: "Bierhübeli", city: "Bern" };
  const b = { title: "Sean Koch @ Bierhübeli Bern 18.10." };
  assert.equal(dropKey(a), dropKey(b));
  assert.equal(dropKey(a), "sean koch|18.10");
  assert.notEqual(
    dropKey({ title: "10 Years DMB Records: Skaboom", date: "2026-11-13" }),
    dropKey({ title: "10 Years DMB Records: Fluffy Machine @ Burgdorf 14.11." }),
  );
});

test("dropKey matches quality_review.drop_key on every dropped entry of data/runs.json", () => {
  const drops = runs.flatMap((r) => r.dropped || []);
  const py = execFileSync(
    "python3",
    [
      "-c",
      "import sys, json; sys.path.insert(0, 'scripts'); import quality_review as q;" +
        "print(json.dumps(['|'.join(q.drop_key(d)) for d in json.load(sys.stdin)]))",
    ],
    { cwd: ROOT, encoding: "utf8", input: JSON.stringify(drops) },
  );
  assert.deepEqual(drops.map(dropKey), JSON.parse(py));
});

test("dedupeDrops keeps the most complete entry, counts the runs, keeps first-seen order", () => {
  const prose = { title: "Dub Inc @ Bierhübeli Bern 18.03.2027", why: "abgesagt" };
  const full = {
    title: "Dub Inc",
    date: "2027-03-18",
    venue: "Bierhübeli",
    city: "Bern",
    url: "https://x",
    why: "Abgesagt",
  };
  const other = { title: "Santrofi", date: "2026-10-30", venue: "Kuppel", city: "Basel" };
  const out = dedupeDrops([
    { at: "2026-10-13T01:47:00Z", dropped: [full, other] },
    { at: "2026-10-13T00:38:00Z", dropped: [prose] },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].drop.venue, "Bierhübeli");
  assert.equal(out[0].count, 2);
  assert.equal(out[1].count, 1);
  assert.equal(out[1].drop.title, "Santrofi");
});

test("issueUrl: a prefilled quality issue on the repo", () => {
  const d = {
    title: "Dub Inc",
    date: "2027-03-18",
    venue: "Bierhübeli",
    city: "Bern",
    url: "https://x.ch/a",
    why: "abgesagt",
  };
  const u = new URL(issueUrl(d, "13.10.2026, 01:47"));
  assert.equal(u.origin + u.pathname, "https://github.com/markusbaumg/jahgenda/issues/new");
  assert.equal(u.searchParams.get("labels"), "quality,scraper");
  assert.equal(u.searchParams.get("title"), "Gehört rein: Dub Inc (2027-03-18)");
  const body = u.searchParams.get("body");
  assert.match(
    body,
    /^\*\*Kandidat:\*\* Dub Inc\n\*\*Datum:\*\* 2027-03-18\n\*\*Venue:\*\* Bierhübeli, Bern\n/,
  );
  assert.match(body, /\*\*Quelle:\*\* https:\/\/x\.ch\/a/);
  assert.match(body, /\*\*Lauf:\*\* 13\.10\.2026, 01:47/);
});

test("markdown: headings, lists, code, links – and nothing unescaped", () => {
  const html = markdown(
    "# Titel\n\n- **a** `b`\n- [c](https://x.ch)\n\n1. eins\n\n```\n<x>\n```\nText <script>\nweiter",
  );
  assert.match(html, /<h1>Titel<\/h1>/);
  assert.match(
    html,
    /<ul><li><strong>a<\/strong> <code>b<\/code><\/li><li><a href="https:\/\/x.ch" target="_blank" rel="noopener">c<\/a><\/li><\/ul>/,
  );
  assert.match(html, /<ol><li>eins<\/li><\/ol>/);
  assert.match(html, /<pre>&lt;x&gt;<\/pre>/);
  assert.match(html, /<p>Text &lt;script&gt; weiter<\/p>/);
  assert.doesNotMatch(markdown("[x](javascript:alert(1))"), /href/);
  assert.match(markdown("- last"), /^<ul><li>last<\/li><\/ul>$/);
});
