<script>
  /* Ghost row (§3.5): «↳ Reeds Festival läuft noch bis So 1. Aug.» right under the head of every later
   * month a festival reaches into; a link to the card in its start month. Ported from app.js render(). */
  import "./festival.css";
  import { endLabel } from "../../lib/dates.js";
  import { t } from "../../i18n/i18n.svelte.js";

  let { show: s } = $props();
</script>

<p class="ghost">
  <a href="#{s._short}" title={t("festival.ghostTitle")}
    ><span class="arrow" aria-hidden="true">↳</span>
    {t("festival.ghost", { title: s.title, end: endLabel(s) })}</a
  >
</p>
