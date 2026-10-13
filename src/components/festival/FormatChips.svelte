<script>
  /* Format chips (§3.3): «Festival» is a format, not a genre – a chip group of its own after the genres
   * (#formats inside #chips), a toggle that combines with the genre («Dub» + «Festival» = dub festivals).
   * Only formats that occur in the data get a chip. The count says how many shows the list would hold
   * with it under every other filter (sr text «, 3 Shows»); a chip with nothing behind it is dimmed but
   * stays tappable. Ported from app.js (formatBar, setFormat, updateCounts). */
  import { agenda } from "../../stores/agenda.svelte.js";
  import { formats } from "../../stores/festival.svelte.js";

  function onclick(e, f) {
    formats.toggle(f);
    if (agenda.filters.format) e.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest" });
  }
</script>

<!-- Formats (Festival) are a chip group of their own, not a genre (design/ui-revamp.md §3.3). -->
<div id="formats" class="chip-group" role="group" aria-label="Format">
  {#each agenda.formats as f (f)}
    {@const n = formats.count(f)}
    {@const pressed = agenda.filters.format === f}
    <button
      type="button"
      class="chip{n === 0 && !pressed ? ' is-empty' : ''}"
      data-format={f}
      aria-pressed={pressed}
      title="Nur Festivals anzeigen ({n})"
      onclick={(e) => onclick(e, f)}
      >{formats.label(f)}<small
        ><span class="sr">{", "}</span>{n}<span class="sr">{n === 1 ? " Show" : " Shows"}</span></small
      ></button
    >
  {/each}
</div>
