<script>
  /* No markup: the page's URL and history glue for the filters (story #33 M1, ported from app.js).
   * - The filter state lives in the hash (#q=…&g=…&f=…&wo=…&r=…&wann=…&past=1&view=…), written with
   *   replaceState on every change (a filter tap never adds a history entry), read once when the data is
   *   in, applied again when such a hash arrives on the open page.
   * - Back (closing a panel, returning from a view switch) and the scroll restoration are the history
   *   store's (src/stores/history.js); the filter store plugs its panels and the view into it.
   * - The rows' canton badge toggles the Wo filter; their «Distanz & Zug anzeigen» asks for the position. */
  import { tick } from "svelte";
  import { agenda } from "../../stores/agenda.svelte.js";
  import { ui } from "../../stores/filters.svelte.js";

  const ready = $derived(agenda.loadState === "ready");
  let landed = false;
  // A reloaded, bookmarked or shared filtered view: read before the first rows are drawn.
  $effect.pre(() => {
    if (ready) ui.readHashOnce();
  });
  // Every change of the filters or the view goes into the hash.
  $effect(() => {
    if (!ready) return;
    void ui.stateParams();
    ui.syncFilterHash();
  });
  // A granted position comes in silently once the rows are drawn (the scroll restoration is nav's, App).
  $effect(() => {
    if (!ready || landed) return;
    landed = true;
    tick().then(() => ui.autoLocate());
  });

  function onClick(e) {
    const list = document.getElementById("list");
    if (!list || !list.contains(e.target)) return;
    // Canton badge in a row: toggles that canton in the Wo filter.
    const c = e.target.closest(".canton[data-canton]");
    if (c) return ui.applyFilter(() => ui.toggleCanton(c.dataset.canton));
    if (e.target.closest(".geo-ask")) ui.locate({ fromRow: true });
  }
</script>

<svelte:document onclick={onClick} />
