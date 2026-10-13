<script>
  /* «Neue Version von Jahgenda · Aktualisieren» (ported from public/pwa.js): shown when a new service
   * worker waits; the button lets it take over and reloads the page once (src/stores/pwa.svelte.js). */
  import { pwa } from "../../stores/pwa.svelte.js";

  let toast = $state(null);

  // A callout that appears later docks above the toast instead of underneath it (--toast-h, style.css).
  $effect(() => {
    if (!toast) return;
    const root = document.documentElement.style;
    root.setProperty("--toast-h", `${toast.offsetHeight + 12}px`);
    return () => root.removeProperty("--toast-h");
  });
</script>

{#if pwa.update}
  <div class="toast" role="status" bind:this={toast}>
    Neue Version von Jahgenda <button
      type="button"
      title="Seite neu laden und die neue Version verwenden"
      onclick={() => pwa.applyUpdate()}>Aktualisieren</button
    >
  </div>
{/if}
