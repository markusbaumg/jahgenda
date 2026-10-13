/* The button actions of a row (§3.6): Kalender (.ics), Teilen (navigator.share, else WhatsApp) and Link.
 * Google, Tickets, Infos and SBB are plain links. Ported from app.js runAction(); each action resolves to
 * the feedback word the row flashes next to the icon ("" = say nothing). The calendar, the map and the
 * Meine-Shows store reuse them, so they live in src/lib (no component code; stores never import components). */
import { icsFor, dateText } from "./index.js";
import { t } from "../i18n/core.js";
import { copyText, shareOr, waLink } from "./share.js";

// The page link of a show: the short per-show hash (#k3f9zq), the contract of every shared link.
export const showUrl = (s) => `${location.origin}${location.pathname}#${s._short}`;

export const shareText = (s) =>
  s._end
    ? `${s.title} – ${dateText(s)} · ${s.venue}, ${s.city}` +
      `${s.acts.length ? `\n${t("share.with", { acts: s.acts.slice(0, 4).join(", ") })}${s.acts.length > 4 ? ` +${s.acts.length - 4}` : ""}` : ""}\n${showUrl(s)}`
    : `${s.title} – ${dateText(s)}${s.time ? ` ${s.time}` : ""} · ${s.venue}, ${s.city}\n${showUrl(s)}`;

export const waUrl = (s) => waLink(shareText(s));

// Hand a text to the browser as a file download (an .ics for one show or for Meine Shows).
export function downloadIcs(text, name) {
  const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function saveIcs(s) {
  downloadIcs(icsFor(s, { url: showUrl(s) }), `${s.id}.ics`);
  return t("fb.saved");
}

// Cancelled: nothing to say. Not possible here: the WhatsApp link opens, like everywhere without share().
export async function shareShow(s) {
  const r = await shareOr({ title: s.title, text: shareText(s).split("\n")[0], url: showUrl(s) }, waUrl(s));
  return r === "shared" ? t("fb.shared") : "";
}

// The show's short hash goes into the address bar (no navigation, no hashchange) and the link to the
// clipboard; without clipboard access the address bar is where the link is.
export async function copyLink(s) {
  history.replaceState(history.state, "", `#${s._short}`);
  return (await copyText(showUrl(s))) === "copied" ? t("fb.copied") : t("fb.inAddressBar");
}
