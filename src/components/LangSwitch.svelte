<script>
  /* The language switch DE · FR · EN (story #48) at the end of the footer's link line – discreet, as the
   * owners decided (2026-10-13 21:45). A tap changes the page at once
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
  /* Inline in the footer bar's link line, same size and colour as the links around it. */
  .lang-switch {
    display: inline-flex;
    align-items: center;
    vertical-align: baseline;
    font-weight: 700;
    letter-spacing: var(--track-caps);
  }
  .sep {
    color: var(--muted);
    opacity: 0.6;
    padding: 0 2px;
  }
  button {
    min-width: 28px;
    min-height: 28px;
    padding: 0 3px;
    font: inherit;
    font-weight: 700;
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
