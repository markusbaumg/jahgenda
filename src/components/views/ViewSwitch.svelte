<script>
  /* Liste | Kalender | Karte: the segmented control of the results row. A switch is a history entry of its
   * own (Back returns from it) and writes #view=calendar / #view=map next to the filters. */
  import { views } from "../../stores/views.svelte.js";

  function pick(v) {
    if (v !== views.view) views.setView(v, { push: true });
  }
</script>

<span id="view-switch" class="seg" role="group" aria-label="Ansicht">
  <button
    type="button"
    data-view="list"
    aria-pressed={views.view === "list"}
    title="Als Liste anzeigen"
    onclick={() => pick("list")}
  >
    <svg
      class="ico"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <line x1="8" x2="21" y1="6" y2="6" />
      <line x1="8" x2="21" y1="12" y2="12" />
      <line x1="8" x2="21" y1="18" y2="18" />
      <line x1="3" x2="3.01" y1="6" y2="6" />
      <line x1="3" x2="3.01" y1="12" y2="12" />
      <line x1="3" x2="3.01" y1="18" y2="18" /></svg
    ><span>Liste</span>
  </button>
  <button
    type="button"
    data-view="calendar"
    aria-pressed={views.view === "calendar"}
    title="Als Kalender anzeigen"
    onclick={() => pick("calendar")}
  >
    <svg
      class="ico"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 14h.01" />
      <path d="M12 14h.01" />
      <path d="M16 14h.01" />
      <path d="M8 18h.01" />
      <path d="M12 18h.01" />
      <path d="M16 18h.01" /></svg
    ><span>Kalender</span>
  </button>
  <button
    type="button"
    data-view="map"
    aria-pressed={views.view === "map"}
    title="Auf der Karte anzeigen"
    onclick={() => pick("map")}
  >
    <svg
      class="ico"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path
        d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"
      />
      <path d="M15 5.764v15" />
      <path d="M9 3.236v15" /></svg
    ><span>Karte</span>
  </button>
</span>
