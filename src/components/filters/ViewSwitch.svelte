<script>
  /* The segmented control Liste | Kalender | Karte. A switch writes #view=calendar / #view=map (nothing
   * for the list) next to the filters and pushes a history entry of its own (Back returns). */
  import { ui } from "../../stores/filters.svelte.js";
  import { t } from "../../i18n/i18n.svelte.js";

  function pick(v) {
    if (v !== ui.view) ui.setView(v, { push: true });
  }
</script>

<span id="view-switch" class="seg" role="group" aria-label={t("view.label")}>
  <button
    type="button"
    data-view="list"
    aria-pressed={String(ui.view === "list")}
    title={t("view.listTitle")}
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
    ><span>{t("view.list")}</span>
  </button>
  <button
    type="button"
    data-view="calendar"
    aria-pressed={String(ui.view === "calendar")}
    title={t("view.calendarTitle")}
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
    ><span>{t("view.calendar")}</span>
  </button>
  <button
    type="button"
    data-view="map"
    aria-pressed={String(ui.view === "map")}
    title={t("view.mapTitle")}
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
    ><span>{t("view.map")}</span>
  </button>
</span>
