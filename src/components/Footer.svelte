<script>
  /* The footer: «Über Jahgenda» and the bottom bar with the result count + data stamp. Markup and copy
   * from index.html; the texts from app.js renderInner() / updateStamp(). */
  import { agenda } from "../stores/agenda.svelte.js";
  import { ui } from "../stores/filters.svelte.js";
  import { stampFmt } from "../lib/dates.js";

  let online = $state(typeof navigator === "undefined" || navigator.onLine !== false);

  // «12 Shows · 1 Festival für diese Auswahl · Juli 2027 · Heute» – derived in the filter store.
  const resultsText = $derived(ui.resultsText);
  // "Offline · Stand: …": the service worker serves the last copy without a connection; the stamp says
  // so, so the visitor knows the list may have moved on. A stamp older than two days means the data may
  // be stale (a cached copy, or the routine failed – the watchdog knows, the visitor should too).
  const stamp = $derived.by(() => {
    if (!agenda.dataUpdated) return "";
    const note = agenda.dataSource === "mock" ? " · Beispieldaten" : "";
    const old = Date.now() - agenda.dataUpdated > 48 * 3600e3 ? " · evtl. nicht aktuell" : "";
    return `${online ? "" : "Offline · "}Stand: ${stampFmt.format(new Date(agenda.dataUpdated))}${note}${old}`;
  });
</script>

<svelte:window ononline={() => (online = true)} onoffline={() => (online = false)} />

<footer class="foot" id="foot" tabindex="-1">
  <div class="wrap">
    <section class="about" aria-labelledby="about-title">
      <h2 id="about-title" class="section-title">Über Jahgenda</h2>
      <div class="about-body">
        <img
          class="about-photo"
          src="img/about.jpg"
          width="210"
          height="210"
          alt="Seraina und Kusi, von oben fotografiert, mit zwei Bechern in der Hand"
          loading="lazy"
        />
        <div>
          <p class="about-head">Für die Reggae-Community. Von uns.</p>
          <p>
            Hallo zäme, wir sind Kusi und Seraina. Die Reggae-Szene schenkt uns seit Jahren die besten Abende:
            gute Musik, gute Leute, gute Vibes. Irgendwann haben wir uns gefragt, warum man ewig suchen muss,
            um zu wissen, wo am Wochenende was läuft. Jetzt steht es hier: alle Reggae-, Dub- und Ska-Shows
            der Schweiz an einem Ort, gratis, ohne Login, ohne Werbung. Je mehr Leute den Weg in die Clubs
            finden, desto länger bleibt unsere Szene lebendig.
          </p>
          <p>
            Das Sammeln übernehmen KI-Agenten für uns, jede Nacht. Sie sind fleissig, aber nicht unfehlbar –
            wirf vor der Show kurz einen Blick auf die Seite des Clubs. Fehlt eine Show oder stimmt etwas
            nicht? Schreib uns, wir freuen uns über jeden Tipp.
          </p>
          <p class="authors">
            Mit <span class="heart" role="img" aria-label="Liebe">♥</span> gemacht – ein Herzensprojekt von
            <strong>Kusi</strong> &amp; <strong>Seraina</strong>.
          </p>
        </div>
      </div>
    </section>
  </div>
  <div class="foot-bar">
    <div class="wrap foot-bar-inner">
      <p class="updated"><span id="results-text">{resultsText}</span><span id="updated">{stamp}</span></p>
      <p class="foot-links">
        <a
          href="webcal://markusbaumg.github.io/jahgenda/jahgenda.ics"
          title="Alle Shows als Kalender abonnieren (Apple, Google, Outlook – aktualisiert sich täglich)"
          >Kalender abonnieren</a
        >
        · <a href="mailto:info@jahgenda.ch" title="Schreib uns eine E-Mail">info@jahgenda.ch</a> ·
        <a
          href="https://github.com/users/markusbaumg/projects/2"
          target="_blank"
          rel="noopener"
          title="Roadmap auf GitHub öffnen">Roadmap</a
        >
        ·
        <a
          href="https://github.com/markusbaumg/jahgenda"
          target="_blank"
          rel="noopener"
          title="Quellcode auf GitHub öffnen">GitHub</a
        >
      </p>
    </div>
  </div>
</footer>
