<script>
  /* Läufe: every run of data/runs.json, newest first, each one collapsible – counts, runner, the
   * per-source table (ok / nichts gefunden / nicht erreichbar / übersprungen with found / kept / error),
   * the dropped candidates, the unreachable sources and the notes. What log.html showed. */
  import { parseTs } from "../../lib/health.js";
  import { stamp, RUNNER, SKILL, SOURCE_STATUS, plural } from "../format.js";

  let { files } = $props();
  const runs = (files.runs && Array.isArray(files.runs.runs) ? files.runs.runs : [])
    .filter((r) => r && typeof r === "object")
    .map((r, i) => ({ r, i, t: parseTs(r.at) || 0 }))
    .sort((a, b) => b.t - a.t || a.i - b.i)
    .map(({ r }) => r);

  // runs.json has no ok flag (a failure is a note); status.json marks the run it belongs to.
  const status = files.status && typeof files.status === "object" ? files.status : null;
  const failed = (r) => r.ok === false || (status?.ok === false && parseTs(status.at) === parseTs(r.at));
  const list = (v) => (Array.isArray(v) ? v.filter((x) => x != null) : []);
  const sourceSummary = (sources) => {
    const c = {};
    for (const s of sources) c[s.status] = (c[s.status] || 0) + 1;
    return Object.entries(c)
      .map(([k, n]) => `${n} ${SOURCE_STATUS[k] || k}`)
      .join(" · ");
  };
</script>

<h2 class="section-title">Läufe <small>({runs.length})</small></h2>
<p class="mp-muted">
  Jeder Lauf hinterlässt hier einen Eintrag: was neu, geändert oder entfernt wurde, welche Quellen nicht
  erreichbar waren und was mit welcher Begründung verworfen wurde. Der neuste Lauf steht oben.
</p>

{#if !files.runs}
  <p class="bad" role="status">data/runs.json konnte nicht geladen werden.</p>
{:else if !runs.length}
  <p class="mp-muted" role="status">Noch kein Lauf protokolliert.</p>
{/if}

{#each runs as r, i (r.at + i)}
  {@const sources = list(r.sources).filter((s) => s && typeof s === "object")}
  <details class="mp-run" open={i === 0}>
    <summary>
      <span class="mp-run-title">{SKILL[r.skill] || r.skill || "Lauf"}</span>
      <time datetime={r.at}>{stamp(r.at)}</time>
      <span class="mp-chips">
        {#if failed(r)}<span class="mp-chip bad">fehlgeschlagen</span>{/if}
        {#if r.runner}<span class="mp-chip">{RUNNER[r.runner] || r.runner}</span>{/if}
        {#if r.added}<span class="mp-chip ok">+{r.added} neu</span>{/if}
        {#if r.updated}<span class="mp-chip">~{r.updated} geändert</span>{/if}
        {#if r.removed}<span class="mp-chip bad">−{r.removed} entfernt</span>{/if}
        {#if typeof r.total === "number"}<span class="mp-chip">{r.total} total</span>{/if}
        {#if list(r.dropped).length}<span class="mp-chip">{list(r.dropped).length} verworfen</span>{/if}
        {#if list(r.failed_sources).length}
          <span class="mp-chip bad">{list(r.failed_sources).length} nicht erreichbar</span>
        {/if}
      </span>
    </summary>
    <div class="mp-run-body">
      {#if sources.length}
        <h4>Quellen ({sources.length}: {sourceSummary(sources)})</h4>
        <div class="mp-tbl">
          <table>
            <thead>
              <tr
                ><th>Quelle</th><th>Status</th><th class="num">gefunden</th><th class="num">übernommen</th
                ></tr
              >
            </thead>
            <tbody>
              {#each sources as s, j (j)}
                <tr class="st-{s.status}">
                  <td>
                    {#if /^https?:\/\//.test(s.url || "")}
                      <a href={s.url} target="_blank" rel="noopener">{s.name || s.url}</a>
                    {:else}{s.name || "–"}{/if}
                  </td>
                  <td class="st">{SOURCE_STATUS[s.status] || s.status}{s.error ? ` – ${s.error}` : ""}</td>
                  <td class="num">{s.found ?? ""}</td>
                  <td class="num">{s.kept ?? ""}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
      {#if list(r.dropped).length}
        <h4>Verworfen ({list(r.dropped).length})</h4>
        <ul>
          {#each list(r.dropped) as d, j (j)}
            <li><strong>{d.title}</strong> – {d.why}</li>
          {/each}
        </ul>
      {/if}
      {#if list(r.failed_sources).length}
        <h4>Nicht erreichbar ({list(r.failed_sources).length})</h4>
        <ul>
          {#each list(r.failed_sources) as f, j (j)}<li>{f}</li>{/each}
        </ul>
      {/if}
      {#if list(r.notes).length}
        <h4>Notizen ({list(r.notes).length})</h4>
        <ul>
          {#each list(r.notes) as note, j (j)}<li>{note}</li>{/each}
        </ul>
      {/if}
      {#if !sources.length && !list(r.dropped).length && !list(r.failed_sources).length && !list(r.notes).length}
        <p class="mp-muted">Keine Details zu diesem Lauf ({plural(r.total ?? 0, "Show", "Shows")} total).</p>
      {/if}
    </div>
  </details>
{/each}
