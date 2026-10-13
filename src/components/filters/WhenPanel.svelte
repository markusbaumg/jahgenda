<script>
  /* The Wann panel: quick picks (Heute · Morgen · Wochenende · 7 Tage – one exclusive choice that closes
   * the panel) and the month histogram (one bar per month over the whole span, counted with every filter
   * except the time; a multi-select that keeps the panel open), the count, «Zurücksetzen» and «Vergangene
   * einblenden». Ported from app.js updateWhen and the Wann click handler. */
  import { tick } from "svelte";
  import { agenda } from "../../stores/agenda.svelte.js";
  import { ui, QUICK, quickRange, monthKey, dm, nShows } from "../../stores/filters.svelte.js";
  import { monthFmt, monthStart, todayStart, sameDay } from "../../lib/dates.js";

  const f = agenda.filters;
  let months;
  let canScroll = $state(false);

  const open = $derived(ui.openPanel === "when");
  const thisMonth = $derived(monthStart(agenda.today || todayStart()));
  const bars = $derived.by(() => {
    if (!open) return [];
    const counts = new Map();
    for (const s of agenda.shows)
      if (agenda.matchesFilters(s)) counts.set(monthKey(s._day), (counts.get(monthKey(s._day)) || 0) + 1);
    const max = Math.max(1, ...counts.values());
    return ui.monthList.map((d, i) => {
      const k = monthKey(d);
      const n = counts.get(k) || 0;
      const past = d < thisMonth;
      const count = n === 1 ? "1 Show" : `${n} Shows`;
      return {
        k,
        n,
        past,
        cls: [
          "bar",
          !n && "empty",
          past && "past",
          f.months.size && !f.months.has(k) && "dim",
          k === monthKey(thisMonth) && "today",
        ]
          .filter(Boolean)
          .join(" "),
        aria: `${monthFmt.format(d)}, ${count}`,
        title: `${monthFmt.format(d)}: ${count}${past ? " (vergangen)" : ""} – anklicken zum Ein-/Ausschalten`,
        h: (n / max).toFixed(2),
        label: ui.monthLabel(d, i),
      };
    });
  });
  const active = $derived(ui.rangeActive());
  const pressed = (kind) => {
    if (f.months.size || !f.range) return false;
    const [a, b] = quickRange(kind);
    return sameDay(a, f.range[0]) && sameDay(b, f.range[1]);
  };
  const weekendTitle = $derived.by(() => {
    void agenda.today;
    const [a, b] = quickRange("weekend");
    return `Wochenende ${dm(a)}–${dm(b)} (Freitag bis Sonntag)`;
  });
  const whenCount = $derived.by(() => {
    if (!open || !ui.monthList.length) return "";
    const n = agenda.visible.length;
    return active ? `${nShows(n)} im Zeitraum` : n === 1 ? "1 kommende Show" : `Alle ${n} kommenden Shows`;
  });
  const pastCount = $derived(agenda.pastCount);

  $effect(() => {
    void bars;
    if (!open) return;
    tick().then(() => {
      if (months) canScroll = months.scrollWidth > months.clientWidth + 2;
    });
  });

  // A single-choice pick is done with one tap: the panel closes and the rows are in view. The focus goes
  // to the toggle, as after Escape.
  function pickQuick(kind) {
    ui.applyFilter(() => ui.pickQuick(kind));
    ui.setPanel(null);
    document.getElementById("toggle-when").focus({ preventScroll: true });
  }
</script>

<div id="when-panel" class="panel when-panel" role="group" aria-label="Wann" hidden={!open}>
  <div class="panel-head">
    <strong>Wann</strong>
    <button
      type="button"
      class="panel-close"
      data-close
      title="Schliessen"
      aria-label="Wann schliessen"
      onclick={() => ui.closePanel()}
    >
      &times;
    </button>
  </div>
  <div class="when-quick" role="group" aria-label="Schnellauswahl">
    {#each ["today", "tomorrow", "weekend", "7"] as kind (kind)}
      <button
        type="button"
        class="chip"
        data-quick={kind}
        aria-pressed={String(pressed(kind))}
        title={kind === "weekend"
          ? weekendTitle
          : { today: "Nur heute", tomorrow: "Nur morgen", 7: "Die nächsten 7 Tage" }[kind]}
        onclick={() => pickQuick(kind)}
      >
        {QUICK[kind]}
      </button>
    {/each}
  </div>
  <div
    id="when-months"
    class="when-months"
    class:can-scroll={canScroll}
    role="group"
    aria-label="Monate (Mehrfachauswahl)"
    bind:this={months}
  >
    {#each bars as b (b.k)}
      <button
        type="button"
        class={b.cls}
        data-month={b.k}
        aria-pressed={String(f.months.has(b.k))}
        aria-label={b.aria}
        title={b.title}
        style="--h:{b.h}"
        onclick={() => ui.applyFilter(() => ui.toggleMonth(b.k))}
        ><b>{b.n || ""}</b><i></i><span>{b.label}</span></button
      >
    {/each}
  </div>
  <p class="when-foot">
    <span id="when-count" aria-live="polite">{whenCount}</span>
    <button
      type="button"
      id="when-reset"
      class="linkish"
      title="Zeitraum zurücksetzen: alle kommenden Shows"
      onclick={() => ui.applyFilter(() => ui.resetWhen())}
    >
      Zurücksetzen
    </button>
    <label class="when-past" title="Auch Shows anzeigen, die schon vorbei sind" hidden={pastCount === 0}>
      <input
        type="checkbox"
        id="toggle-past"
        checked={f.showPast}
        onchange={(e) => {
          const on = e.currentTarget.checked;
          ui.applyFilter(() => ui.setShowPast(on));
        }}
      />
      Vergangene einblenden
    </label>
  </p>
</div>
