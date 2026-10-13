<script>
  /* The empty state of a filtered view (§3.8), inside #status: names the cause («Kein Dub im Tessin»),
   * offers to remove each filter with what that yields – the removal with the most shows first – and,
   * with a quick pick, points to the next show. «Alles zurücksetzen» from two filters on; it puts the
   * focus back on the search. Ported from the empty branch of app.js renderInner(). */
  import { agenda } from "../../stores/agenda.svelte.js";
  import { ui, nShows } from "../../stores/filters.svelte.js";
  import { dayShort } from "../../lib/dates.js";
  import { t } from "../../i18n/i18n.svelte.js";

  const headline = $derived(ui.emptyHeadline());
  const dims = $derived([...ui.dims].sort((a, b) => b.count - a.count)); // the richest removal first
  const next = $derived(
    ui.quickActive() ? agenda.shows.find((x) => !x._past && agenda.matchesFilters(x)) : null,
  );

  function reset() {
    ui.resetFilters();
    document.getElementById("q").focus();
  }
</script>

<!-- Sun over mountains in the brand line weight (logo 06 «Alpen & Sonne», design/logos.html). -->
<p class="state-icon">
  <svg
    viewBox="0 0 64 64"
    fill="none"
    stroke="currentColor"
    stroke-width="2.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    ><circle cx="42" cy="21" r="8" /><path
      d="M42 5v4M42 33v4M26 21h4M54 21h4M30.7 9.7l2.8 2.8M50.5 29.5l2.8 2.8M53.3 9.7l-2.8 2.8M30.7 32.3l2.8-2.8"
    /><path d="M4 56 22 28l10 16 8-10 20 22" /><path
      d="M19.5 32l2.5-2.5 2.5 2.5M37.5 37l2.5-2.5 2.5 2.5"
    /><path d="M4 56h56" /></svg
  >
</p>
<p class="big">{headline}</p>
<p>{t("empty.none")}</p>
{#if next}
  <p>
    {t("empty.next")} <a href="#{next._short}" title={t("empty.nextTitle")}><strong>{next.title}</strong></a>,
    {t("empty.dayIn", { day: dayShort(next), city: next.city })}
  </p>
{/if}
{#if dims.length}
  <div class="fixes">
    {#each dims as d (d.kind + ":" + (d.value || ""))}<button
        type="button"
        class="chip fix"
        class:none={!d.count}
        data-remove={d.kind}
        data-value={d.value || undefined}
        title={t("pills.removeTitle", { label: d.label })}
        onclick={() => ui.removeFilter(d.kind, d.value)}
        >{t("empty.remove", { label: d.label })} <b>→ {nShows(d.count)}</b></button
      >{/each}
  </div>
{/if}
{#if dims.length >= 2}
  <button type="button" class="linkish reset" id="reset" title={t("pills.resetTitle")} onclick={reset}
    >{t("pills.reset")}</button
  >
{/if}
