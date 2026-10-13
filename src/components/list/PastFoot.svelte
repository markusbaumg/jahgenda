<script>
  /* «↑ n vergangene Shows anzeigen»: the last row under the list (§3.10). n counts only what the current
   * filters would bring back, so «Heute» never offers past shows it cannot show. The past days appear
   * above it, so the page scrolls up to the first of them; hiding them again keeps the results in view.
   * Ported from app.js renderInner() / the past-foot handler. */
  import { tick } from "svelte";
  import { agenda } from "../../stores/agenda.svelte.js";
  import { keepInView } from "./keepInView.js";

  // `list`: the list view is the one showing (the other views keep the switch in the Wann panel).
  let { list = true } = $props();

  const past = $derived(
    agenda.loadState === "ready"
      ? agenda.shows.filter((s) => s._past && agenda.inRange(s) && agenda.matchesFilters(s)).length
      : 0,
  );
  const label = $derived(`${past} vergangene ${past === 1 ? "Show" : "Shows"} anzeigen`);

  async function toggle() {
    agenda.filters.showPast = !agenda.filters.showPast;
    if (!agenda.filters.showPast) return keepInView();
    await tick();
    const first = document.querySelector("#list .day.past");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (first) first.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
  }
</script>

<!-- Also under the empty state: the match may lie in the past. -->
<div id="list-foot" class="list-foot" hidden={!past || !list}>
  <button
    type="button"
    id="past-foot"
    class="linkish"
    title="Auch Shows anzeigen, die schon vorbei sind"
    onclick={toggle}
    >{#if agenda.filters.showPast}<span class="arrow" aria-hidden="true">↓</span>
      {"Vergangene ausblenden"}{:else}<span class="arrow" aria-hidden="true">↑</span> {label}{/if}</button
  >
</div>
