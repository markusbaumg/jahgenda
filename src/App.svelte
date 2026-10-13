<script>
  /* The page: skip links, the tricolor stripes, header, the agenda (list + status) and the footer.
   * M0 scaffold (story #33): the filter bar, the panels, Meine Shows, the calendar and map views follow
   * in the next stories – their ids and copy stay those of the vanilla index.html (the e2e contract). */
  import { untrack } from "svelte";
  import Header from "./components/Header.svelte";
  import ShowList from "./components/ShowList.svelte";
  import Status from "./components/Status.svelte";
  import Footer from "./components/Footer.svelte";
  import { agenda } from "./stores/agenda.svelte.js";
  import LinkNote from "./components/list/LinkNote.svelte";
  import PastFoot from "./components/list/PastFoot.svelte";
  import { feedback } from "./stores/feedback.svelte.js";
  import { initReveal } from "./stores/reveal.svelte.js";
  import { autoLocate } from "./stores/geo.svelte.js";

  agenda.load();
  // Rows & deep links (M2): #<short> lands on the row; a granted position silently comes in after the data.
  initReveal();
  $effect(() => {
    if (agenda.loadState === "ready") untrack(autoLocate);
  });

  const hasRows = $derived(agenda.loadState === "ready" && agenda.visible.length > 0);
  // The screen reader hears the result count after every filter change (the visible count is in the footer).
  const resultsLive = $derived(
    hasRows ? `${agenda.visible.length} ${agenda.visible.length === 1 ? "Show" : "Shows"}` : "",
  );

  // HEUTE / MORGEN, the coming weekend and «vorbei» depend on the clock: when the tab comes back on
  // another day, the list is rendered again.
  function onVisibility() {
    if (document.visibilityState === "visible") agenda.refreshDay();
  }
</script>

<svelte:document onvisibilitychange={onVisibility} />

<!-- Keyboard: ~10 tab stops per row – jump straight to the agenda or past it to the footer. -->
<a class="skip" href="#views">Zur Agenda</a>
<a class="skip" href="#foot">Zum Seitenende</a>
<div class="stripe" aria-hidden="true"><span></span><span></span><span></span></div>

<Header />

<main class="wrap">
  <div id="stuck-sentinel" aria-hidden="true"></div>
  <LinkNote />
  <p class="sr" id="results-live" role="status" aria-live="polite">{resultsLive}</p>
  <!-- Feedback words of the row actions («Kopiert», «Gespeichert» …) for screen readers. -->
  <p class="sr" id="feedback" role="status" aria-live="polite">{feedback.text}</p>
  <div
    id="views"
    tabindex="-1"
    hidden={agenda.loadState === "error" || (agenda.loadState === "ready" && !hasRows)}
  >
    <div id="list">
      {#if hasRows}
        <ShowList shows={agenda.visible} />
      {/if}
    </div>
    <div id="calendar" class="calendar" hidden></div>
    <div id="map-view" class="map-view" hidden>
      <div id="map" class="map" role="region" aria-label="Karte der Clubs"></div>
      <div id="map-rest"></div>
    </div>
  </div>
  <Status onretry={() => agenda.load()} />
  <PastFoot />
</main>

<Footer />

<div class="stripe bottom" aria-hidden="true"><span></span><span></span><span></span></div>
