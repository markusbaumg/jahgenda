/* The button actions of a row (§3.6): Kalender (.ics), Teilen (navigator.share, else WhatsApp) and Link.
 * Google, Tickets, Infos and SBB are plain links. Ported from app.js runAction(); each action resolves to
 * the feedback word the row flashes next to the icon ("" = say nothing). The calendar and the map reuse
 * the rows, so these live beside the row component, not inside it. */
import { icsFor, dateText } from "../../lib/index.js";

// The page link of a show: the short per-show hash (#k3f9zq), the contract of every shared link.
export const showUrl = (s) => `${location.origin}${location.pathname}#${s._short}`;

export const shareText = (s) =>
  s._end
    ? `${s.title} – ${dateText(s)} · ${s.venue}, ${s.city}` +
      `${s.acts.length ? `\nmit ${s.acts.slice(0, 4).join(", ")}${s.acts.length > 4 ? ` +${s.acts.length - 4}` : ""}` : ""}\n${showUrl(s)}`
    : `${s.title} – ${dateText(s)}${s.time ? ` ${s.time}` : ""} · ${s.venue}, ${s.city}\n${showUrl(s)}`;

export const waUrl = (s) => `https://wa.me/?text=${encodeURIComponent(shareText(s))}`;

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
  return "Gespeichert";
}

export async function shareShow(s) {
  try {
    await navigator.share({ title: s.title, text: shareText(s).split("\n")[0], url: showUrl(s) });
    return "Geteilt";
  } catch (err) {
    // Cancelled: nothing to do. Not possible here: the WhatsApp link, like everywhere without share().
    if (!err || err.name !== "AbortError") window.open(waUrl(s), "_blank", "noopener");
    return "";
  }
}

// The show's short hash goes into the address bar (no navigation, no hashchange) and the link to the
// clipboard; without clipboard access the address bar is where the link is.
export async function copyLink(s) {
  history.replaceState(history.state, "", `#${s._short}`);
  try {
    await navigator.clipboard.writeText(showUrl(s));
    return "Kopiert";
  } catch {
    return "Link in Adresszeile";
  }
}
