<script>
  /* Aussortiert: the candidates the scraper looked at and dropped, with date / venue / city / source link /
   * reason and the «Gehört rein» button (a prefilled GitHub issue, labels quality + scraper). Several runs
   * often drop the same candidate: by default it is listed once – the same dedupe as the weekly quality
   * issue (src/lib/drops.js ↔ scripts/quality_review.py) – under the run of its most complete entry.
   * «Jeden Lauf einzeln» shows every run's list as it is. What review.html showed. */
  import { parseTs } from "../../lib/health.js";
  import { dedupeDrops, issueUrl } from "../../lib/drops.js";
  import { safeUrl } from "../../lib/text.js";
  import { stamp, day, plural } from "../format.js";

  let { files } = $props();
  const runs = (files.runs && Array.isArray(files.runs.runs) ? files.runs.runs : []).filter(
    (r) => r && typeof r === "object",
  );
  const at = (r) => parseTs(r.at) || 0;
  const withDrops = runs.filter((r) => Array.isArray(r.dropped) && r.dropped.length);
  const total = withDrops.reduce((n, r) => n + r.dropped.length, 0);
  const unique = dedupeDrops(runs, at);

  // Groups for the view: [{ run, items: [{ drop, count }] }], newest run first.
  const byRun = (entries) => {
    const groups = new Map();
    for (const e of entries) {
      if (!groups.has(e.run)) groups.set(e.run, []);
      groups.get(e.run).push(e);
    }
    return [...groups].map(([run, items]) => ({ run, items })).sort((a, b) => at(b.run) - at(a.run));
  };
  const deduped = byRun(unique);
  const perRun = byRun(
    withDrops.flatMap((run) =>
      run.dropped.filter((d) => d && typeof d === "object").map((drop) => ({ run, drop, count: 1 })),
    ),
  );

  let everyRun = $state(false);
  const groups = $derived(everyRun ? perRun : deduped);
</script>

<h2 class="section-title">Aussortiert</h2>
<p class="mp-muted">
  Alle Kandidaten, die der Scraper geprüft und mit Begründung verworfen hat – hier sieht man Fehlentscheide am
  schnellsten. Hätte etwas rein gehört? <strong>«Gehört rein»</strong> öffnet ein GitHub-Issue mit allen
  Angaben; die Regeln passen wir dann in <code>scraper/criteria.md</code> oder <code>scraper/bands.md</code> an.
</p>

<div class="mp-stats">
  <span class="mp-chip">{plural(unique.length, "Kandidat", "Kandidaten")}</span>
  <span class="mp-chip">{plural(total, "Eintrag", "Einträge")}</span>
  <span class="mp-chip">{plural(withDrops.length, "Lauf", "Läufe")}</span>
  <label class="mp-check">
    <input type="checkbox" bind:checked={everyRun} /> Jeden Lauf einzeln zeigen
  </label>
</div>

{#if !files.runs}
  <p class="bad" role="status">data/runs.json konnte nicht geladen werden.</p>
{:else if !total}
  <p class="mp-muted" role="status">Noch nichts aussortiert.</p>
{/if}

{#each groups as g (g.run)}
  {@const when = stamp(g.run.at)}
  <h3 class="mp-run-head">Lauf {when} · {g.items.length} aussortiert</h3>
  {#each g.items as { drop: d, count }, j (j)}
    <article class="mp-rv">
      <div>
        <h4>
          {#if safeUrl(d.url)}
            <a href={safeUrl(d.url)} target="_blank" rel="noopener" title="Quelle öffnen">{d.title}</a>
          {:else}{d.title}{/if}
        </h4>
        <p class="mp-meta">
          {[day(d.date), d.venue, d.city].filter(Boolean).join(" · ")}
          {#if count > 1}<span class="mp-chip">in {count} Läufen</span>{/if}
        </p>
        <p class="mp-why"><b>Grund:</b> {d.why}</p>
      </div>
      <a
        class="mp-flag"
        href={issueUrl(d, when)}
        target="_blank"
        rel="noopener"
        title="Diesen Entscheid als falsch melden (GitHub-Issue)">Gehört rein</a
      >
    </article>
  {/each}
{/each}
