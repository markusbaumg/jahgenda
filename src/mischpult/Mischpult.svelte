<script>
  /* The Mischpult: the owners' console in one page (story #55) – Status, Läufe, Aussortiert, Quellen &
   * Venues, Prompt & Regeln, Genres. Every tab has a hash (#status … #genres), so a tab can be bookmarked
   * and the old pages redirect into it (log.html → #laeufe, review.html → #aussortiert). The tab list is a
   * WAI-ARIA tablist: arrows / Home / End move between tabs, a tab is a link to its hash.
   * The data files load once here; sources.json and the Markdown files come from GitHub when their tab
   * is opened. Hidden: not linked from the public pages, noindex, not in robots.txt (CLAUDE.md). */
  import { onMount } from "svelte";
  import { DATA, tryJson } from "../lib/load.js";
  import { safeDecode } from "../lib/hash.js";
  import Status from "./sections/Status.svelte";
  import Runs from "./sections/Runs.svelte";
  import Dropped from "./sections/Dropped.svelte";
  import Sources from "./sections/Sources.svelte";
  import Prompt from "./sections/Prompt.svelte";
  import Genres from "./sections/Genres.svelte";

  const TABS = [
    { id: "status", label: "Status", component: Status },
    { id: "laeufe", label: "Läufe", component: Runs },
    { id: "aussortiert", label: "Aussortiert", component: Dropped },
    { id: "quellen", label: "Quellen & Venues", component: Sources },
    { id: "prompt", label: "Prompt & Regeln", component: Prompt },
    { id: "genres", label: "Genres", component: Genres },
  ];
  // Anchors of the earlier single-page Mischpult and of log.html / review.html, so old bookmarks still land.
  const ALIAS = {
    runs: "laeufe",
    log: "laeufe",
    review: "aussortiert",
    agendas: "quellen",
    venues: "quellen",
    festivals: "quellen",
    queries: "quellen",
    criteria: "prompt",
    bands: "prompt",
    links: "status",
  };
  const fromHash = (h) => {
    // A hand-typed or broken hash (#%E0) must not blank the console: safeDecode never throws.
    const id = safeDecode(String(h || "").replace(/^#/, "")).toLowerCase();
    const known = ALIAS[id] || id;
    return TABS.some((t) => t.id === known) ? known : "status";
  };

  let active = $state(fromHash(location.hash));
  // A tab stays mounted once opened (hidden when not active): filters and open details survive a switch,
  // and the GitHub files are fetched once.
  let opened = $state({ [active]: true });
  let files = $state.raw(null); // null while loading

  function show(id, { focus = false, replace = false } = {}) {
    active = id;
    opened = { ...opened, [id]: true };
    if (location.hash !== `#${id}`) {
      if (replace) history.replaceState(history.state, "", `#${id}`);
      else history.pushState(history.state, "", `#${id}`);
    }
    if (focus) document.getElementById(`tab-${id}`)?.focus();
  }

  function onHashChange() {
    const id = fromHash(location.hash);
    if (id !== active) show(id);
    // An alias or an unknown hash is rewritten to the tab it opened.
    if (location.hash !== `#${id}`) history.replaceState(history.state, "", `#${id}`);
  }

  function onKey(e) {
    const i = TABS.findIndex((t) => t.id === active);
    const next = {
      ArrowRight: (i + 1) % TABS.length,
      ArrowLeft: (i - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    show(TABS[next].id, { focus: true, replace: true });
  }

  function onClick(e, id) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // new tab/window
    e.preventDefault();
    show(id);
  }

  onMount(() => {
    onHashChange();
    Promise.all([
      tryJson(DATA.status),
      tryJson(DATA.runs),
      tryJson(DATA.shows),
      tryJson(DATA.venues),
      tryJson(DATA.genres),
      tryJson(DATA.artists),
    ]).then(([status, runs, shows, venues, genres, artists]) => {
      files = { status, runs, shows, venues, genres, artists };
    });
  });
</script>

<svelte:window onhashchange={onHashChange} onpopstate={onHashChange} />

<div class="stripe" aria-hidden="true"><span></span><span></span><span></span></div>
<header class="wrap head mp-head">
  <p class="logo" aria-hidden="true">
    <img class="logo-mark" src="img/logo/jahgenda.svg" alt="" width="48" height="48" /><span class="wordmark"
      ><span class="logo-word">Jah</span><span class="logo-word genda">genda</span></span
    >
  </p>
  <h1 class="mp-title">Mischpult</h1>
  <p class="mp-sub">Status, Läufe, Aussortiertes, Quellen und Regeln des Scrapers – nur über diesen Link.</p>
  <div class="mp-tabs" role="tablist" aria-label="Bereiche des Mischpults">
    {#each TABS as t (t.id)}
      <a
        role="tab"
        id="tab-{t.id}"
        href="#{t.id}"
        aria-selected={active === t.id}
        aria-controls="panel-{t.id}"
        tabindex={active === t.id ? 0 : -1}
        onclick={(e) => onClick(e, t.id)}
        onkeydown={onKey}>{t.label}</a
      >
    {/each}
  </div>
</header>

<main class="wrap mp">
  {#each TABS as t (t.id)}
    {#if opened[t.id]}
      <section
        role="tabpanel"
        id="panel-{t.id}"
        aria-labelledby="tab-{t.id}"
        tabindex="0"
        hidden={active !== t.id}
        class="mp-panel"
      >
        {#if files}
          <t.component {files} />
        {:else}
          <p class="mp-muted" role="status">Lade …</p>
        {/if}
      </section>
    {/if}
  {/each}
</main>

<footer class="foot mp-foot">
  <div class="foot-bar">
    <div class="wrap foot-bar-inner">
      <p class="foot-links">
        <a href="./">Agenda</a> ·
        <a href="https://github.com/markusbaumg/jahgenda" target="_blank" rel="noopener">GitHub</a> ·
        <a href="https://github.com/markusbaumg/jahgenda/commits/main/data" target="_blank" rel="noopener"
          >Änderungen an den Daten</a
        >
      </p>
    </div>
  </div>
</footer>
<div class="stripe bottom" aria-hidden="true"><span></span><span></span><span></span></div>
