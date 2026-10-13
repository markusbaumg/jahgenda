<script>
  /* #status: the loading skeleton (six skeleton day groups in the final grid), the error state with its
   * retry, and the empty states. Copy and markup as in index.html / app.js. The filter-aware empty state
   * («Kein Dub im Tessin» with the fixes) arrives with the filter bar story. */
  import { agenda } from "../stores/agenda.svelte.js";

  let { onretry } = $props();
  const offline = $derived(agenda.loadState === "error" && navigator.onLine === false);
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
    {#if !agenda.hasUpcoming}
      <p class="state-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"
          ><path fill="currentColor" d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zM6 8v12h12V8H6zm2 2h3v3H8v-3z" /></svg
        >
      </p>
      <p class="big">Noch nichts im Kalender</p>
      <p>Sobald der Scraper etwas findet, steht es hier.</p>
    {:else}
      <!-- Sun over mountains in the brand line weight (logo 06 «Alpen & Sonne», design/logos.html). -->
      <p class="state-icon">
        <svg
          viewBox="0 0 64 64"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          ><circle cx="42" cy="21" r="8" /><path
            d="M42 5v4M42 33v4M26 21h4M54 21h4M30.7 9.7l2.8 2.8M50.5 29.5l2.8 2.8M53.3 9.7l-2.8 2.8M30.7 32.3l2.8-2.8"
          /><path d="M4 56 22 28l10 16 8-10 20 22" /><path
            d="M19.5 32l2.5-2.5 2.5 2.5M37.5 37l2.5-2.5 2.5 2.5"
          /><path d="M4 56h56" /></svg
        >
      </p>
      <p class="big">Nichts für diese Auswahl</p>
      <p>Für diese Auswahl gibt es gerade nichts.</p>
    {/if}
  {/if}
</div>
