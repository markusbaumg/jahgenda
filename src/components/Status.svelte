<script>
  /* #status: the loading skeleton (six skeleton day groups in the final grid), the error state with its
   * retry, and the empty states. Copy and markup as in index.html / app.js. The filter-aware empty state
   * («Kein Dub im Tessin» with the fixes) is filters/EmptyState.svelte. */
  import { agenda } from "../stores/agenda.svelte.js";
  import EmptyState from "./filters/EmptyState.svelte";
  import { mine } from "../stores/marks.svelte.js";

  let { onretry } = $props();
  const offline = $derived(agenda.loadState === "error" && navigator.onLine === false);

  // The only recovery must be on screen: on a 320 px phone and in landscape the card (header + bar +
  // results row above it) ends below the fold – the page scrolls just far enough to show the button.
  function revealRetry() {
    const btn = document.getElementById("retry");
    const status = document.getElementById("status");
    const bar = document.getElementById("filters");
    if (!btn || !status) return;
    const below = btn.getBoundingClientRect().bottom + 16 - innerHeight;
    if (below <= 0) return;
    const underBar = status.getBoundingClientRect().top + window.scrollY - (bar ? bar.offsetHeight : 0) - 8;
    window.scrollTo({ top: Math.min(underBar, window.scrollY + below) });
  }
  $effect(() => {
    if (agenda.loadState !== "error") return;
    revealRetry();
    // The display face may still be loading: once it is in, the heading is a few px taller.
    document.fonts.ready.then(revealRetry);
    const t = setTimeout(revealRetry, 300);
    return () => clearTimeout(t);
  });
</script>

<div
  id="status"
  class="status{agenda.loadState === 'loading' ? ' loading' : ''}"
  role="status"
  hidden={agenda.loadState === "ready" && agenda.visible.length > 0}
>
  {#if agenda.loadState === "loading"}
    <p class="sr">Lade Shows …</p>
    <div class="shows skeleton" aria-hidden="true">
      {#each { length: 6 } as _}
        <section class="day">
          <span class="sk sk-date"></span>
          <ul class="day-shows">
            <li class="show">
              <div><span class="sk sk-bar"></span><span class="sk sk-bar short"></span></div>
              <span class="sk sk-badge"></span>
            </li>
          </ul>
        </section>
      {/each}
    </div>
  {:else if agenda.loadState === "error"}
    <!-- «Kein Empfang» only when the browser is really offline; a server or data error while online
         gets a title that matches, and both get a retry that needs no reload. -->
    <p class="state-icon">
      <svg viewBox="0 0 24 24" aria-hidden="true"
        ><path
          fill="currentColor"
          d="M2 7h20v14H2V7zm2 2v10h16V9H4zm3 2h2v6H7v-6zm4 0h2v6h-2v-6zm4 0h2v6h-2v-6zM12 3l5 3h-10l5-3z"
        /></svg
      >
    </p>
    <p class="big">{offline ? "Kein Empfang" : "Daten konnten nicht geladen werden"}</p>
    <p>
      {offline
        ? "Ohne Verbindung gibt es keine Agenda – sobald du wieder Netz hast, klappt es."
        : "Die Shows konnten nicht geladen werden. Bitte später nochmals versuchen."}
    </p>
    <button type="button" class="primary" id="retry" title="Shows nochmals laden" onclick={onretry}
      >Nochmals versuchen</button
    >
  {:else if !agenda.visible.length}
    {#if agenda.list}
      <p class="state-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"
          ><path
            fill="currentColor"
            d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"
          /></svg
        >
      </p>
      <p class="big">Diese Liste ist leer</p>
      <p>Keine der Shows ist mehr in der Agenda.</p>
      <button
        type="button"
        class="primary"
        id="reset"
        title="Zurück zur Agenda"
        onclick={() => mine.closeListMode()}>Zurück zur Agenda</button
      >
    {:else if !agenda.hasUpcoming}
      <p class="state-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"
          ><path fill="currentColor" d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zM6 8v12h12V8H6zm2 2h3v3H8v-3z" /></svg
        >
      </p>
      <p class="big">Noch nichts im Kalender</p>
      <p>Sobald der Scraper etwas findet, steht es hier.</p>
    {:else}
      <EmptyState />
    {/if}
  {/if}
</div>
