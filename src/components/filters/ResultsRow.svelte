<script>
  /* The results row under the bar: the «KI-gesammelt» note pill (a <details> that opens as a card), the
   * active filters as removable gold pills (#results, also the focus fallback after a change, §5), the
   * count where the list begins, the view switch and «Link zu dieser Auswahl». Ported from index.html and
   * app.js (renderPills, the note pill, the share-filters handler). */
  import { agenda } from "../../stores/agenda.svelte.js";
  import { ui, nShows } from "../../stores/filters.svelte.js";
  import ViewSwitch from "./ViewSwitch.svelte";
  import { t } from "../../i18n/i18n.svelte.js";
  import { copyText } from "../../lib/share.js";

  const dims = $derived(ui.dims);
  const count = $derived(
    agenda.loadState === "ready" && agenda.visible.length ? nShows(agenda.visible.length) : "",
  );

  // Note pill: <details> that opens as a card; closing waits for the collapse transition.
  let note;
  let noteBody;
  let closing = false;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  function closeNote() {
    if (!note || !note.open || closing) return;
    closing = true;
    note.classList.remove("is-open");
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      closing = false;
      note.open = false;
    };
    if (reduced()) return finish(); // 0 ms transitions fire no transitionend
    noteBody.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, 450); // safety net should the transition be interrupted
  }
  function onSummaryClick(e) {
    if (!note.open) return; // opening: let the browser do it, then animate in (toggle event)
    e.preventDefault();
    closeNote();
  }
  function onToggle() {
    if (note.open) requestAnimationFrame(() => note.classList.add("is-open"));
  }
  function onDocClick(e) {
    if (note && note.open && !note.contains(e.target)) closeNote();
  }
  function onKeydown(e) {
    if (e.key === "Escape") closeNote();
  }
  // The card floats above the list; once its row scrolls under the stuck bar it closes instead of
  // overlapping the bar.
  function onScroll() {
    const bar = document.getElementById("filters");
    if (note && note.open && bar && note.getBoundingClientRect().top < bar.getBoundingClientRect().bottom)
      closeNote();
  }

  // «Link zu dieser Auswahl»: the address bar already holds it – into the clipboard it goes.
  // (Message keys: the label follows a language switch.)
  let shareLabel = $state("share.filters");
  let shareTimer = 0;
  async function share() {
    ui.syncFilterHash();
    shareLabel = (await copyText(location.href)) === "copied" ? "fb.copied" : "fb.inAddressBar";
    clearTimeout(shareTimer);
    shareTimer = setTimeout(() => (shareLabel = "share.filters"), 1500);
  }
</script>

<svelte:document onclick={onDocClick} onkeydown={onKeydown} />
<svelte:window onscroll={onScroll} />

<div class="results-row">
  <details class="note-pill" id="note" bind:this={note} ontoggle={onToggle}>
    <summary onclick={onSummaryClick}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm-1 6h2v7h-2v-7zm0-3h2v2h-2V7z"
        />
      </svg>
      <span class="note-short">{t("note.short")}</span>
      <span class="note-long">{t("note.long")}</span>
      <svg class="chev" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    </summary>
    <div class="note-body" bind:this={noteBody}>
      <p>
        {t("note.body")}
        <a href="#about-title">{t("note.more")}</a>
      </p>
    </div>
  </details>
  <!-- Active filters as removable pills; also the focus fallback after a change (§5). «Alles
       zurücksetzen» only from two on. Nothing in the list mode: there the filters are bypassed. -->
  <p
    id="results"
    class="results"
    class:empty={!dims.length}
    role="group"
    aria-label={t("pills.label")}
    tabindex="-1"
  >
    {#each dims as d (d.kind + ":" + (d.value || ""))}<button
        type="button"
        class="fpill"
        data-remove={d.kind}
        data-value={d.value || undefined}
        title={t("pills.removeTitle", { label: d.label })}
        aria-label={t("pills.removeAria", { label: d.label })}
        onclick={() => ui.removeFilter(d.kind, d.value)}
        >{d.label}<span class="x" aria-hidden="true">✕</span></button
      >{/each}{#if dims.length >= 2}<button
        type="button"
        class="linkish clear"
        data-remove="all"
        title={t("pills.resetTitle")}
        onclick={() => ui.removeFilter("all")}>{t("pills.reset")}</button
      >{/if}
  </p>
  <!-- The count where the list begins (the full line with the span sits in the footer bar). -->
  <span id="results-count" class="results-count" aria-hidden="true">{count}</span>
  <ViewSwitch />
  <button
    type="button"
    id="share-filters"
    class="linkish share-filters"
    title={t("share.filtersTitle")}
    hidden={!agenda.filtered || ui.listMode || agenda.loadState !== "ready"}
    onclick={share}
  >
    <span>{t(shareLabel)}</span>
  </button>
</div>
