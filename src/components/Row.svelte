<script>
  /* One row inside a day group (DayGroup.svelte), §3.6: the 3-line stack (title, acts, meta), the side
   * column (coat of arms + abbreviation as a filter button, the star) and the actions line under the
   * stack. The markup is the row template of app.js renderShow(), element for element. */
  import Icon from "./Icon.svelte";
  import { agenda } from "../stores/agenda.svelte.js";
  import { safeUrl, venueKey, gcalUrl, sbbUrl, distanceKm, formatKm } from "../lib/index.js";
  import { fold } from "../lib/search.js";
  import { ABROAD, regionName, cantonLabel } from "../lib/regions.js";
  import { createFlasher } from "../stores/feedback.svelte.js";
  import { highlighted } from "../stores/reveal.svelte.js";
  import { showUrl as linkOf, waUrl as waOf, saveIcs, shareShow, copyLink } from "../lib/actions.js";
  // Line-up block (festival-spec.md §3.1): with more than 5 acts (festival or not) the acts line shows
  // the first 4 and Lineup.svelte holds the rest. A festival without acts says «Line-up folgt».
  import Lineup from "./festival/Lineup.svelte";
  import { LINEUP_PREVIEW, LINEUP_FROM, dayCount } from "../lib/festival.js";

  // Meine Shows (M3): the star, the state toggle and the friend's «geht hin» come from the marks store.
  import { mine, MARK_LABEL, MARK_TITLE, LONG_PRESS } from "../stores/marks.svelte.js";
  import { t } from "../i18n/i18n.svelte.js";

  let {
    show: s,
    index = 0, // position in the list: the first ten rows enter one --stagger apart (§4)
    geoHint = true, // may this row carry the «Distanz & Zug anzeigen» placeholder (one per pass on touch)
  } = $props();

  const url = $derived(safeUrl(s.url));
  const tickets = $derived(safeUrl(s.tickets));
  const q = $derived(agenda.filters.q.trim().toLowerCase());
  const here = $derived(agenda.here);
  const mark = $derived(mine.mark(s.id));
  const shared = $derived(mine.shared);
  const starWord = $derived(mine.starWord(s.id));
  // Genres are muted words at the end of the meta line; the active genre chip is not repeated.
  const genreWords = $derived(
    s.genres
      .filter((g) => g !== agenda.filters.genre && g !== agenda.filters.format)
      .map((g) => agenda.genreLabel[g] || g),
  );
  // Festival (§3.7): «3 Tage» leads the meta line, the door time (a weekender) follows.
  const nDays = $derived(dayCount(s));
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
  // The star: Merken on / off. A long press (500 ms) is «Ich gehe» in one go; the click that follows the
  // release is swallowed. A touch screen may not send that click at all, so the flag is a timestamp that
  // expires by itself instead of swallowing the next tap or Enter.
  let longAt = 0;
  let pressTimer = 0;
  let pressing = false;
  function onStarClick() {
    if (longAt && Date.now() - longAt < 1000) {
      longAt = 0;
      return;
    }
    mine.toggleStar(s);
  }
  function endPress() {
    clearTimeout(pressTimer);
    pressTimer = 0;
    pressing = false;
    window.removeEventListener("pointerup", endPress);
    window.removeEventListener("pointercancel", endPress);
  }
  function onStarDown(e) {
    if (e.button !== 0) return;
    longAt = 0;
    pressing = true;
    clearTimeout(pressTimer);
    window.addEventListener("pointerup", endPress);
    window.addEventListener("pointercancel", endPress);
    pressTimer = setTimeout(() => {
      pressTimer = 0;
      longAt = Date.now(); // consumed by the click handler
      mine.longPress(s);
    }, LONG_PRESS);
  }
  // The press must not open the browser's context menu on a touch screen.
  function onStarMenu(e) {
    if (pressing) e.preventDefault();
  }

  // The coat of arms (toggles that canton in the Wo filter, results kept in view) and «Distanz & Zug
  // anzeigen» (asks for the position) are handled by one delegated listener on #list (UrlState.svelte).

  // Text with the search hit split out (first occurrence, case-insensitive) for a <mark>.
  function hitParts(text, q) {
    const low = text.toLowerCase();
    const i = q && low.length === text.length ? low.indexOf(q) : -1;
    if (i < 0) return null;
    return [text.slice(0, i), text.slice(i, i + q.length), text.slice(i + q.length)];
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
  <span class="ext-mark" aria-hidden="true">↗</span><span class="sr">{t("row.external")}</span>
{/snippet}

{#snippet dist()}
  {#if hasGeo}
    {#if !here}
      <!-- No position yet: a placeholder that only shows on hover and asks for it (gone once declined).
           The separator travels with the button (both only show on hover), so no lone «·» ends the line. -->
      {#if !agenda.geoDeclined && geoHint}
        <span class="geo-hint"
          >{" · "}<button type="button" class="geo-ask" title={t("row.geoAskTitle")}>{t("row.geoAsk")}</button
          ></span
        >
      {/if}
    {:else}
      {" · "}<span class="dist" title={t("row.dist")}
        >{km}{#if sbb}<a
            class="sbb"
            href={sbb}
            target="_blank"
            rel="noopener"
            title={t("row.sbbTitle", { from: agenda.homeCity, to: s.city })}
            aria-label={t("row.sbbAria", { to: s.city })}>SBB</a
          >{/if}</span
      >
    {/if}
  {/if}
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
        <a class="ext" href={url} target="_blank" rel="noopener" title={t("row.titleLink")}
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
      <Lineup show={s} {hit} {marked} />
    {:else if s._end && !s.acts.length}
      <p class="acts none">{t("lineup.soon")}</p>
    {/if}
    <!-- With a known position the distance sits before the genres (§3.6); the hover-only placeholder
         that asks for the position goes last, so its invisible width leaves no hole in the line. -->
    <p class="meta">
      {#if nDays}<span class="ndays">{t("n.days", { n: nDays })}</span>{" · "}{/if}{#if s.time}<time
          >{s.time}</time
        >{" · "}{/if}{#if venueUrl}<a
          class="venue-link"
          href={venueUrl}
          target="_blank"
          rel="noopener"
          title={t("row.venueLink", { venue: s.venue })}>{s.venue}</a
        >{:else}{s.venue}{/if}{" · "}{s.city}{#if here}{@render dist()}{/if}{#each genreWords as g}{" · "}<span
          class="genre">{g}</span
        >{/each}{#if s._past}{" · "}<span class="vorbei">{t("row.past")}</span
        >{/if}{#if !here}{@render dist()}{/if}
    </p>
  </div>
  <div class="side">
    <button
      type="button"
      class="canton{ABROAD[s.canton] ? ' abroad' : ''}"
      data-canton={s.canton}
      aria-pressed={agenda.filters.cantons.has(s.canton)}
      aria-label={cantonLabel(s.canton)}
      title={t("row.cantonTitle", { name: regionName(s.canton) })}
      ><img src="img/cantons/{s.canton}.svg" alt="" loading="lazy" decoding="async" />{s.canton}</button
    >
    <button
      type="button"
      class="act star{starWord ? ' fb-on' : ''}"
      data-act="mark"
      aria-pressed={Boolean(mark)}
      title={MARK_TITLE[mark]}
      onclick={onStarClick}
      onpointerdown={onStarDown}
      oncontextmenu={onStarMenu}
      ><Icon name="star" /><span class="lbl">{MARK_LABEL[mark]}</span>{#if starWord}<span
          class="fb"
          aria-hidden="true">{starWord}</span
        >{/if}</button
    >
  </div>
  <div class="foot-row">
    {#if shared && shared[s.id] === "going"}<span class="goes"><Icon name="star" />{t("row.goes")}</span>{/if}
    <div class="mark-slot">
      {#if mark}
        <!-- The state toggle of a marked row (§5): a role="group" of two aria-pressed buttons with visible
             words, so the state is readable without colour. -->
        <div class="mark-seg" role="group" aria-label={t("row.markState")}>
          <button
            type="button"
            class="act"
            data-act="state"
            data-state="interested"
            aria-pressed={mark === "interested"}
            onclick={() => mine.setState(s, "interested")}
            title={t("row.interestedTitle")}>{t("row.interested")}</button
          ><button
            type="button"
            class="act"
            data-act="state"
            data-state="going"
            aria-pressed={mark === "going"}
            onclick={() => mine.setState(s, "going")}
            title={t("row.goingTitle")}>{t("row.going")}</button
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
        aria-label={t("row.calAria")}
        title={t("row.calTitle")}
        ><Icon name="cal" /><span class="lbl">{t("row.cal")}</span>{@render fbWord("cal")}</button
      ><a
        class="act"
        href={gcalUrl(s, { url: showUrl() })}
        target="_blank"
        rel="noopener"
        aria-label={t("row.googleTitle")}
        title={t("row.googleTitle")}><Icon name="gcal" /><span class="lbl">{t("row.google")}</span></a
      >{#if canShare}<button
          type="button"
          class="act{flashes.share ? ' fb-on' : ''}"
          data-act="share"
          onclick={() => act("share")}
          aria-label={t("row.shareAria")}
          title={t("row.shareTitle")}
          ><Icon name="share" /><span class="lbl">{t("row.share")}</span>{@render fbWord("share")}</button
        >{:else}<a
          class="act"
          href={waUrl()}
          target="_blank"
          rel="noopener"
          aria-label={t("row.wa")}
          title={t("row.wa")}><Icon name="wa" /><span class="lbl">{t("row.share")}</span></a
        >{/if}<button
        type="button"
        class="act{flashes.link ? ' fb-on' : ''}"
        data-act="link"
        onclick={() => act("link")}
        aria-label={t("row.linkTitle")}
        title={t("row.linkTitle")}
        ><Icon name="link" /><span class="lbl">{t("row.link")}</span>{@render fbWord("link")}</button
      >{#if tickets}<a
          class="act tickets"
          href={tickets}
          target="_blank"
          rel="noopener"
          aria-label={t("row.ticketsAria")}
          title={t("row.ticketsTitle")}
          ><Icon name="ticket" /><span class="lbl">{t("row.tickets")}</span>{@render extNote()}</a
        >{/if}{#if url}<a
          class="act event"
          href={url}
          target="_blank"
          rel="noopener"
          aria-label={t("row.infoAria")}
          title={t("row.infoTitle")}
          ><Icon name="event" /><span class="lbl">{t("row.info")}</span>{@render extNote()}</a
        >{/if}{#if sbb}<a
          class="act sbb-act"
          href={sbb}
          target="_blank"
          rel="noopener"
          aria-label={t("row.sbbActAria", { to: s.city })}
          title={t("row.sbbTitle", { from: agenda.homeCity, to: s.city })}
          ><Icon name="train" /><span class="lbl">SBB</span>{@render extNote()}</a
        >{/if}
    </div>
  </div>
</li>
