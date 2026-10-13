<script>
  /* The page: skip links, the tricolor stripes, header, the agenda (list + status) and the footer.
   * M0 scaffold (story #33): the filter bar, the panels, Meine Shows, the calendar and map views follow
   * in the next stories – their ids and copy stay those of the vanilla index.html (the e2e contract). */
  import Header from "./components/Header.svelte";
  import ShowList from "./components/ShowList.svelte";
  import Status from "./components/Status.svelte";
  import Footer from "./components/Footer.svelte";
  import { agenda } from "./stores/agenda.svelte.js";
  // M4 views: Liste | Kalender | Karte
  import ViewSwitch from "./components/views/ViewSwitch.svelte";
  import Calendar from "./components/views/Calendar.svelte";
  import MapView from "./components/views/MapView.svelte";
  import { views } from "./stores/views.svelte.js";

  agenda.load();
  views.start();

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
  <!-- M4: the view switch; its home is the results row of the filter bar (the integrator moves it there). -->
  <div class="results-row"><ViewSwitch /></div>
  <p class="sr" id="results-live" role="status" aria-live="polite">{resultsLive}</p>
  <!-- Feedback words of the row actions («Kopiert», «Gespeichert» …) for screen readers. -->
  <p class="sr" id="feedback" role="status" aria-live="polite"></p>
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
</main>

<Footer />

<div class="stripe bottom" aria-hidden="true"><span></span><span></span><span></span></div>
