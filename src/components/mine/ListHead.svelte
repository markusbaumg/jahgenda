<script>
  /* The head of the list mode (★ Meine Shows or a friend's #m=… list) in the sticky bar: ✕ «Zurück zur
   * Agenda», the title and the count. body.list-mode folds every other filter away (CSS); the page title
   * says which list is open. Ported from app.js syncListMode(). */
  import Icon from "../Icon.svelte";
  import { mine } from "../../stores/marks.svelte.js";
  import { monthSpan } from "../../stores/filters.svelte.js";

  const on = $derived(mine.listMode);
  const l = $derived(mine.listShows);
  const n = $derived(l.length);
  const span = $derived(n ? monthSpan(l) : "");

  const BASE_TITLE = typeof document !== "undefined" ? document.title : "";
  $effect(() => {
    document.body.classList.toggle("list-mode", on);
    document.body.classList.toggle("list-shared", Boolean(mine.shared));
    document.title = on ? `${mine.shared ? "Geteilte Liste" : "Meine Shows"} · Jahgenda` : BASE_TITLE;
  });
</script>

<div id="list-head" class="list-head" hidden={!on}>
  <button
    type="button"
    class="list-close"
    id="list-close"
    title="Zurück zur Agenda (Esc)"
    aria-label="Zurück zur Agenda"
    onclick={() => mine.closeListMode()}
    ><b aria-hidden="true">✕</b><span>Zurück<i>{" zur Agenda"}</i></span></button
  >
  <h2 class="list-title" id="list-title" tabindex="-1">
    {#if on}<Icon name="star" />{#if mine.shared}<span class="t"
          >{#if mine.sharedBy}<i>{"Geteilte "}</i>{`Liste von ${mine.sharedBy}`}{:else}Geteilte Liste{/if}</span
        ><b class="n"
          >{`${n} ${n === 1 ? "Show" : "Shows"}`}{#if n}<i>{" · "}{span}</i>{/if}</b
        >{:else}<span class="t">Meine Shows</span><b class="n"
          >{n}{#if n}<i>{" · "}{span}</i>{/if}</b
        >{/if}{/if}
  </h2>
</div>
