<script>
  /* Quellen & Venues: the agenda portals, festivals and search queries of scraper/sources.json (read from
   * GitHub – it is not part of the build) and the venue database data/venues.json, filterable. */
  import { RAW, tryJson } from "../../lib/load.js";
  import { safeUrl } from "../../lib/text.js";
  import { bare } from "../format.js";

  let { files } = $props();
  let sources = $state.raw(undefined); // undefined while loading, null when GitHub did not answer
  tryJson(`${RAW}scraper/sources.json`).then((s) => (sources = s));

  const venues = Object.entries((files.venues && files.venues.venues) || {})
    .filter(([, v]) => v && typeof v === "object")
    .sort((a, b) => `${a[1].canton}${a[0]}`.localeCompare(`${b[1].canton}${b[0]}`));
  const scraped = venues.filter(([, v]) => v.scrape).length;
  let q = $state("");
  const shown = $derived.by(() => {
    const needle = q.trim().toLowerCase();
    return needle
      ? venues.filter(([name, v]) => `${name} ${v.city} ${v.canton}`.toLowerCase().includes(needle))
      : venues;
  });
  const relevance = (v) => (/Reggae relevance:\s*(\w+)/i.exec(v.hint || "") || [])[1] || "";
  const EDIT = "https://github.com/markusbaumg/jahgenda/edit/main/";
</script>

{#snippet link(u, text)}
  {#if safeUrl(u)}<a href={safeUrl(u)} target="_blank" rel="noopener">{text || bare(u)}</a>{/if}
{/snippet}

<h2 class="section-title">Portale (Agenda-Seiten)</h2>
{#if sources === undefined}
  <p class="mp-muted" role="status">Lade scraper/sources.json …</p>
{:else if sources === null}
  <p class="bad" role="status">scraper/sources.json konnte nicht von GitHub geladen werden.</p>
{:else}
  <div class="mp-tbl">
    <table>
      <thead><tr><th>Portal</th><th>URL</th><th>Hinweis für den Scraper</th></tr></thead>
      <tbody>
        {#each sources.agendas || [] as a, i (i)}
          <tr
            ><td><strong>{a.name}</strong></td><td>{@render link(a.url)}</td><td class="hint">{a.hint}</td
            ></tr
          >
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<h2 class="section-title" id="venues-title">
  Venues <small>({venues.length}, {scraped} gescrapt)</small>
</h2>
<input
  class="mp-filter"
  type="search"
  placeholder="Venue, Ort, Kanton filtern …"
  aria-label="Venues filtern"
  bind:value={q}
/>
{#if !files.venues}
  <p class="bad" role="status">data/venues.json konnte nicht geladen werden.</p>
{/if}
<div class="mp-tbl">
  <table aria-labelledby="venues-title">
    <thead>
      <tr><th>Venue</th><th>Ort</th><th>gescrapt</th><th>Relevanz</th><th>Programm</th><th>Hinweis</th></tr>
    </thead>
    <tbody>
      {#each shown as [name, v] (name)}
        <tr>
          <td><strong>{name}</strong></td>
          <td>{v.city} <small>{v.canton}</small></td>
          <td class={v.scrape ? "ok" : "mp-muted"}>{v.scrape ? "ja" : "nein"}</td>
          <td>{relevance(v)}</td>
          <td>{@render link(v.url)}</td>
          <td class="hint">{v.hint}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

{#if sources}
  <h2 class="section-title">Festivals (für /harvest-bands)</h2>
  <div class="mp-tbl">
    <table>
      <thead><tr><th>Festival</th><th>Wo</th><th>URL</th><th>Wikipedia</th><th>Hinweis</th></tr></thead>
      <tbody>
        {#each sources.festivals || [] as f, i (i)}
          <tr>
            <td><strong>{f.name}</strong></td>
            <td>{f.where}</td>
            <td>{@render link(f.url)}</td>
            <td>{@render link(f.wikipedia, "Wikipedia")}</td>
            <td class="hint">{f.hint}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <h2 class="section-title">Suchanfragen &amp; grenznahe Regionen</h2>
  <div class="mp-md">
    <h3>Suchanfragen (Schweiz)</h3>
    <ul>
      {#each sources.search_queries || [] as s, i (i)}<li><code>{s}</code></li>{/each}
    </ul>
    <h3>Grenznahe Regionen</h3>
    <p>{(sources.nearby || {}).note || ""}</p>
    <ul>
      {#each (sources.nearby || {}).search_queries || [] as s, i (i)}<li><code>{s}</code></li>{/each}
    </ul>
  </div>
{/if}

<p class="mp-edit">
  Bearbeiten auf GitHub:
  <a href="{EDIT}scraper/sources.json" target="_blank" rel="noopener">sources.json</a> ·
  <a href="{EDIT}data/venues.json" target="_blank" rel="noopener">venues.json</a>
</p>
