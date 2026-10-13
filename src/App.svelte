<script>
  /* The page: skip links, the tricolor stripes, header, the agenda (list + status) and the footer.
   * M0 scaffold (story #33): the filter bar, the panels, Meine Shows, the calendar and map views follow
   * in the next stories – their ids and copy stay those of the vanilla index.html (the e2e contract). */
  import Header from "./components/Header.svelte";
  import ShowList from "./components/ShowList.svelte";
  import Status from "./components/Status.svelte";
  import Footer from "./components/Footer.svelte";
  import { agenda } from "./stores/agenda.svelte.js";
  // M6: callouts, history, live regions.
  import { tick } from "svelte";
  import Callout from "./components/callout/Callout.svelte";
  import { startNudges, quietScroll } from "./components/callout/nudges.svelte.js";
  import { nav } from "./stores/history.js";
  import { live } from "./stores/live.svelte.js";
  import { parseHash } from "./lib/hash.js";

  nav.start(); // before the data: the saved scroll offset is read off the entry the browser restored
  agenda.load();
  startNudges();

  const hasRows = $derived(agenda.loadState === "ready" && agenda.visible.length > 0);

  // After the first render: back to the rows the visitor was looking at (reload, tab restore, Back from
  // log.html) – unless a show or list link takes over.
  let restored = false;
  $effect(() => {
    if (restored || agenda.loadState !== "ready") return;
    restored = true;
    tick().then(() => {
      const { id, mine } = parseHash(location.hash);
      // A filter state (#q=…&g=…) is no show link: the offset is restored under it.
      if (nav.restoreScroll({ id: id.includes("=") ? "" : id, mine })) quietScroll(1500);
    });
  });

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
  <!-- Screen readers hear the result count after every filter change (the visible count is in the footer). -->
  <p class="sr" id="results-live" role="status" aria-live="polite">{live.resultsText}</p>
  <!-- Feedback words of the row actions («Kopiert», «Gespeichert» …) for screen readers. -->
  <p class="sr" id="feedback" role="status" aria-live="polite">{live.feedback}</p>
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
</main>

<!-- The sticker sits right before the footer: a keyboard user reaches it a few Tabs after the list. -->
<Callout />

<Footer />

<div class="stripe bottom" aria-hidden="true"><span></span><span></span><span></span></div>
