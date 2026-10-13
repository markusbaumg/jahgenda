<script>
  /* «↑ n vergangene Shows anzeigen»: the last row under the list (§3.10). n counts only what the current
   * filters would bring back, so «Heute» never offers past shows it cannot show. Also under the empty
   * state (the match may lie in the past); only in the list view (the other views keep the switch in the
   * Wann panel). Opening scrolls up to the first past day; hiding keeps the results in view. */
  import { flushSync } from "svelte";
  import { agenda } from "../../stores/agenda.svelte.js";
  import { ui } from "../../stores/filters.svelte.js";

  const f = agenda.filters;
  const past = $derived(
    agenda.loadState !== "ready" || ui.listMode
      ? 0
      : agenda.shows.filter((s) => s._past && agenda.inRange(s) && agenda.matchesFilters(s)).length,
  );

  function toggle() {
    const on = !f.showPast;
    if (!on) return ui.applyFilter(() => ui.setShowPast(false));
    ui.setShowPast(true);
    flushSync();
    const first = document.querySelector("#list .day.past");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (first) first.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
  }
</script>

<!-- Past shows: the last row under the list; the past days appear above it when opened. -->
<div id="list-foot" class="list-foot" hidden={!past || ui.view !== "list"}>
  <button
    type="button"
    id="past-foot"
    class="linkish"
    title="Auch Shows anzeigen, die schon vorbei sind"
    onclick={toggle}
  >
    {#if f.showPast}<span class="arrow" aria-hidden="true">↓</span> Vergangene ausblenden{:else}<span
        class="arrow"
        aria-hidden="true">↑</span
      >
      {past} vergangene {past === 1 ? "Show" : "Shows"} anzeigen{/if}
  </button>
</div>
