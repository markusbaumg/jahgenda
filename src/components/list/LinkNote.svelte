<script>
  /* «Diese Show ist nicht mehr in der Agenda – hier ist alles, was kommt.»: a line under the results row
   * for a stale or mistyped show link (reveal.svelte.js), instead of silently showing everything. */
  import { reveal } from "../../stores/reveal.svelte.js";
  import { t } from "../../i18n/i18n.svelte.js";
</script>

<!-- reveal.note is a message key (link.stale / link.staleList): it follows a language switch. -->
<p class="link-note" role="status" hidden={!reveal.note}>{reveal.note ? t(reveal.note) : ""}</p>
