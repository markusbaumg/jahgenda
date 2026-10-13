<script>
  /* Kalender: a Monday-first month grid of the filtered shows. Desktop cells carry a pill per show (a tap
   * jumps to the row in the list); on narrow screens the cells only show up to three dots and the shows
   * of the selected day are listed below the grid (style.css). Dots and pills by genre colour, a legend,
   * arrows bounded to the months with shows, «Heute», a note for an empty month. Ported from app.js
   * renderCalendar() and its click handler. */
  import DayGroup from "../DayGroup.svelte";
  import Icon from "../Icon.svelte";
  import { tick } from "svelte";
  import { agenda } from "../../stores/agenda.svelte.js";
  import { views } from "../../stores/views.svelte.js";
  import { showSubscribe } from "./subscribe.js";
  import { quietScroll } from "./scroll.js";
  import { pad2, parseDay } from "../../lib/text.js";
  import { addDays, monthFmt, monthStart, dow, todayStart } from "../../lib/dates.js";

  let {
    shows, // the filtered shows (the same the list shows)
    active = false, // the calendar is the view on screen (otherwise it renders nothing)
    marks = {}, // { id: "interested" | "going" } – Meine Shows
  } = $props();

  let root = $state();

  // Pill / dot colour per show: ska family red, dub & soundsystem green, everything else gold.
  const GENRE_COLORS = {
    ska: "var(--red)",
    "ska-punk": "var(--red)",
    rocksteady: "var(--red)",
    dub: "var(--green-text)",
    soundsystem: "var(--green-text)",
  };
  const genreColor = (s) =>
    s._end ? "var(--gold)" : GENRE_COLORS[s.genres.find((g) => GENRE_COLORS[g])] || "var(--gold)";
  const dayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const longDayFmt = new Intl.DateTimeFormat("de-CH", { weekday: "long", day: "numeric", month: "long" });
  const shortDate = (d) => `${dow(d)} ${d.getDate()}.${d.getMonth() + 1}.`;
  const nShows = (n) => `${n} ${n === 1 ? "Show" : "Shows"}`;
  const going = (s) => marks[s.id] === "going";

  const today = $derived(agenda.today || todayStart());
  const todayKey = $derived(dayKey(today));
  const month = $derived(views.calMonth || monthStart(today));
  const monthKey = $derived(`${month.getFullYear()}-${pad2(month.getMonth() + 1)}`);
  const inMonth = (k) => k.startsWith(monthKey);

  // Every month from the first show (or today) to the last show (or today) – the arrows stay inside.
  const monthBounds = $derived.by(() => {
    const all = agenda.shows;
    if (!all.length) return [null, null];
    const first = monthStart(all[0]._day < today ? all[0]._day : today);
    const lastDay = all[all.length - 1]._day;
    return [first, monthStart(lastDay > today ? lastDay : today)];
  });

  // A festival is on the grid on each of its days.
  const byDay = $derived.by(() => {
    const map = new Map();
    for (const s of shows) {
      for (let d = s._day; d <= (s._end || s._day); d = addDays(d, 1)) {
        const key = dayKey(d);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(s);
      }
    }
    return map;
  });

  // Selected day: next day with shows from today on, else today, else the first day with shows.
  const selDay = $derived.by(() => {
    if (inMonth(views.calDay)) return views.calDay;
    const withShows = [...byDay.keys()].filter(inMonth).sort();
    return (
      withShows.find((k) => k >= todayKey) ||
      (inMonth(todayKey) ? todayKey : withShows[0] || `${monthKey}-01`)
    );
  });

  const cells = $derived.by(() => {
    const y = month.getFullYear();
    const m = month.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const start = new Date(y, m, 1 - ((first.getDay() + 6) % 7));
    const end = new Date(y, m, last.getDate() + ((7 - last.getDay()) % 7));
    const out = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = dayKey(d);
      const items = byDay.get(key) || [];
      const wd = d.getDay();
      const other = d.getMonth() !== m;
      const cls = ["cal-cell"];
      if (other) cls.push("other");
      if (key === todayKey) cls.push("today");
      if (key === selDay) cls.push("selected");
      if (d < today) cls.push("past");
      if (wd === 0 || wd === 5 || wd === 6) cls.push("weekend");
      const label = `${longDayFmt.format(d)}${items.length ? `, ${nShows(items.length)}` : ""}`;
      out.push({ key, num: d.getDate(), items, other, cls: cls.join(" "), label });
    }
    return out;
  });

  const selected = $derived(byDay.get(selDay) || []);
  const prevOk = $derived(Boolean(monthBounds[0] && month > monthBounds[0]));
  const nextOk = $derived(Boolean(monthBounds[1] && month < monthBounds[1]));
  // An empty month says so and points to the next (or the last) show.
  const emptyMonth = $derived(![...byDay.keys()].some(inMonth));
  const after = $derived(shows.find((s) => s._day >= new Date(month.getFullYear(), month.getMonth() + 1, 1)));
  const before = $derived([...shows].reverse().find((s) => s._day < month));
  const pointTo = $derived(after || before);
  const anyGoing = $derived(shows.some(going));
  // On a touch screen the «Distanz & Zug anzeigen» placeholder stands once (as in the list).
  const coarse = typeof matchMedia === "function" && matchMedia("(hover: none)").matches;
  const geoHintId = $derived(
    coarse
      ? (selected.find((s) => typeof s.lat === "number" && typeof s.lon === "number") || {}).id || ""
      : "",
  );

  function nav(step) {
    const t = todayStart();
    if (step) {
      views.calMonth = new Date(month.getFullYear(), month.getMonth() + step, 1);
    } else {
      views.calMonth = new Date(t.getFullYear(), t.getMonth(), 1);
      views.calDay = dayKey(t);
    }
  }

  function onclick(e) {
    const pill = e.target.closest(".pill, .cal-month-empty a[data-id]");
    if (pill) {
      e.preventDefault();
      return views.goToShow(pill.dataset.id);
    }
    if (e.target.closest("[data-cal], [data-subscribe]")) return; // their own handlers
    // The whole day cell selects the day (the number button stays for keyboard and screen readers);
    // a day of the neighbouring month turns the page to that month.
    const cell = e.target.closest("[data-day]");
    if (!cell) return;
    const key = cell.dataset.day;
    views.calDay = key;
    if (cell.classList.contains("other")) views.calMonth = monthStart(parseDay(key));
    const hadFocus = cell.contains(document.activeElement);
    tick().then(() => {
      // The grid may have been rebuilt: a keyboard user keeps the focus on the day just chosen (§5).
      if (hadFocus) {
        const btn = root.querySelector(`[data-day="${key}"] .cal-num`);
        if (btn && btn.focus) btn.focus({ preventScroll: true });
      }
      // On the phone the day's shows are listed under the grid – below the fold: bring them up, but only
      // as far as needed (the grid stays on screen while flicking through days, unless the day's list is
      // taller than the room under the bar).
      const day = root.querySelector(".cal-day");
      if (day && getComputedStyle(day).display !== "none") {
        const r = day.getBoundingClientRect();
        const room = innerHeight - 16;
        if (r.top > innerHeight - 120) {
          quietScroll(1500);
          const bar = document.getElementById("filters");
          const by = Math.min(r.bottom - room, r.top - (bar ? bar.offsetHeight : 0) - 40);
          const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
          if (by > 0) window.scrollBy({ top: by, behavior: reduce ? "auto" : "smooth" });
        }
      }
    });
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (the day buttons carry the keyboard) -->
<div id="calendar" class="calendar" hidden={!active} bind:this={root} {onclick}>
  {#if active}
    <div class="cal-head rule-tri">
      <button
        type="button"
        class="cal-nav"
        data-cal="-1"
        aria-label="Vorheriger Monat"
        title="Vorheriger Monat"
        disabled={!prevOk}
        onclick={() => nav(-1)}>&lsaquo;</button
      >
      <h2 class="cal-title">{monthFmt.format(month)}</h2>
      <button
        type="button"
        class="cal-nav"
        data-cal="1"
        aria-label="Nächster Monat"
        title="Nächster Monat"
        disabled={!nextOk}
        onclick={() => nav(1)}>&rsaquo;</button
      >
      <button
        type="button"
        class="linkish cal-today"
        data-cal="0"
        title="Zum aktuellen Monat springen"
        onclick={() => nav(0)}>Heute</button
      >
      <button
        type="button"
        class="linkish cal-subscribe"
        data-subscribe
        title="Alle Shows als Kalender abonnieren – aktualisiert sich von selbst"
        onclick={(e) => {
          e.preventDefault();
          showSubscribe(true);
        }}><Icon name="rss" /> Abonnieren</button
      >
    </div>
    <div class="cal-grid">
      {#each ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as w}<span class="cal-dow">{w}</span>{/each}
      {#each cells as c (c.key)}
        <div class={c.cls} data-day={c.key}>
          {#if c.other}
            <span class="cal-num" aria-hidden="true">{c.num}</span>
          {:else}
            <button
              type="button"
              class="cal-num"
              aria-pressed={c.key === selDay}
              aria-label={c.label}
              title="Tag auswählen: {c.label}">{c.num}</button
            >
          {/if}
          <span class="cal-dots" aria-hidden="true"
            >{#each c.items.slice(0, 3) as s}<i
                class={going(s) ? "going" : ""}
                style="background:{genreColor(s)}"
              ></i>{/each}</span
          >
          <div class="cal-pills">
            {#each c.items as s}<button
                type="button"
                class="pill{going(s) ? ' going' : ''}"
                data-id={s.id}
                style="--pill:{genreColor(s)}"
                title="{s.title} · {s.venue}, {s.city} – zur Show in der Liste springen"
                >{going(s) ? "★ " : ""}{s.title}</button
              >{/each}
          </div>
        </div>
      {/each}
    </div>
    {#if emptyMonth}
      <p class="cal-empty cal-month-empty">
        Keine Shows im {monthFmt.format(month)}.{#if pointTo}{" "}{after ? "Nächste" : "Letzte"} Show:
          <a href="#{pointTo._short}" data-id={pointTo.id}>{pointTo.title}</a>, {shortDate(pointTo._day)}{/if}
      </p>
    {/if}
    <p class="cal-legend" aria-hidden="true">
      <span><i style="background:var(--red)"></i>Ska, Ska-Punk, Rocksteady</span><span
        ><i style="background:var(--green-text)"></i>Dub, Soundsystem</span
      ><span><i style="background:var(--gold)"></i>Reggae &amp; mehr, Festival</span>{#if anyGoing}<span
          ><i class="going" style="background:var(--green-text)"></i>★ Ich gehe</span
        >{/if}
    </p>
    <section class="cal-day">
      <h2 class="month">{longDayFmt.format(parseDay(selDay))}</h2>
      {#if selected.length}
        <div class="shows"><DayGroup items={selected} {geoHintId} /></div>
      {:else}
        <p class="cal-empty">Keine Shows an diesem Tag.</p>
      {/if}
    </section>
  {/if}
</div>
