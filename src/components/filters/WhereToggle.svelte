<script>
  /* The Wo toggle in the toolbar: the pin, the word «Wo» and a badge naming the real filters
   * («ZH · BE», «4 Kantone», «≤ 25 km»); a known position only lights the pin up (.located). */
  import { agenda } from "../../stores/agenda.svelte.js";
  import { ui } from "../../stores/filters.svelte.js";
  import { t } from "../../i18n/i18n.svelte.js";

  const f = agenda.filters;
  const label = $derived.by(() => {
    const codes = [...f.cantons];
    const parts = [];
    if (codes.length > 3) parts.push(t("n.cantons", { n: codes.length }));
    else if (codes.length) parts.push(codes.join(" · "));
    if (agenda.here && f.radius) parts.push(`≤ ${f.radius} km`);
    return parts.join(" · ");
  });
</script>

<button
  type="button"
  id="toggle-where"
  class="icon-btn where"
  class:located={Boolean(agenda.here)}
  aria-pressed={String(Boolean(f.cantons.size || (agenda.here && f.radius)))}
  aria-expanded={String(ui.openPanel === "where")}
  aria-controls="where-panel"
  aria-label={t("where.aria", { label: label || t("where.all") })}
  title={label ? t("where.titleOn", { label }) : t("where.titleOff")}
  onclick={() => ui.togglePanel("where")}
>
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"
    />
  </svg>
  <span class="icon-word" aria-hidden="true">{t("where.word")}</span>
  <b hidden={!label}>{label}</b>
</button>
