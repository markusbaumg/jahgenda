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
  // M2: the stale-link note, the feedback words and the deep links #<short>.
  import LinkNote from "./components/list/LinkNote.svelte";
  import { initReveal } from "./stores/reveal.svelte.js";
  // M7: the service worker and the «Neue Version» toast (the install nudge is a callout, M6).
  import UpdateToast from "./components/pwa/UpdateToast.svelte";
  import { pwa } from "./stores/pwa.svelte.js";

  // M4: the calendar and the map (the view switch itself sits in the results row, M1).
  import Calendar from "./components/views/Calendar.svelte";
  import MapView from "./components/views/MapView.svelte";
  import { views } from "./stores/views.svelte.js";
  // M6: callouts, the Back button and scroll restoration, live regions.
  import { tick } from "svelte";
  import Callout from "./components/callout/Callout.svelte";
  import { startNudges } from "./components/callout/nudges.svelte.js";
  import { quietScroll } from "./components/views/scroll.js";
  import { nav } from "./stores/history.js";
  import { live } from "./stores/live.svelte.js";
  import { parseHash } from "./lib/hash.js";
  // M3: Meine Shows – the list panel, the undo toast; the ★ and the list head sit in the filter bar.
  import MinePanel from "./components/mine/MinePanel.svelte";
  import UndoToast from "./components/mine/UndoToast.svelte";
  import { mine } from "./stores/marks.svelte.js";
  // Story #48: every visible string goes through t() (src/i18n), DE · FR · EN.
  import { t } from "./i18n/i18n.svelte.js";

  nav.start(); // before the data: the saved scroll offset is read off the entry the browser restored
  agenda.load();
  // Meine Shows (M3) before the reveal: its hashchange listener has to run first, so a show link that
  // replaces a friend's #m= list sees the agenda again (app.js revealFromHash dropped the list first).
  mine.start();
  // Rows & deep links (M2): #<short> lands on the row.
  initReveal();
  views.start();
  startNudges();
  pwa.start();

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
<a class="skip" href="#views">{t("skip.agenda")}</a>
<a class="skip" href="#foot">{t("skip.footer")}</a>
<div class="stripe" aria-hidden="true"><span></span><span></span><span></span></div>

<Header />

<UrlState />

<main class="wrap">
  <div id="stuck-sentinel" aria-hidden="true"></div>
  <FilterBar />
  <ResultsRow />
  <LinkNote />
  <!-- Screen readers hear the result count after every filter change (the visible count is in the footer). -->
  <p class="sr" id="results-live" role="status" aria-live="polite">{live.resultsText}</p>
  <!-- Feedback words of the row actions («Kopiert», «Gespeichert» …) for screen readers. -->
  <p class="sr" id="feedback" role="status" aria-live="polite">{live.feedback}</p>
  <MinePanel />
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
    <Calendar shows={agenda.visible} marks={mine.marks} active={hasRows && views.current === "calendar"} />
    <MapView shows={agenda.visible} marks={mine.marks} active={hasRows && views.current === "map"} />
  </div>
  <UndoToast />
  <Status onretry={() => agenda.load()} />
  <PastFoot />
</main>

<!-- The sticker sits right before the footer: a keyboard user reaches it a few Tabs after the list. -->
<Callout />

<Footer />

<div class="stripe bottom" aria-hidden="true"><span></span><span></span><span></span></div>

<UpdateToast />
