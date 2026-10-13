/* «Kalender abonnieren»: the same callout as the install nudge (public/callout.js), opened by the
 * calendar's «Abonnieren» button (force) – ported from app.js showSubscribe(). With one canton chosen,
 * the feed of that region (scripts/make_ics.py writes jahgenda-<code>.ics). */
import { agenda } from "../../stores/agenda.svelte.js";
import { regionName } from "../../lib/regions.js";

const FEED_BASE = "https://markusbaumg.github.io/jahgenda/";
const feedUrl = (region) => FEED_BASE + (region ? `jahgenda-${region}.ics` : "jahgenda.ics");

export function showSubscribe(force) {
  const callout = window.jahCallout;
  if (!callout) return;
  const cantons = agenda.filters.cantons;
  const canton = cantons.size === 1 ? [...cantons][0] : "";
  const url = feedUrl(canton);
  callout.show({
    id: "subscribe",
    force,
    title: canton ? `Shows in ${regionName(canton)} in deinem Kalender` : "Alle Shows in deinem Kalender",
    text: "Einmal abonnieren – danach hält sich der Kalender selbst aktuell.",
    actions: [
      {
        label: "Apple / Outlook",
        primary: true,
        href: url.replace("https://", "webcal://"),
        title: "In Apple Kalender oder Outlook abonnieren",
      },
      {
        label: "Google",
        href: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url)}`,
        external: true,
        title: "In Google Kalender abonnieren",
      },
      {
        label: "Adresse kopieren",
        title: "Feed-Adresse kopieren (für jede Kalender-App)",
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(url);
            const b = document.querySelector('.callout [data-callout-action="2"]');
            if (b) b.textContent = "Kopiert";
          } catch {
            prompt("Feed-Adresse:", url);
          }
        },
      },
    ],
  });
}
