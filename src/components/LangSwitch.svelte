<script>
  /* The language switch DE · FR · EN (story #48), top right in the header. A tap changes the page at once
   * (src/i18n/i18n.svelte.js) and is remembered in jahStore («lang»); the URL stays as it is. Each button's
   * tooltip is in its own language, so it reads for someone who does not read the current one. */
  import { i18n, t, LOCALES, LANG_NAMES } from "../i18n/i18n.svelte.js";
  import { TABLES } from "../i18n/core.js";
</script>

<div class="lang-switch" role="group" aria-label={t("lang.label")}>
  {#each LOCALES as l, i (l)}{#if i}<span class="sep" aria-hidden="true">·</span>{/if}<button
      type="button"
      lang={l}
      data-lang={l}
      aria-pressed={String(i18n.locale === l)}
      title={TABLES[l]["lang.self"] || LANG_NAMES[l]}
      onclick={() => i18n.set(l)}>{l.toUpperCase()}</button
    >{/each}
</div>

<style>
  /* In the header's top padding (32 px), aligned with the column's right edge. */
  :global(.head) {
    position: relative;
  }
  .lang-switch {
    position: absolute;
    top: 2px;
    right: max(16px, env(safe-area-inset-right, 0px));
    display: flex;
    align-items: center;
    font-size: var(--fs-1);
    font-weight: 700;
    letter-spacing: var(--track-caps);
  }
  .sep {
    color: var(--muted);
    opacity: 0.6;
  }
  button {
    min-width: 32px;
    min-height: 28px;
    padding: 0 4px;
    font: inherit;
    color: var(--muted);
    background: none;
    border: 0;
    cursor: pointer;
  }
  button[aria-pressed="true"] {
    color: var(--gold);
  }
  @media (hover: hover) {
    button:hover {
      color: var(--text);
    }
  }
</style>
