<script>
  /* Status: the heartbeat (data/status.json), the watchdog's verdict mirrored (src/lib/health.js – red when
   * the data is older than 36 h or the last run reported ok: false), the data stamp and the links to the
   * routine and the watchdog issues. */
  import { assessHealth, MAX_AGE_H } from "../../lib/health.js";
  import { stamp, ago, RUNNER, SKILL, plural } from "../format.js";

  let { files } = $props();
  const { status, runs, shows, venues, artists } = files;

  const health = assessHealth({ status, runs, shows }, Date.now());
  const counts = status && typeof status.counts === "object" && status.counts ? status.counts : {};
  const failed = Array.isArray(status?.failed_sources)
    ? status.failed_sources.length
    : Number(status?.failed_sources) || 0;
  const venueList = venues && venues.venues ? Object.values(venues.venues) : null;
  const n = (v) => (typeof v === "number" ? v : "–");

  const ISSUES = "https://github.com/markusbaumg/jahgenda/issues";
</script>

<h2 class="section-title">Status</h2>

<div class="mp-verdict {health.healthy ? 'is-ok' : 'is-bad'}" data-healthy={health.healthy}>
  <p class="mp-verdict-head">
    {health.healthy ? "Alles im grünen Bereich" : "Achtung: der Watchdog schlägt Alarm"}
  </p>
  {#if health.newest}
    <p>
      Letztes Lebenszeichen: <strong>{stamp(new Date(health.newest).toISOString())}</strong>
      ({ago(health.ageH)}, aus {health.newestFrom}) · Limit {MAX_AGE_H} h
    </p>
  {/if}
  {#if health.problems.length}
    <ul>
      {#each health.problems as p (p)}<li>{p}</li>{/each}
    </ul>
  {/if}
  {#if !health.stale && health.failed !== null && health.dataAgeH != null}
    <p class="mp-muted">
      Die Agenda selbst ist {health.dataAgeH <= MAX_AGE_H ? "noch frisch" : "auch veraltet"}
      (Datenstand {ago(health.dataAgeH)}).
    </p>
  {/if}
</div>

<dl class="mp-kv">
  <div>
    <dt>Letzter Lauf</dt>
    <dd>
      {#if status}
        <span class={status.ok === false ? "bad" : "ok"}>{status.ok === false ? "Fehler" : "ok"}</span>
        · {stamp(status.at)}
      {:else}
        kein status.json
      {/if}
    </dd>
  </div>
  <div>
    <dt>Wer lief</dt>
    <dd>
      {status ? RUNNER[status.runner] || status.runner || "–" : "–"}
      {#if status?.skill}<small>· {SKILL[status.skill] || status.skill}</small>{/if}
    </dd>
  </div>
  <div>
    <dt>Zählung</dt>
    <dd class="num">
      +{counts.added ?? 0} · ~{counts.updated ?? 0} · −{counts.removed ?? 0} · {n(counts.total)} total
    </dd>
  </div>
  <div>
    <dt>Nicht erreichbar</dt>
    <dd class={failed ? "bad" : ""}>{plural(failed, "Quelle", "Quellen")}</dd>
  </div>
  {#if status?.error}
    <div class="mp-kv-wide">
      <dt>Fehler</dt>
      <dd class="bad">{status.error}</dd>
    </div>
  {/if}
  <div>
    <dt>Datenstand</dt>
    <dd>
      {shows ? stamp(shows.updated) : "–"}
      {#if shows?.source === "mock"}<small class="bad">· Beispieldaten</small>{/if}
    </dd>
  </div>
  <div>
    <dt>Shows live</dt>
    <dd class="num">{shows && Array.isArray(shows.shows) ? shows.shows.length : "–"}</dd>
  </div>
  <div>
    <dt>Venues</dt>
    <dd class="num">
      {venueList ? venueList.length : "–"}
      {#if venueList}<small>· {venueList.filter((v) => v && v.scrape).length} gescrapt</small>{/if}
    </dd>
  </div>
  <div>
    <dt>Artists im Cache</dt>
    <dd class="num">{artists && artists.artists ? Object.keys(artists.artists).length : "–"}</dd>
  </div>
  <div>
    <dt>Läufe im Log</dt>
    <dd class="num">{runs && Array.isArray(runs.runs) ? runs.runs.length : "–"}</dd>
  </div>
</dl>

<h3 class="mp-h3">Links</h3>
<ul class="mp-links">
  <li>
    <a href="https://claude.ai/code/routines" target="_blank" rel="noopener">Routinen auf claude.ai</a>
    – «Jahgenda – Shows (täglich)» und «Jahgenda – Bands (monatlich)», mit dem Log jedes Laufs
  </li>
  <li>
    <a href="{ISSUES}?q=is%3Aissue+label%3Ascraper-failed" target="_blank" rel="noopener"
      >Watchdog-Issues (Label scraper-failed)</a
    >
  </li>
  <li>
    <a href="https://github.com/markusbaumg/jahgenda/actions" target="_blank" rel="noopener"
      >GitHub Actions – Deploy, CI, Watchdog, Quality review</a
    >
  </li>
  <li>
    <a href="{ISSUES}?q=label%3Aquality" target="_blank" rel="noopener">Qualitäts-Issues (Label quality)</a>
  </li>
  <li>
    <a href="https://github.com/users/markusbaumg/projects/2" target="_blank" rel="noopener">Projekt-Board</a>
  </li>
</ul>
