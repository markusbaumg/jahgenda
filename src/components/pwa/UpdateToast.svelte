<script>
  /* «Neue Version von Jahgenda · Aktualisieren» (ported from public/pwa.js): shown when a new service
   * worker waits; the button lets it take over and reloads the page once (src/stores/pwa.svelte.js). */
  import { pwa } from "../../stores/pwa.svelte.js";
  import { t } from "../../i18n/i18n.svelte.js";

  let toast = $state(null);

  // A callout that appears later docks above the toast instead of underneath it (--toast-h, read by Callout.svelte).
  $effect(() => {
    if (!toast) return;
    const root = document.documentElement.style;
    root.setProperty("--toast-h", `${toast.offsetHeight + 12}px`);
    return () => root.removeProperty("--toast-h");
  });
</script>

{#if pwa.update}
  <div class="toast" role="status" bind:this={toast}>
    {t("update.text")}
    <button type="button" title={t("update.title")} onclick={() => pwa.applyUpdate()}
      >{t("update.button")}</button
    >
  </div>
{/if}
