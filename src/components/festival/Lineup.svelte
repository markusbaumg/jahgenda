<script>
  /* Line-up disclosure (festival-spec.md §3.1): a native <details class="lineup"> under the acts line of
   * a row with 6+ acts – by day when `days` exists («FR 16.» … «TAG OFFEN»), else the flat list. Opens
   * and closes by animating grid-template-rows 0fr → 1fr over --t-3 (§4): opening, the browser opens the
   * <details> and «is-open» follows on the next frame; closing, the click is intercepted, the body animates
   * out, then the <details> closes (reduced motion: at once). The open state is kept per show in the
   * festival store across re-renders; a search hit inside the line-up or a deep link opens it at once.
   * Ported from app.js lineupHtml() and the toggle/click listeners on #views. */
  import { untrack } from "svelte";
  import { lineups } from "../../stores/festival.svelte.js";
  import { lineupDays, lineupLabel } from "../../lib/festival.js";
  import { dow } from "../../lib/dates.js";

  // marked: the row's snippet that wraps the search hit in a <mark>.
  let { show: s, hit = false, marked } = $props();

  const byDay = $derived(lineupDays(s));
  const label = $derived(lineupLabel(s, byDay.days.length > 0));
  const wanted = $derived(hit || lineups.isOpen(s.id));

  let open = $state(untrack(() => wanted)); // the <details> open property (bound)
  let anim = $state(untrack(() => wanted)); // «is-open»: the body at full height
  let closing = false;
  let body;

  // Re-render rule of main: the disclosure is open exactly when the store or a search hit says so –
  // without the animation (main rebuilt the row with open + is-open).
  $effect.pre(() => {
    const w = wanted;
    untrack(() => {
      if (closing) return;
      if (w && !open) open = anim = true;
      else if (!w && open) open = anim = false;
    });
  });

  function ontoggle(e) {
    const d = e.currentTarget;
    lineups.set(s.id, d.open);
    if (d.open) requestAnimationFrame(() => (anim = true));
    else anim = false;
  }
  function onclick(e) {
    if (!open || closing) return;
    e.preventDefault();
    closing = true;
    anim = false;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      closing = false;
      open = false;
    };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return finish();
    body.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, 450);
  }
</script>

{#snippet actList(list)}
  <span class="a"
    >{#each list as a}<span>{@render marked(String(a))}</span>{/each}</span
  >
{/snippet}

<details class={anim ? "lineup is-open" : "lineup"} bind:open {ontoggle}>
  <summary title={label} {onclick}
    ><span class="open">{label}</span><span class="close">Weniger</span></summary
  >
  <div class="lineup-body" bind:this={body}>
    <div>
      <div class="days">
        {#if byDay.days.length}
          {#each byDay.days as d (d.key)}
            <span class="d">{dow(d.day)} {d.day.getDate()}.</span>{@render actList(d.acts)}
          {/each}
          {#if byDay.rest.length}<span class="d">Tag offen</span>{@render actList(byDay.rest)}{/if}
        {:else}
          <span class="d sr">Acts</span>{@render actList(s.acts)}
        {/if}
      </div>
    </div>
  </div>
</details>
