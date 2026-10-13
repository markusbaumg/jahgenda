<script>
  /* The sticky filter bar (form#filters): search with the mini-brand, the Wo / Wann / ★ toggles, the genre
   * chip row and the two dropdown panels hanging from the bar. Two rows of frozen height (48 + 36 px,
   * 56 + 40 px from 768 px): nothing in it may grow after the data arrives. Markup, ids and copy as in the
   * vanilla index.html; behaviour ported from app.js (setPanel, the sticky bar, the search). */
  import { onMount } from "svelte";
  import { agenda } from "../../stores/agenda.svelte.js";
  import { ui } from "../../stores/filters.svelte.js";
  import GenreChips from "./GenreChips.svelte";
  import WherePanel from "./WherePanel.svelte";
  import WhenPanel from "./WhenPanel.svelte";
  import WhereToggle from "./WhereToggle.svelte";
  import WhenToggle from "./WhenToggle.svelte";
  import MineToggle from "../mine/MineToggle.svelte";
  import ListHead from "../mine/ListHead.svelte";
  import { mine } from "../../stores/marks.svelte.js";

  let form;

  // Search: debounced 120 ms so typing does not re-filter on every key.
  let searchTimer = 0;
  function onSearch(e) {
    const value = e.currentTarget.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => ui.applyFilter(() => (agenda.filters.q = value)), 120);
  }

  // Mini-brand in the stuck bar: back to the top, without touching the hash (deep links stay intact).
  function toTop(e) {
    e.preventDefault();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }

  function onKeydown(e) {
    if (e.key === "Escape" && ui.openPanel) ui.closePanel();
  }
  // Close with a click / tap outside. A chip that re-rendered itself on click is detached by now – that
  // is not an outside click.
  function onDocClick(e) {
    if (ui.openPanel && e.target.isConnected && form && !form.contains(e.target)) ui.setPanel(null);
  }
  const refit = () => ui.openPanel && ui.fitPanel();

  onMount(() => {
    // Shadow and tricolor edge only once the bar is actually stuck.
    const sentinel = document.getElementById("stuck-sentinel");
    if (!("IntersectionObserver" in window) || !sentinel) return;
    const io = new IntersectionObserver(([entry]) => form.classList.toggle("stuck", !entry.isIntersecting));
    io.observe(sentinel);
    return () => io.disconnect();
  });
</script>

<svelte:document onkeydown={onKeydown} onclick={onDocClick} />
<svelte:window onscroll={refit} onresize={refit} />

<!-- Sticky filter bar: two rows of frozen height. Wo and Wann are dropdown panels hanging from the bar
     (one open at a time). -->
<form
  class="filters"
  id="filters"
  role={mine.listMode ? "region" : "search"}
  aria-labelledby={mine.listMode ? "list-title" : undefined}
  onsubmit={(e) => e.preventDefault()}
  bind:this={form}
>
  <ListHead />
  <div class="toolbar">
    <label class="sr" for="q">Suche</label>
    <div class="search">
      <a
        class="mini-brand"
        href="./"
        aria-label="Zum Anfang"
        title="Zum Anfang: Agenda ohne Filter"
        onclick={toTop}><img src="img/logo/jahgenda.svg" alt="" width="22" height="22" /></a
      >
      <svg class="search-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          fill="currentColor"
          d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"
        />
      </svg>
      <input
        id="q"
        type="search"
        placeholder="Band, Club, Ort …"
        autocomplete="off"
        title="Nach Band, Club oder Ort suchen"
        value={agenda.filters.q}
        oninput={onSearch}
      />
    </div>
    <WhereToggle />
    <WhenToggle />
    <MineToggle />
  </div>
  <GenreChips />
  <WherePanel />
  <WhenPanel />
</form>
