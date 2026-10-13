<script>
  /* The date cell of a festival card (§3.7): «FR–SO» over «16–18»; across a month boundary «30» over
   * «–1.8.»; a gold «LÄUFT» pill in the DOW slot while it runs. The aria-label and datetime="a/b" name
   * the whole range (festival-spec.md). Ported from the festival branch of app.js renderDays(). */
  import "./festival.css";
  import { dow, fullDayFmt } from "../../lib/dates.js";

  let { show: s } = $props();

  const d = $derived(s._day);
  const end = $derived(s._end);
  const sameMonth = $derived(d.getMonth() === end.getMonth() && d.getFullYear() === end.getFullYear());
  const label = $derived(`${s._now ? "Läuft, " : ""}${fullDayFmt.format(d)} bis ${fullDayFmt.format(end)}`);
</script>

<time class="date" datetime="{s.date}/{s.end_date}" aria-label={label}
  >{#if s._now}<span class="dow now live">Läuft</span>{:else}<span class="dow range">{dow(d)}–{dow(end)}</span
    >{/if}{#if sameMonth}<span class="num range">{d.getDate()}–{end.getDate()}</span>{:else}<span
      class="num range">{d.getDate()}</span
    ><span class="day-end">–{end.getDate()}.{end.getMonth() + 1}.</span>{/if}</time
>
