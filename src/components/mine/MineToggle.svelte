<script>
  /* The ★ in the toolbar (§7 S5): always there; without marks it is muted and only explains itself (title,
   * and on a tap the word next to it – a touch screen never shows the tooltip). With marks it switches
   * the list mode «Meine Shows» on and off; it stays in place (pressed) while the list is open. */
  import { agenda } from "../../stores/agenda.svelte.js";
  import { mine } from "../../stores/marks.svelte.js";
  import { createFlasher } from "../../stores/feedback.svelte.js";
  import { t } from "../../i18n/i18n.svelte.js";

  const ready = $derived(agenda.loadState === "ready");
  const n = $derived(mine.markedCount);
  const title = $derived(t(n === 0 ? "mine.titleEmpty" : mine.mineOnly ? "mine.titleOff" : "mine.titleOn"));
  const { flashes, flash } = createFlasher();
  function onclick(e) {
    flash("mine", mine.toggleMine());
  }
</script>

<button
  type="button"
  id="toggle-mine"
  class="icon-btn mine{n === 0 ? ' empty' : ''}{flashes.mine ? ' fb-on' : ''}"
  aria-pressed={String(mine.mineOnly)}
  aria-disabled={String(n === 0)}
  {title}
  aria-label={ready ? t("mine.aria", { n }) : t("mine.ariaLoading")}
  {onclick}
>
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="currentColor" d="m12 2 3 6.6 7 .8-5.2 4.9 1.4 7.1L12 17.8 5.8 21.4l1.4-7.1L2 9.4l7-.8z" />
  </svg>
  <b>{n}</b>
  {#if flashes.mine}<span class="fb" aria-hidden="true">{flashes.mine}</span>{/if}
</button>
