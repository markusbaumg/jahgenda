<script>
  /* The Wann toggle in the toolbar: the calendar icon, the word «Wann» and a badge naming the range
   * («Heute», «Okt, Nov», «3 Monate»). Hidden when the data holds no show at all. */
  import { agenda } from "../../stores/agenda.svelte.js";
  import { ui } from "../../stores/filters.svelte.js";

  const active = $derived(ui.monthList.length > 0 && ui.rangeActive());
  const label = $derived(active ? ui.rangeLabel() : "");
</script>

<button
  type="button"
  id="toggle-when"
  class="icon-btn when"
  hidden={agenda.loadState === "ready" && !agenda.shows.length}
  aria-pressed={String(active)}
  aria-expanded={String(ui.openPanel === "when")}
  aria-controls="when-panel"
  title={active ? `Wann: ${label} (ändern)` : "Wann: Zeitraum wählen"}
  aria-label="Wann: {active ? label : 'alle kommenden'}"
  onclick={() => ui.togglePanel("when")}
>
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      fill="currentColor"
      d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zM6 8v12h12V8H6zm2 3h3v2H8v-2zm0 4h8v2H8v-2zm5-4h3v2h-3v-2z"
    />
  </svg>
  <span class="icon-word" aria-hidden="true">Wann</span>
  <b hidden={!active}>{label}</b>
</button>
