<script module>
  // The line-up disclosures stay open across re-renders (a row that leaves and comes back with a filter
  // change is a new component, so the set lives at module level, like in app.js).
  const openIds = new Set();
</script>

<script>
  /* One row inside a day group (DayGroup.svelte), §3.6: the 3-line stack (title, acts, meta), the side
   * column (coat of arms + abbreviation as a filter button, the star) and the actions line under the
   * stack. The markup is the row template of app.js renderShow(), element for element. */
  import Icon from "./Icon.svelte";
  import { agenda } from "../stores/agenda.svelte.js";
  import { safeUrl, venueKey, gcalUrl, sbbUrl, distanceKm, formatKm, parseDay } from "../lib/index.js";
  import { fold } from "../lib/search.js";
  import { ABROAD, regionName, cantonLabel } from "../lib/regions.js";
  import { dow } from "../lib/dates.js";
  import { createFlasher } from "../stores/feedback.svelte.js";
  import { highlighted } from "../stores/reveal.svelte.js";
  import { locate } from "../stores/geo.svelte.js";
  import { showUrl as linkOf, waUrl as waOf, saveIcs, shareShow, copyLink } from "./list/actions.js";
  import { keepInView } from "./list/keepInView.js";

  // Line-up block (festival-spec.md §3.1): with more than 5 acts (festival or not) the acts line shows
  // the first 4 and a <details class="lineup"> holds the rest – by day when `days` exists, else the flat
  // list. Open when the visitor opened it before (openIds), when a search hit sits inside it, or from a
  // deep link. A festival without acts says «Line-up folgt».
  const LINEUP_PREVIEW = 4;
  const LINEUP_FROM = 6;
  const MARK_LABEL = { "": "Merken", interested: "Gemerkt: Interessiert", going: "Gemerkt: Ich gehe" };
  const MARK_TITLE = {
    "": "Merken (lang drücken: Ich gehe)",
    interested: "Nicht mehr merken",
    going: "Nicht mehr merken",
  };

  let {
    show: s,
    index = 0, // position in the list: the first ten rows enter one --stagger apart (§4)
    geoHint = true, // may this row carry the «Distanz & Zug anzeigen» placeholder (one per pass on touch)
    marks = {}, // { id: "interested" | "going" } – Meine Shows (a later story fills it)
    shared = null, // { id: state } from a #m=… link
  } = $props();

  const url = $derived(safeUrl(s.url));
  const tickets = $derived(safeUrl(s.tickets));
  const q = $derived(agenda.filters.q.trim().toLowerCase());
  const here = $derived(agenda.here);
  const mark = $derived(marks[s.id] || "");
  // Genres are muted words at the end of the meta line; the active genre chip is not repeated.
  const genreWords = $derived(
    s.genres
      .filter((g) => g !== agenda.filters.genre && g !== agenda.filters.format)
      .map((g) => agenda.genreLabel[g] || g),
  );
  // Festival (§3.7): «3 Tage» leads the meta line, the door time (a weekender) follows.
  const nDays = $derived(s._end ? Math.round((s._end - s._day) / 864e5) + 1 : 0);
  // The acts line only names who is not in the title already («The Slackers (US)» / «The Slackers»
  // doubled most rows; «Scorchers feat. Capital Soul Sinners» names its guests in the title).
  const extra = $derived.by(() => {
    const t = fold(s.title);
    return s.acts.filter((a) => !t.includes(fold(a)));
  });
  const hasActs = $derived(extra.length > 0);
  // A search hit inside the line-up is highlighted, and the line (clamped to 2 lines on phones) opens up.
  const hit = $derived(hasActs && Boolean(q) && s.acts.some((a) => a.toLowerCase().includes(q)));
  const long = $derived(s.acts.length >= LINEUP_FROM);
  const preview = $derived(long ? extra.slice(0, LINEUP_PREVIEW) : extra);
  const lineupOpen = $derived(hit || openIds.has(s.id));
  const dayKeys = $derived.by(() => {
    const days = s.days && typeof s.days === "object" ? s.days : {};
    return Object.keys(days)
      .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && Array.isArray(days[k]) && days[k].length)
      .sort();
  });
  // «Tag offen» = acts that sit in no day; compared like the validator's artist_key (venueKey is the
  // same rule), so «DUB INC.» in days matches «Dub Inc» in acts.
  const dayRest = $derived.by(() => {
    const placed = new Set();
    for (const k of dayKeys) for (const a of s.days[k]) placed.add(venueKey(String(a)));
    return s.acts.filter((a) => !placed.has(venueKey(a)));
  });
  const lineupLabel = $derived(
    dayKeys.length ? `Alle ${s.acts.length} Acts nach Tag` : `Alle ${s.acts.length} Acts`,
  );
  const venueUrl = $derived(agenda.venueSites[venueKey(s.venue)] || "");
  const hasGeo = $derived(typeof s.lat === "number" && typeof s.lon === "number");
  const km = $derived(here && hasGeo ? formatKm(distanceKm(here, s)) : "");
  const sbb = $derived(sbbUrl(s, agenda.homeCity));
  const showUrl = () => linkOf(s);
  const waUrl = () => waOf(s);
  const canShare = typeof navigator !== "undefined" && Boolean(navigator.share);
  const isHighlighted = $derived(highlighted() === s.id);

  // Feedback words next to the icons (§3.6): { act: word } for 1.2 s, plus the live region.
  const { flashes, flash } = createFlasher();
  // Kalender (.ics) · Teilen · Link: each resolves to the word the button says afterwards.
  const ACTIONS = { cal: saveIcs, share: shareShow, link: copyLink };
  async function act(name) {
    flash(name, await ACTIONS[name](s));
  }
  // The coat of arms toggles that canton in the Wo filter; the results row (with its pill) comes into view.
  function toggleCanton() {
    agenda.toggleCanton(s.canton);
    keepInView();
  }

  // Text with the search hit split out (first occurrence, case-insensitive) for a <mark>.
  function hitParts(text, q) {
    const low = text.toLowerCase();
    const i = q && low.length === text.length ? low.indexOf(q) : -1;
    if (i < 0) return null;
    return [text.slice(0, i), text.slice(i, i + q.length), text.slice(i + q.length)];
  }
  // Line-up disclosure (§4: grid-template-rows 0fr → 1fr over --t-3). Opening: the browser opens the
  // <details>, the is-open class animates the body in on the next frame. Closing: the click is intercepted,
  // the body animates out, then the <details> closes. Reduced motion: 0 ms transitions fire no
  // transitionend, so it closes at once.
  let animOpen = $state(false);
  $effect.pre(() => {
    if (lineupOpen) animOpen = true;
  });
  let closing = false;
  function onToggle(e) {
    if (e.currentTarget.open) {
      openIds.add(s.id);
      requestAnimationFrame(() => (animOpen = true));
    } else {
      openIds.delete(s.id);
      animOpen = false;
    }
  }
  function onSummary(e) {
    const d = e.currentTarget.parentElement;
    if (!d.open || closing) return;
    e.preventDefault();
    closing = true;
    animOpen = false;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      closing = false;
      d.open = false;
    };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return finish();
    d.querySelector(".lineup-body").addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, 450); // safety net should the transition be interrupted
  }
</script>

{#snippet marked(text)}
  {@const p = hitParts(text, q)}
  {#if p}{p[0]}<mark>{p[1]}</mark>{p[2]}{:else}{text}{/if}
{/snippet}

{#snippet fbWord(name)}
  {#if flashes[name]}<span class="fb" aria-hidden="true">{flashes[name]}</span>{/if}
{/snippet}

{#snippet extNote()}
  <span class="ext-mark" aria-hidden="true">↗</span><span class="sr">{" (öffnet externe Seite)"}</span>
{/snippet}

{#snippet dist()}
  {#if hasGeo}
    {#if !here}
      <!-- No position yet: a placeholder that only shows on hover and asks for it (gone once declined).
           The separator travels with the button (both only show on hover), so no lone «·» ends the line. -->
      {#if !agenda.geoDeclined && geoHint}
        <span class="geo-hint"
          >{" · "}<button
            type="button"
            class="geo-ask"
            onclick={() => locate({ fromRow: true })}
            title="Standort freigeben: dann steht hier die Distanz zu dir und ein Link zur Zugverbindung"
            >Distanz &amp; Zug anzeigen</button
          ></span
        >
      {/if}
    {:else}
      {" · "}<span class="dist" title="Luftlinie von deinem Standort"
        >{km}{#if sbb}<a
            class="sbb"
            href={sbb}
            target="_blank"
            rel="noopener"
            title="SBB-Fahrplan {agenda.homeCity} → {s.city}, Ankunft eine Stunde vor der Show"
            aria-label="SBB-Fahrplan nach {s.city}">SBB</a
          >{/if}</span
      >
    {/if}
  {/if}
{/snippet}

{#snippet actList(list)}
  <span class="a"
    >{#each list as a}<span>{@render marked(String(a))}</span>{/each}</span
  >
{/snippet}

<li
  class="show{s._past ? ' past' : ''}{s._end ? ' festival' : ''}{mark ? ` ${mark}` : ''}{shared &&
  shared[s.id]
    ? ' shared-row'
    : ''}{index < 10 ? ' enter' : ''}{isHighlighted ? ' highlight' : ''}"
  id={s.id}
  data-id={s.id}
  style="--i: {Math.min(index, 9)}"
>
  <div class="body">
    <h3 class="title">
      {#if url}
        <!-- A title with a URL is recognisable as a link: dotted gold underline, «↗» and sr text. -->
        <a class="ext" href={url} target="_blank" rel="noopener" title="Seite des Veranstalters öffnen"
          >{s.title}{@render extNote()}</a
        >
      {:else}{s.title}{/if}
    </h3>
    {#if hasActs}
      <p class="acts{hit ? ' hit' : ''}">
        {#each preview as a}<span>{@render marked(a)}</span>{/each}
      </p>
    {/if}
    {#if long}
      <details class="lineup{animOpen ? ' is-open' : ''}" open={lineupOpen} ontoggle={onToggle}>
        <summary title={lineupLabel} onclick={onSummary}
          ><span class="open">{lineupLabel}</span><span class="close">Weniger</span></summary
        >
        <div class="lineup-body">
          <div>
            <div class="days">
              {#if dayKeys.length}
                {#each dayKeys as k}
                  {@const d = parseDay(k)}
                  <span class="d">{dow(d)} {d.getDate()}.</span>{@render actList(s.days[k])}
                {/each}
                {#if dayRest.length}<span class="d">Tag offen</span>{@render actList(dayRest)}{/if}
              {:else}
                <span class="d sr">Acts</span>{@render actList(s.acts)}
              {/if}
            </div>
          </div>
        </div>
      </details>
    {:else if s._end && !s.acts.length}
      <p class="acts none">Line-up folgt</p>
    {/if}
    <!-- With a known position the distance sits before the genres (§3.6); the hover-only placeholder
         that asks for the position goes last, so its invisible width leaves no hole in the line. -->
    <p class="meta">
      {#if nDays}<span class="ndays">{nDays} Tage</span>{" · "}{/if}{#if s.time}<time>{s.time}</time
        >{" · "}{/if}{#if venueUrl}<a
          class="venue-link"
          href={venueUrl}
          target="_blank"
          rel="noopener"
          title="Website von {s.venue} öffnen">{s.venue}</a
        >{:else}{s.venue}{/if}{" · "}{s.city}{#if here}{@render dist()}{/if}{#each genreWords as g}{" · "}<span
          class="genre">{g}</span
        >{/each}{#if s._past}{" · "}<span class="vorbei">vorbei</span>{/if}{#if !here}{@render dist()}{/if}
    </p>
  </div>
  <div class="side">
    <button
      type="button"
      class="canton{ABROAD[s.canton] ? ' abroad' : ''}"
      data-canton={s.canton}
      aria-pressed={agenda.filters.cantons.has(s.canton)}
      onclick={toggleCanton}
      aria-label={cantonLabel(s.canton)}
      title="{regionName(s.canton)} als Filter ein-/ausschalten"
      ><img src="img/cantons/{s.canton}.svg" alt="" loading="lazy" decoding="async" />{s.canton}</button
    >
    <button
      type="button"
      class="act star"
      data-act="mark"
      aria-pressed={Boolean(mark)}
      title={MARK_TITLE[mark]}><Icon name="star" /><span class="lbl">{MARK_LABEL[mark]}</span></button
    >
  </div>
  <div class="foot-row">
    {#if shared && shared[s.id] === "going"}<span class="goes"><Icon name="star" />geht hin</span>{/if}
    <div class="mark-slot">
      {#if mark}
        <!-- The state toggle of a marked row (§5): a role="group" of two aria-pressed buttons with visible
             words, so the state is readable without colour. -->
        <div class="mark-seg" role="group" aria-label="Status der Markierung">
          <button
            type="button"
            class="act"
            data-act="state"
            data-state="interested"
            aria-pressed={mark === "interested"}
            title="Vielleicht – ich schaue es mir an">Interessiert</button
          ><button
            type="button"
            class="act"
            data-act="state"
            data-state="going"
            aria-pressed={mark === "going"}
            title="Ich bin dabei">Ich gehe</button
          >
        </div>
      {/if}
    </div>
    <!-- The actions line of a row (§3.6): Kalender (.ics) · Google · Teilen · Link, plus «Tickets ↗» and
         «Infos ↗» when the show has those URLs. Teilen is navigator.share where it exists; elsewhere it
         stays the WhatsApp link, so WhatsApp never disappears for anyone. -->
    <div class="actions">
      <button
        type="button"
        class="act{flashes.cal ? ' fb-on' : ''}"
        data-act="cal"
        onclick={() => act("cal")}
        aria-label="In Kalender speichern (.ics)"
        title="Als .ics speichern (Apple, Outlook …)"
        ><Icon name="cal" /><span class="lbl">Kalender</span>{@render fbWord("cal")}</button
      ><a
        class="act"
        href={gcalUrl(s, { url: showUrl() })}
        target="_blank"
        rel="noopener"
        aria-label="In Google Kalender eintragen"
        title="In Google Kalender eintragen"><Icon name="gcal" /><span class="lbl">Google</span></a
      >{#if canShare}<button
          type="button"
          class="act{flashes.share ? ' fb-on' : ''}"
          data-act="share"
          onclick={() => act("share")}
          aria-label="Show teilen"
          title="Teilen (WhatsApp, Mail, …)"
          ><Icon name="share" /><span class="lbl">Teilen</span>{@render fbWord("share")}</button
        >{:else}<a
          class="act"
          href={waUrl()}
          target="_blank"
          rel="noopener"
          aria-label="Per WhatsApp teilen"
          title="Per WhatsApp teilen"><Icon name="wa" /><span class="lbl">Teilen</span></a
        >{/if}<button
        type="button"
        class="act{flashes.link ? ' fb-on' : ''}"
        data-act="link"
        onclick={() => act("link")}
        aria-label="Link zu dieser Show kopieren"
        title="Link zu dieser Show kopieren"
        ><Icon name="link" /><span class="lbl">Link</span>{@render fbWord("link")}</button
      >{#if tickets}<a
          class="act tickets"
          href={tickets}
          target="_blank"
          rel="noopener"
          aria-label="Tickets kaufen (öffnet externe Seite)"
          title="Tickets kaufen"><Icon name="ticket" /><span class="lbl">Tickets</span>{@render extNote()}</a
        >{/if}{#if url}<a
          class="act event"
          href={url}
          target="_blank"
          rel="noopener"
          aria-label="Infos beim Veranstalter (öffnet externe Seite)"
          title="Event-Seite des Veranstalters öffnen"
          ><Icon name="event" /><span class="lbl">Infos</span>{@render extNote()}</a
        >{/if}{#if sbb}<a
          class="act sbb-act"
          href={sbb}
          target="_blank"
          rel="noopener"
          aria-label="SBB-Fahrplan nach {s.city} (öffnet externe Seite)"
          title="SBB-Fahrplan {agenda.homeCity} → {s.city}, Ankunft eine Stunde vor der Show"
          ><Icon name="train" /><span class="lbl">SBB</span>{@render extNote()}</a
        >{/if}
    </div>
  </div>
</li>
