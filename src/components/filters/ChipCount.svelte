<script>
  /* The count inside a chip's <small>: screen readers hear «Reggae, 75 Shows» – the unit sits in the count
   * as sr text, so the accessible name still contains the visible words (an aria-label would not). */
  import { t } from "../../i18n/i18n.svelte.js";
  let { n } = $props();
</script>

<span class="sr">{", "}</span>{n}<span class="sr">{t("n.showsUnit", { n })}</span>
