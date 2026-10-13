<script>
  /* The chip row of the bar: «Alle» + one toggle per genre that occurs at least once (order of
   * data/genres.json), then the format group (Festival – a format, not a genre, §3.3). Every chip counts
   * what a tap on it yields under the other filters; a chip with nothing behind it is dimmed (.is-empty)
   * but stays tappable. The row scrolls sideways: arrows only where something is hidden, mouse drag. */
  import { tick } from "svelte";
  import { agenda, FORMAT_LABEL } from "../../stores/agenda.svelte.js";
  import { ui } from "../../stores/filters.svelte.js";
  import ChipCount from "./ChipCount.svelte";

  const f = agenda.filters;
  let row;
  let canLeft = $state(false);
  let canRight = $state(false);

  const ready = $derived(agenda.loadState === "ready");
  const count = (o) => (ready ? agenda.countWith(o) : null);

  // Scroll arrows for the chip row: only shown when there is something hidden in that direction.
  function updateArrows() {
    if (!row) return;
    canLeft = row.scrollLeft > 2;
    canRight = row.scrollLeft + row.clientWidth < row.scrollWidth - 2;
  }
  $effect(() => {
    // The chips arrive with the data: the row starts at «Alle», whatever snapped before they existed.
    if (!ready) return;
    void agenda.genres; // re-run when the chips change
    void agenda.formats;
    tick().then(() => {
      if (!row) return;
      row.scrollLeft = 0;
      updateArrows();
    });
  });

  // Set the genre ("" = all), press its chip and keep that chip in view.
  function pickGenre(g, btn) {
    const next = f.genre === g ? "" : g;
    ui.applyFilter(() => ui.setGenre(next));
    if (!next) row.scrollTo({ left: 0 });
    else if (btn) btn.scrollIntoView({ inline: "nearest", block: "nearest" });
  }
  // Format chips (Festival): a toggle of its own next to the genre, so «Dub» + «Festival» = dub festivals.
  function pickFormat(v, btn) {
    const next = f.format === v ? "" : v;
    if (next) btn.scrollIntoView({ inline: "nearest", block: "nearest" });
    ui.applyFilter(() => ui.setFormat(next));
  }

  // Drag the chip row with the mouse (touch scrolls natively). A real drag suppresses the click.
  let drag = null;
  function onPointerDown(e) {
    if (e.pointerType !== "mouse") return;
    drag = { x: e.clientX, left: row.scrollLeft, moved: false };
    row.style.scrollBehavior = "auto";
  }
  function onPointerMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) drag.moved = true;
    row.scrollLeft = drag.left - dx;
  }
  function endDrag() {
    if (!drag) return;
    row.style.scrollBehavior = "";
    const moved = drag.moved;
    drag = null;
    if (moved) row.addEventListener("click", (e) => e.stopPropagation(), { capture: true, once: true });
  }
  const scrollBy = (dir) => row.scrollBy({ left: dir * row.clientWidth * 0.7 });
</script>

<svelte:window onresize={updateArrows} />

<div class="chips-wrap" class:can-left={canLeft} class:can-right={canRight}>
  <button
    type="button"
    class="scroll-btn left"
    data-dir="-1"
    aria-label="Genres nach links scrollen"
    title="Genres nach links scrollen"
    hidden={!canLeft}
    onclick={() => scrollBy(-1)}
  >
    &lsaquo;
  </button>
  <!-- svelte-ignore a11y_no_static_element_interactions (the mouse drag only scrolls; the chips are buttons) -->
  <div
    id="chips"
    class="chips"
    bind:this={row}
    onscroll={updateArrows}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={endDrag}
    onpointerleave={endDrag}
    onpointercancel={endDrag}
  >
    <div id="genres" class="chip-group" role="group" aria-label="Genre">
      {#if ready}
        {@const all = count({ genre: "" })}
        <button
          type="button"
          class="chip"
          class:is-empty={all === 0 && f.genre !== ""}
          data-genre=""
          aria-pressed={String(f.genre === "")}
          title="Alle Genres anzeigen ({all})"
          onclick={(e) => pickGenre("", e.currentTarget)}>Alle</button
        >
        {#each agenda.genres as g (g)}
          {@const n = count({ genre: g })}
          <button
            type="button"
            class="chip"
            class:is-empty={n === 0 && f.genre !== g}
            data-genre={g}
            aria-pressed={String(f.genre === g)}
            title="Nur {agenda.genreLabel[g] || g} anzeigen ({n})"
            onclick={(e) => pickGenre(g, e.currentTarget)}
            >{agenda.genreLabel[g] || g}<small><ChipCount {n} /></small></button
          >
        {/each}
      {/if}
    </div>
    <!-- Formats (Festival) are a chip group of their own, not a genre (design/ui-revamp.md §3.3). -->
    <div id="formats" class="chip-group" role="group" aria-label="Format">
      {#if ready}
        {#each agenda.formats as v (v)}
          {@const n = count({ format: v })}
          <button
            type="button"
            class="chip"
            class:is-empty={n === 0 && f.format !== v}
            data-format={v}
            aria-pressed={String(f.format === v)}
            title="Nur Festivals anzeigen ({n})"
            onclick={(e) => pickFormat(v, e.currentTarget)}
            >{FORMAT_LABEL[v]}<small><ChipCount {n} /></small></button
          >
        {/each}
      {/if}
    </div>
  </div>
  <button
    type="button"
    class="scroll-btn right"
    data-dir="1"
    aria-label="Genres nach rechts scrollen"
    title="Genres nach rechts scrollen"
    hidden={!canRight}
    onclick={() => scrollBy(1)}
  >
    &rsaquo;
  </button>
</div>
