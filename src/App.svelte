<script>
  /* The page: skip links, the tricolor stripes, header, the agenda (list + status) and the footer.
   * M0 scaffold (story #33): the filter bar, the panels, Meine Shows, the calendar and map views follow
   * in the next stories – their ids and copy stay those of the vanilla index.html (the e2e contract). */
  import Header from "./components/Header.svelte";
  import ShowList from "./components/ShowList.svelte";
  import Status from "./components/Status.svelte";
  import Footer from "./components/Footer.svelte";
  import { agenda } from "./stores/agenda.svelte.js";
  // M1: the filter bar, the results row, the past footer and the URL / history glue (which also wires the
  // rows' canton badge and «Distanz & Zug anzeigen», and the silent autoLocate after the data is in).
  import FilterBar from "./components/filters/FilterBar.svelte";
  import ResultsRow from "./components/filters/ResultsRow.svelte";
  import PastFoot from "./components/filters/PastFoot.svelte";
  import UrlState from "./components/filters/UrlState.svelte";
  import { ui } from "./stores/filters.svelte.js";
  // M2: the stale-link note, the feedback words and the deep links #<short>.
  import LinkNote from "./components/list/LinkNote.svelte";
  import { feedback } from "./stores/feedback.svelte.js";
  import { initReveal } from "./stores/reveal.svelte.js";

  // M4: the calendar and the map (the view switch itself sits in the results row, M1).
  import Calendar from "./components/views/Calendar.svelte";
  import MapView from "./components/views/MapView.svelte";
  import { views } from "./stores/views.svelte.js";

  agenda.load();
  // Rows & deep links (M2): #<short> lands on the row.
  initReveal();
  views.start();

  const hasRows = $derived(agenda.loadState === "ready" && agenda.visible.length > 0);
  // The screen reader hears the results line after every filter change (#status announces an empty state).
  const resultsLive = $derived(hasRows ? ui.resultsText : "");

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

<UrlState />

<main class="wrap">
  <div id="stuck-sentinel" aria-hidden="true"></div>
  <FilterBar />
  <ResultsRow />
  <LinkNote />
  <p class="sr" id="results-live" role="status" aria-live="polite">{resultsLive}</p>
  <!-- Feedback words of the row actions («Kopiert», «Gespeichert» …) for screen readers. -->
  <p class="sr" id="feedback" role="status" aria-live="polite">{feedback.text}</p>
  <div
    id="views"
    tabindex="-1"
    hidden={agenda.loadState === "error" || (agenda.loadState === "ready" && !hasRows)}
  >
    <!-- Only the active view keeps its rows: the calendar's day list and the map's «Ohne Standort» list
         reuse the row ids, and #id links must find the list row. -->
    <div id="list" hidden={views.current !== "list"}>
      {#if hasRows && views.current === "list"}
        <ShowList shows={agenda.visible} />
      {/if}
    </div>
    <Calendar shows={agenda.visible} active={hasRows && views.current === "calendar"} />
    <MapView shows={agenda.visible} active={hasRows && views.current === "map"} />
  </div>
  <Status onretry={() => agenda.load()} />
  <PastFoot />
</main>

<Footer />

<div class="stripe bottom" aria-hidden="true"><span></span><span></span><span></span></div>
