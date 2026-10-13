<script>
  /* Prompt & Regeln: the scraper prompt (the skill), the criteria and the band list, read from main on
   * GitHub and rendered with the small escaping Markdown renderer (src/lib/markdown.js). */
  import { RAW, tryText } from "../../lib/load.js";
  import { markdown } from "../../lib/markdown.js";

  const DOCS = [
    { path: ".claude/skills/scrape-shows/SKILL.md", title: "Scraper-Prompt" },
    { path: "scraper/criteria.md", title: "Kriterien" },
    { path: "scraper/bands.md", title: "Bands" },
  ];
  const EDIT = "https://github.com/markusbaumg/jahgenda/edit/main/";

  let html = $state({}); // path → HTML, or null when it could not be loaded
  for (const d of DOCS)
    tryText(RAW + d.path).then((t) => (html = { ...html, [d.path]: t == null ? null : markdown(t) }));
</script>

<nav class="mp-jump" aria-label="Dokumente">
  {#each DOCS as d, i (d.path)}
    <a
      href="#prompt"
      onclick={(e) => (e.preventDefault(), document.getElementById(`doc-${i}`)?.scrollIntoView())}
      >{d.title}</a
    >
  {/each}
</nav>

{#each DOCS as d, i (d.path)}
  <h2 class="section-title" id="doc-{i}">{d.title} <small><code>{d.path}</code></small></h2>
  <p class="mp-edit">
    <a href="{EDIT}{d.path}" target="_blank" rel="noopener">{d.path.split("/").pop()} auf GitHub bearbeiten</a
    >
  </p>
  <div class="mp-md">
    {#if html[d.path] === undefined}
      <p class="mp-muted">Lade …</p>
    {:else if html[d.path] === null}
      <p class="bad">Konnte {d.path} nicht laden.</p>
    {:else}
      {@html html[d.path]}
    {/if}
  </div>
{/each}
