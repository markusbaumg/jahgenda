<script>
  /* Undo toast «‹Titel› entfernt · Rückgängig» (8 s, WCAG 2.2.1: the clock stops while the toast is hovered
   * or focused). It sits right after the views in the DOM, so a keyboard user reaches Rückgängig a few
   * Tabs after the row, not behind the footer. Shown first, then filled: a live region announces only what
   * changes while it is visible. */
  import { tick } from "svelte";
  import { mine } from "../../stores/marks.svelte.js";
  import { t } from "../../i18n/i18n.svelte.js";

  let title = $state("");
  $effect(() => {
    const u = mine.undo;
    if (!u) return;
    title = "";
    tick().then(() => (title = `«${u.title}»`));
  });
</script>

<div
  id="undo"
  class="toast undo"
  role="status"
  hidden={!mine.undo}
  onpointerenter={() => mine.stopUndoClock()}
  onfocusin={() => mine.stopUndoClock()}
  onpointerleave={() => mine.undoClock()}
  onfocusout={() => mine.undoClock()}
>
  <span><b class="t">{title}</b> {t("undo.removed")}</span><button
    type="button"
    title={t("undo.restoreTitle")}
    onclick={() => mine.restore()}>{t("undo.restore")}</button
  >
</div>
