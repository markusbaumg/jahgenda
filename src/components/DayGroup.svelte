<script>
  /* Day groups (§3.5): one <section class="day"> per date with a single <time> cell that every show of
   * that day shares. Today and tomorrow get a red HEUTE / MORGEN pill in the DOW slot while the data is
   * fresh; Fr/Sa/So of the coming weekend get a red DOW and, in the list, a «Wochenende» rule before the
   * first of them. A festival (§3.7) is a card of its own with a range date cell, never grouped with the
   * day's shows. Ported from app.js renderDays(). */
  import Row from "./Row.svelte";
  import { agenda } from "../stores/agenda.svelte.js";
  import { addDays, sameDay, weekendRange, dow, fullDayFmt } from "../lib/dates.js";

  let { items, weekendRule = false, indexOf = () => 0, geoHintId = "" } = $props();

  const today = $derived(agenda.today);
  const tomorrow = $derived(addDays(today, 1));
  const weekend = $derived(weekendRange(today));
  const fresh = $derived(agenda.isFresh());

  const groups = $derived.by(() => {
    const days = new Map();
    for (const s of items) {
      const key = s._end ? `${s.date}/${s.id}` : s.date;
      if (!days.has(key)) days.set(key, []);
      days.get(key).push(s);
    }
    const [wkStart, wkEnd] = weekend;
    let ruleDue = weekendRule;
    return [...days.values()].map((rows) => {
      const s0 = rows[0];
      const d = s0._day;
      const end = s0._end || d;
      const isToday = sameDay(d, today);
      const isTomorrow = sameDay(d, tomorrow);
      const inWeekend = d <= wkEnd && end >= wkStart;
      const cls = ["day"];
      if (s0._past) cls.push("past");
      if (inWeekend) cls.push("weekend");
      if (isToday) cls.push("today");
      if (s0._end) cls.push("festival");
      let rule = false;
      if (ruleDue && inWeekend) {
        ruleDue = false;
        rule = true;
      }
      const g = { rows, s0, d, end, cls: cls.join(" "), rule, pill: "", label: "", datetime: s0.date };
      if (s0._end) {
        // «FR–SO» over «16–18»; across a month boundary «30» over «–1.8.»; «LÄUFT» while it runs.
        g.sameMonth = d.getMonth() === end.getMonth() && d.getFullYear() === end.getFullYear();
        g.label = `${s0._now ? "Läuft, " : ""}${fullDayFmt.format(d)} bis ${fullDayFmt.format(end)}`;
        g.datetime = `${s0.date}/${s0.end_date}`;
      } else {
        g.pill = fresh && (isToday || isTomorrow) ? (isToday ? "Heute" : "Morgen") : "";
        // The aria-label replaces the cell's text for screen readers, so the pill word goes in front of it.
        g.label = `${g.pill ? `${g.pill}, ` : ""}${fullDayFmt.format(d)}`;
      }
      return g;
    });
  });
</script>

{#each groups as g (g.s0._end ? `${g.s0.date}/${g.s0.id}` : g.s0.date)}
  {#if g.rule}
    <p class="rule-weekend"><span>Wochenende</span></p>
  {/if}
  <section class={g.cls} data-date={g.s0.date}>
    <time class="date" datetime={g.datetime} aria-label={g.label}
      >{#if g.s0._end}{#if g.s0._now}<span class="dow now live">Läuft</span>{:else}<span class="dow range"
            >{dow(g.d)}–{dow(g.end)}</span
          >{/if}{#if g.sameMonth}<span class="num range">{g.d.getDate()}–{g.end.getDate()}</span>{:else}<span
            class="num range">{g.d.getDate()}</span
          ><span class="day-end">–{g.end.getDate()}.{g.end.getMonth() + 1}.</span
          >{/if}{:else}{#if g.pill}<span class="dow now">{g.pill}</span>{:else}<span class="dow"
            >{dow(g.d)}</span
          >{/if}<span class="num">{g.d.getDate()}</span>{/if}</time
    >
    <ul class="day-shows">
      {#each g.rows as s (s.id)}
        <Row show={s} index={indexOf(s)} geoHint={!geoHintId || geoHintId === s.id} />
      {/each}
    </ul>
  </section>
{/each}
