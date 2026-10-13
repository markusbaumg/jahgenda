<script>
  /* The sticker at the bottom edge (story #33, M6; was callout.js): renders what the callout store holds.
   * It sits right before the footer in the DOM – a keyboard user reaches it a few Tabs after the list, not a
   * thousand stops later. A nudge is a side note (region); an explicit request is a dialog the visitor
   * asked for (role=dialog, focus inside, Escape closes it and hands the focus back). */
  import { onMount } from "svelte";
  import { callout } from "../../stores/callout.svelte.js";
  import { t } from "../../i18n/i18n.svelte.js";

  let host;
  onMount(() => callout.setHost(host));

  const c = $derived(callout.content);
  // Texts may come as thunks (() => t("…")): resolved here, inside the template, they follow a language
  // switch while the sticker is open.
  const txt = (v) => (typeof v === "function" ? v() : v);

  // Swipe down to dismiss (touch, §3.9): the sticker follows the finger and snaps away past 40 px.
  let swipe = $state(null);
  function down(e) {
    if (e.pointerType !== "touch" || !callout.current || e.target.closest("button, a")) return;
    swipe = { y: e.clientY, dy: 0 };
  }
  function move(e) {
    if (!swipe) return;
    swipe = { y: swipe.y, dy: Math.max(0, e.clientY - swipe.y) };
  }
  function endSwipe() {
    if (!swipe) return;
    const away = swipe.dy > 40;
    swipe = null;
    if (away) callout.close("snooze");
  }

  function onkeydown(e) {
    if (e.key === "Escape" && callout.current && !callout.hidden) callout.close("snooze");
  }
</script>

<svelte:document {onkeydown} />

<aside
  bind:this={host}
  class="callout"
  class:show={callout.shown}
  class:drag={swipe}
  hidden={callout.hidden}
  tabindex="-1"
  role={c ? (c.force ? "dialog" : "region") : undefined}
  aria-label={c ? txt(c.title) : undefined}
  style:--drag={swipe ? `${swipe.dy}px` : undefined}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={endSwipe}
  onpointercancel={endSwipe}
>
  <div class="callout-icon"><img src="img/logo/jahgenda.svg" alt="" width="40" height="40" /></div>
  <div class="callout-body">
    {#if c}
      <strong>{txt(c.title)}</strong>
      <!-- The texts are the page's own constants (the iOS steps carry inline icons). -->
      <span>{@html txt(c.text)}</span>
      <span class="callout-actions">
        {#each c.actions || [] as a, i (i)}
          {#if a.href}
            <a
              class="callout-btn"
              class:primary={a.primary}
              href={a.href}
              target={a.external ? "_blank" : undefined}
              rel={a.external ? "noopener" : undefined}
              data-callout-action={i}
              title={txt(a.title) || txt(a.label)}
              onclick={(e) => callout.act(i, e.currentTarget)}>{txt(callout.labels[i]) || txt(a.label)}</a
            >
          {:else}
            <button
              type="button"
              class="callout-btn"
              class:primary={a.primary}
              data-callout-action={i}
              title={txt(a.title) || txt(a.label)}
              onclick={(e) => callout.act(i, e.currentTarget)}
              >{txt(callout.labels[i]) || txt(a.label)}</button
            >
          {/if}
        {/each}
        <!-- «Nie mehr zeigen» belongs to the nudge; a callout the visitor opened on purpose only needs ×. -->
        {#if !c.force}
          <button
            type="button"
            class="callout-never"
            data-callout-action="never"
            title={t("callout.neverTitle")}
            onclick={() => callout.act("never")}>{t("callout.never")}</button
          >
        {/if}
      </span>
    {/if}
  </div>
  <button
    type="button"
    class="callout-close"
    title={t("callout.closeTitle")}
    aria-label={t("callout.closeAria")}
    onclick={() => callout.close("snooze")}>&times;</button
  >
</aside>

<style>
  /* Callout: one sticker style for every nudge (install, calendar subscription, …). Moved from style.css
   * as global rules (same selectors, same specificity): the texts come in as HTML. */
  :global {
    .callout {
      position: fixed;
      left: 12px;
      right: 12px;
      /* --toast-h: a visible update toast (UpdateToast.svelte) sits at the bottom edge; the callout docks above it. */
      bottom: calc(12px + var(--toast-h, 0px) + env(safe-area-inset-bottom, 0px));
      z-index: 20;
      display: flex;
      gap: 14px;
      align-items: flex-start;
      max-width: 560px;
      margin: 0 auto;
      padding: 14px 10px 14px 14px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-top: 3px solid var(--gold);
      border-radius: 14px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
      transform: translateY(24px);
      opacity: 0;
      touch-action: pan-x; /* a vertical swipe on the sticker is ours (swipe down = close) */
      transition:
        transform var(--t-3) var(--ease-skank),
        opacity var(--t-3) var(--ease-tape);
    }
    .callout.show {
      transform: translateY(var(--drag, 0px));
      opacity: 1;
    }
    .callout.drag {
      transition: none;
    }
    .callout[hidden] {
      display: none;
    }
    .callout-icon img {
      display: block;
      border-radius: 9px;
      margin-top: 2px;
    }
    .callout-body {
      flex: 1;
      min-width: 0;
      font-size: 0.9rem;
      line-height: 1.35;
    }
    .callout-body strong {
      display: block;
      line-height: 1.25;
      margin-bottom: 2px;
    }
    .callout-body > span {
      color: var(--muted);
    }
    .callout-body svg {
      width: 16px;
      height: 16px;
      vertical-align: -3px;
      color: var(--text);
    }
    .callout-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 10px;
      margin-top: 10px;
    }
    .callout-btn {
      display: inline-flex;
      align-items: center;
      min-height: 40px;
      font: inherit;
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text);
      background: none;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 0 14px;
      cursor: pointer;
      text-decoration: none;
    }
    .callout-btn.primary {
      color: var(--bg);
      background: var(--gold);
      border-color: var(--gold);
    }
    /* «Nie mehr zeigen» is the quiet text option beside the real action (design/ui-revamp.md §3.9) – not a
     * red button that reads as the sticker's call to action. */
    .callout-never {
      margin-left: auto;
      min-height: 40px;
      font: inherit;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--muted);
      background: none;
      border: 0;
      padding: 0 4px;
      text-decoration: underline dotted;
      text-underline-offset: 3px;
      cursor: pointer;
      white-space: nowrap;
    }
    /* The smallest phones (320 px): the sticker stays a sticker (no icon, so the text runs the full width),
     * not a sheet over the whole first row. */
    @media (max-width: 360px) {
      .callout-icon {
        display: none;
      }
    }
    /* × is a 44 px target; the negative margins keep it in the corner where the 26 px glyph box was. */
    .callout-close {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      margin: -12px -10px 0 -8px;
      padding: 0;
      font: inherit;
      font-size: 1.4rem;
      line-height: 1;
      color: var(--muted);
      background: none;
      border: 0;
      cursor: pointer;
    }
    @media (hover: hover) {
      .callout-btn:hover {
        border-color: var(--gold);
      }
      .callout-never:hover {
        color: var(--text);
      }
      .callout-close:hover {
        color: var(--text);
      }
    }
    /* Reduced motion (§5): the sticker appears and goes without sliding. */
    @media (prefers-reduced-motion: reduce) {
      .callout {
        transition: none;
        transform: none;
      }
    }
  }
</style>
