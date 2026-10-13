<script>
  /* The head of the list mode (★ Meine Shows or a friend's #m=… list) in the sticky bar: ✕ «Zurück zur
   * Agenda», the title and the count. body.list-mode folds every other filter away (CSS); the page title
   * says which list is open. Ported from app.js syncListMode(). */
  import Icon from "../Icon.svelte";
  import { mine } from "../../stores/marks.svelte.js";
  import { monthSpan, nShows } from "../../stores/filters.svelte.js";
  import { t } from "../../i18n/i18n.svelte.js";

  const on = $derived(mine.listMode);
  const l = $derived(mine.listShows);
  const n = $derived(l.length);
  const span = $derived(n ? monthSpan(l) : "");

  // The page title follows the language too (t() re-runs this effect on a switch).
  $effect(() => {
    document.body.classList.toggle("list-mode", on);
    document.body.classList.toggle("list-shared", Boolean(mine.shared));
    document.title = on ? `${t(mine.shared ? "mine.shared" : "mine.title")} · Jahgenda` : t("meta.title");
  });
</script>

<div id="list-head" class="list-head" hidden={!on}>
  <button
    type="button"
    class="list-close"
    id="list-close"
    title={t("mine.backTitle")}
    aria-label={t("mine.back")}
    onclick={() => mine.closeListMode()}
    ><b aria-hidden="true">✕</b><span>{t("mine.backShort")}<i>{t("mine.backRest")}</i></span></button
  >
  <h2 class="list-title" id="list-title" tabindex="-1">
    {#if on}<Icon name="star" />{#if mine.shared}<span class="t"
          >{#if mine.sharedBy}<i>{t("mine.sharedPrefix")}</i>{t("mine.sharedBy", {
              name: mine.sharedBy,
            })}{:else}{t("mine.shared")}{/if}</span
        ><b class="n"
          >{nShows(n)}{#if n}<i>{" · "}{span}</i>{/if}</b
        >{:else}<span class="t">{t("mine.title")}</span><b class="n"
          >{n}{#if n}<i>{" · "}{span}</i>{/if}</b
        >{/if}{/if}
  </h2>
</div>
