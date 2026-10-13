<script>
  /* «Diese Show ist nicht mehr in der Agenda – hier ist alles, was kommt.»: a line under the results row
   * for a stale or mistyped show link (reveal.svelte.js), instead of silently showing everything. */
  import { reveal } from "../../stores/reveal.svelte.js";
</script>

<p class="link-note" role="status" hidden={!reveal.note}>{reveal.note}</p>
