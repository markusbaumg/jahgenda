<script>
  /* Ghost row (§3.5): «↳ Reeds Festival läuft noch bis So 1. Aug.» right under the head of every later
   * month a festival reaches into; a link to the card in its start month. Ported from app.js render(). */
  import { endLabel } from "../../lib/dates.js";

  let { show: s } = $props();
</script>

<p class="ghost">
  <a href="#{s._short}" title="Zum Festival in der Liste springen"
    ><span class="arrow" aria-hidden="true">↳</span> {s.title} läuft noch bis {endLabel(s)}</a
  >
</p>
