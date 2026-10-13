<script>
  /* The list view: month groups, keyed sortably; a festival sits in its start month and leaves a ghost
   * row («↳ … läuft noch bis So 1. Aug.») at the top of every later month it touches – creating that
   * month if needed. Ported from the list branch of app.js renderInner(). */
  import DayGroup from "./DayGroup.svelte";
  import { agenda, isFestival } from "../stores/agenda.svelte.js";
  import { ui } from "../stores/filters.svelte.js";
  import {
    monthStart,
    addDays,
    monthKeyPadded,
    monthNameFmt,
    weekendRange,
    endLabel,
    todayStart,
  } from "../lib/dates.js";

  let { shows } = $props();

  const groups = $derived.by(() => {
    const map = new Map();
    const group = (d) => {
      const key = monthKeyPadded(d);
      if (!map.has(key)) map.set(key, { key, first: monthStart(d), items: [], ghosts: [] });
      return map.get(key);
    };
    for (const s of shows) group(s._day).items.push(s);
    for (const s of shows.filter(isFestival)) {
      for (
        let m = monthStart(addDays(monthStart(s._day), 32));
        m <= s._end;
        m = addDays(m, 32), m = monthStart(m)
      )
        group(m).ghosts.push(s);
    }
    // The «Wochenende» rule is drawn once, before the first day of the coming weekend – not while a
    // Heute / Morgen / Wochenende quick pick already says which days these are.
    const [wkStart, wkEnd] = weekendRange(agenda.today || todayStart());
    let ruleDue = !["today", "tomorrow", "weekend"].includes(ui.quickActive());
    return [...map.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((g) => {
        const weekendRule = ruleDue && g.items.some((s) => s._day >= wkStart && s._day <= wkEnd);
        if (weekendRule) ruleDue = false;
        return { ...g, weekendRule };
      });
  });
  // Motion (§4): the first ten rows enter one --stagger apart (CSS: .enter + --i).
  const position = $derived(new Map(shows.map((s, i) => [s.id, i])));
  const indexOf = (s) => position.get(s.id) ?? 0;
  // On a touch screen the «Distanz & Zug anzeigen» placeholder stands once, in the first row with a
  // position (98 identical lines made most rows a line longer).
  const coarse = typeof matchMedia === "function" && matchMedia("(hover: none)").matches;
  const geoHintId = $derived(
    coarse ? (shows.find((s) => typeof s.lat === "number" && typeof s.lon === "number") || {}).id || "" : "",
  );

  // Sticky month heads: a 1 px gold hairline draws in while a head is stuck under the bar (§4). The
  // observer looks at the heads of the current render; a head is stuck once its top meets the bar. The
  // bar height is read from a head's resolved sticky `top` (the --bar-h token is a calc() string, which
  // would parse as NaN); a head that is not sticky at all (max-height: 500px) is left alone.
  $effect(() => {
    void groups; // a new set of month heads after every filter change
    if (!("IntersectionObserver" in window)) return;
    const heads = document.querySelectorAll("#list .month");
    if (!heads.length) return;
    const bar = parseFloat(getComputedStyle(heads[0]).top);
    if (!(bar >= 0)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const r = e.boundingClientRect;
          // Stuck: partly cut by the bar's edge, its top at the bar, its bottom still below it. A head
          // inside a month that content-visibility has skipped reports an empty box and is never stuck.
          e.target.classList.toggle("stuck", e.intersectionRatio < 1 && r.top <= bar + 1 && r.bottom > bar);
        }
      },
      { threshold: [1], rootMargin: `-${Math.round(bar) + 1}px 0px 0px 0px` },
    );
    for (const h of heads) observer.observe(h);
    return () => observer.disconnect();
  });
</script>

{#each groups as g (g.key)}
  <section style="--rows: {g.items.length}">
    <h2 class="month">{monthNameFmt.format(g.first)} <span class="year">{g.first.getFullYear()}</span></h2>
    <div class="shows">
      {#each g.ghosts as s (s.id)}
        <p class="ghost">
          <a href="#{s._short}" title="Zum Festival in der Liste springen"
            ><span class="arrow" aria-hidden="true">↳</span> {s.title} läuft noch bis {endLabel(s)}</a
          >
        </p>
      {/each}
      <DayGroup items={g.items} weekendRule={g.weekendRule} {indexOf} {geoHintId} />
    </div>
  </section>
{/each}
