<script>
  import LangSwitch from "./LangSwitch.svelte";
  /* The footer: «Über Jahgenda» and the bottom bar with the result count + data stamp. Markup and copy
   * from index.html; the texts from app.js renderInner() / updateStamp(). */
  import { agenda } from "../stores/agenda.svelte.js";
  import { live } from "../stores/live.svelte.js";
  import { stampFmt } from "../lib/dates.js";
  import { t } from "../i18n/i18n.svelte.js";

  let online = $state(typeof navigator === "undefined" || navigator.onLine !== false);

  // "Offline · Stand: …": the service worker serves the last copy without a connection; the stamp says
  // so, so the visitor knows the list may have moved on. A stamp older than two days means the data may
  // be stale (a cached copy, or the routine failed – the watchdog knows, the visitor should too).
  const stamp = $derived.by(() => {
    if (!agenda.dataUpdated) return "";
    const note = agenda.dataSource === "mock" ? t("foot.mock") : "";
    const old = Date.now() - agenda.dataUpdated > 48 * 3600e3 ? t("foot.old") : "";
    const date = stampFmt.format(new Date(agenda.dataUpdated));
    return `${online ? "" : t("foot.offline")}${t("foot.stamp", { date })}${note}${old}`;
  });
</script>

<svelte:window ononline={() => (online = true)} onoffline={() => (online = false)} />

<footer class="foot" id="foot" tabindex="-1">
  <div class="wrap">
    <section class="about" aria-labelledby="about-title">
      <h2 id="about-title" class="section-title">{t("about.title")}</h2>
      <div class="about-body">
        <img
          class="about-photo"
          src="img/about.jpg"
          width="210"
          height="210"
          alt={t("about.photo")}
          loading="lazy"
        />
        <div>
          <p class="about-head">{t("about.head")}</p>
          <p>{t("about.p1")}</p>
          <p>{t("about.p2")}</p>
          <p class="authors">
            {t("about.made")} <span class="heart" role="img" aria-label={t("about.love")}>♥</span>
            {t("about.by")}
            <strong>Kusi</strong> &amp; <strong>Seraina</strong>.
          </p>
        </div>
      </div>
    </section>
  </div>
  <div class="foot-bar">
    <div class="wrap foot-bar-inner">
      <p class="updated">
        <span id="results-text">{live.resultsText}</span><span id="updated">{stamp}</span>
      </p>
      <p class="foot-links">
        <a href="webcal://markusbaumg.github.io/jahgenda/jahgenda.ics" title={t("foot.subscribeTitle")}
          >{t("foot.subscribe")}</a
        >
        · <a href="mailto:info@jahgenda.ch" title={t("foot.mailTitle")}>info@jahgenda.ch</a> ·
        <a
          href="https://github.com/users/markusbaumg/projects/2"
          target="_blank"
          rel="noopener"
          title={t("foot.roadmapTitle")}>Roadmap</a
        >
        ·
        <a
          href="https://github.com/markusbaumg/jahgenda"
          target="_blank"
          rel="noopener"
          title={t("foot.githubTitle")}>GitHub</a
        >
        · <LangSwitch />
      </p>
    </div>
  </div>
</footer>
