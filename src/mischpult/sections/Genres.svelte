<script>
  /* Genres: the allowed slugs of data/genres.json in filter order, with label and what each one covers. */
  let { files } = $props();
  const genres = (files.genres && Array.isArray(files.genres.genres) ? files.genres.genres : []).filter(
    (g) => g && typeof g === "object",
  );
</script>

<h2 class="section-title">Genres <small>(data/genres.json)</small></h2>
<p class="mp-muted">Die erlaubten Genres, in der Reihenfolge der Filter auf der Agenda.</p>
{#if !files.genres}
  <p class="bad" role="status">data/genres.json konnte nicht geladen werden.</p>
{:else}
  <!-- A table without links: the box itself takes the focus, so it scrolls sideways from the keyboard too
       (axe scrollable-region-focusable). -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (a scrollable region must be focusable, WCAG 2.1.1) -->
  <div class="mp-tbl" tabindex="0" role="region" aria-label="Genres">
    <table>
      <thead><tr><th>Slug</th><th>Label</th><th>Deckt ab</th></tr></thead>
      <tbody>
        {#each genres as g (g.slug)}
          <tr><td><code>{g.slug}</code></td><td>{g.label}</td><td class="hint">{g.maps}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
<p class="mp-edit">
  <a href="https://github.com/markusbaumg/jahgenda/edit/main/data/genres.json" target="_blank" rel="noopener"
    >genres.json auf GitHub bearbeiten</a
  >
</p>
