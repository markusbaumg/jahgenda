<script>
  /* The Wo panel: «Mein Standort» (+ the radius once the position is known), the status line under it
   * («Suche dich …», the nearest show with its distance and the SBB link, or why there is no position),
   * and the canton chips – a multi-select with counts, grouped Deutschschweiz · Romandie · Ticino ·
   * Grenznah, A–Z inside a group; cantons without an upcoming show are not listed. Choosing does not
   * close the panel. Ported from app.js (init's canton chips, updateWhere, locate). */
  import { agenda } from "../../stores/agenda.svelte.js";
  import { ui } from "../../stores/filters.svelte.js";
  import { REGIONS, ABROAD, regionName, shortRegion } from "../../lib/regions.js";
  import { formatKm, sbbUrl } from "../../lib/index.js";
  import ChipCount from "./ChipCount.svelte";

  const f = agenda.filters;
  const RADII = [10, 25, 50];

  const ready = $derived(agenda.loadState === "ready");
  const groups = $derived.by(() => {
    const upcoming = new Set(agenda.shows.filter((s) => !s._past).map((s) => s.canton));
    return REGIONS.map(([name, codes]) => [
      name,
      codes.filter((c) => upcoming.has(c)).sort((a, b) => shortRegion(a).localeCompare(shortRegion(b), "de")),
    ]).filter(([, codes]) => codes.length);
  });
  const count = (code) => agenda.countWith({ cantons: new Set(code ? [code] : []) });
  const nShows = (n) => `${n} ${n === 1 ? "Show" : "Shows"}`;

  function pickCanton(code) {
    ui.applyFilter(() => (code ? ui.toggleCanton(code) : ui.clearCantons()));
  }
  function pickRadius(km) {
    ui.applyFilter(() => ui.setRadius(km));
  }
  const near = $derived(ui.geoNear);
  const sbb = $derived(near ? sbbUrl(near.s, agenda.homeCity) : "");
</script>

<div
  id="where-panel"
  class="panel where-panel"
  role="group"
  aria-label="Wo"
  hidden={ui.openPanel !== "where"}
>
  <div class="panel-head">
    <strong>Wo</strong>
    <button
      type="button"
      class="panel-close"
      data-close
      title="Schliessen"
      aria-label="Wo schliessen"
      onclick={() => ui.closePanel()}
    >
      &times;
    </button>
  </div>
  <div class="where-row">
    <button
      type="button"
      id="locate"
      class="chip where-locate"
      class:locating={ui.locating}
      class:active={ui.located}
      hidden={!ui.hasGeo()}
      disabled={ui.locating}
      aria-pressed={String(ui.located)}
      title="Meinen Standort verwenden und Distanzen anzeigen"
      onclick={() => ui.locate()}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.9 3A9 9 0 0 0 13 3.1V1h-2v2.1A9 9 0 0 0 3.1 11H1v2h2.1A9 9 0 0 0 11 20.9V23h2v-2.1a9 9 0 0 0 7.9-7.9H23v-2h-2.1zM12 19a7 7 0 1 1 0-14 7 7 0 0 1 0 14z"
        />
      </svg>
      Mein Standort
    </button>
    <span class="where-radius" id="where-radius" role="group" aria-label="Umkreis" hidden={!agenda.here}>
      {#each RADII as km (km)}
        <button
          type="button"
          class="chip"
          data-radius={km}
          aria-pressed={String(f.radius === km)}
          title="Nur Shows im Umkreis von {km} km"
          onclick={() => pickRadius(km)}
        >
          {km} km
        </button>
      {/each}
      <button
        type="button"
        class="chip"
        data-radius="0"
        aria-pressed={String(f.radius === 0)}
        title="Alle Distanzen"
        onclick={() => pickRadius(0)}
      >
        Alle Distanzen
      </button>
    </span>
  </div>
  <p id="geo-status" class="geo-status" role="status">
    {#if near}<svg class="geo-pin" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"
        ><path
          fill="currentColor"
          d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"
        /></svg
      ><span class="sr">Standort gefunden. </span>Am nächsten bei dir:
      <a href="#{near.s._short}" title="Zur Show in der Liste springen"><strong>{near.s.title}</strong></a>, {near.when}
      in {near.s.city} ·
      <span class="dist" title="Luftlinie von deinem Standort"
        >{formatKm(near.km)}{#if sbb}<a
            class="sbb"
            href={sbb}
            target="_blank"
            rel="noopener"
            title="SBB-Fahrplan {agenda.homeCity} → {near.s.city}, Ankunft eine Stunde vor der Show"
            aria-label="SBB-Fahrplan nach {near.s.city}">SBB</a
          >{/if}</span
      >{:else}{ui.geoText}{/if}
  </p>
  <div id="canton-chips" class="canton-chips" role="group" aria-label="Kantone (Mehrfachauswahl)">
    {#if ready}
      {@const all = count("")}
      <button
        type="button"
        class="chip"
        class:is-empty={all === 0 && f.cantons.size > 0}
        data-canton=""
        aria-pressed={String(!f.cantons.size)}
        title="Alle Kantone anzeigen ({all})"
        onclick={() => pickCanton("")}>Alle</button
      >
      {#each groups as [name, codes] (name)}
        <div class="canton-group" role="group" aria-label={name}>
          <span class="group-label">{name}</span>
          {#each codes as c (c)}
            {@const n = count(c)}
            {@const on = f.cantons.has(c)}
            <button
              type="button"
              class="chip{ABROAD[c] ? ' abroad' : ''}"
              class:is-empty={n === 0 && !on}
              data-canton={c}
              aria-pressed={String(on)}
              title="{regionName(c)}: {nShows(n)} – anklicken zum Ein-/Ausschalten"
              onclick={() => pickCanton(c)}
              ><img src="img/cantons/{c}.svg" alt="" width="14" height="16" />{shortRegion(c)}<small
                ><ChipCount {n} /></small
              ></button
            >
          {/each}
        </div>
      {/each}
    {/if}
  </div>
</div>
