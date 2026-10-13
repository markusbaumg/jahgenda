<script>
  /* No markup: the page's URL and history glue for the filters (story #33 M1, ported from app.js).
   * - The filter state lives in the hash (#q=…&g=…&f=…&wo=…&r=…&wann=…&past=1&view=…), written with
   *   replaceState on every change (a filter tap never adds a history entry), read once when the data is
   *   in, applied again when such a hash arrives on the open page.
   * - Back closes an open panel and returns from a view switch (popstate).
   * - Reload, tab restore and Back from log.html land where the visitor was: the scroll offset travels in
   *   the history entry and is restored after the first render (the browser's own restoration lands in
   *   the skeleton and scroll anchoring then drags the visitor to the footer).
   * - The rows' canton badge toggles the Wo filter; their «Distanz & Zug anzeigen» asks for the position. */
  import { tick } from "svelte";
  import { agenda } from "../../stores/agenda.svelte.js";
  import { ui, parseHash } from "../../stores/filters.svelte.js";

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  let savedScrollY = history.state && history.state.jah ? Number(history.state.sy) || 0 : 0;
  history.replaceState(ui.histState(), "");

  const rememberScroll = () => {
    if (!history.state || !history.state.jah || history.state.sy === Math.round(window.scrollY)) return;
    try {
      history.replaceState({ ...history.state, sy: Math.round(window.scrollY) }, "");
    } catch {
      /* Safari caps replaceState at 100 per 30 s – then the last written offset stands */
    }
  };
  // Written once the scrolling stops (a reload discards what pagehide writes) and when the tab goes away.
  let scrollMemo = 0;
  function onScroll() {
    clearTimeout(scrollMemo);
    scrollMemo = setTimeout(rememberScroll, 400);
  }
  function onVisibility() {
    if (document.visibilityState === "hidden") rememberScroll();
  }

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
  $effect(() => {
    if (!ready || landed) return;
    landed = true;
    tick().then(() => {
      const h = parseHash();
      if (savedScrollY && !h.id && !h.mine) window.scrollTo(0, savedScrollY); // back to the rows the visitor saw
      savedScrollY = 0;
      ui.autoLocate();
    });
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

<svelte:window onscroll={onScroll} onpagehide={rememberScroll} onpopstate={(e) => ui.onPopState(e)} />
<svelte:document onvisibilitychange={onVisibility} onclick={onClick} />
