/* Live regions (story #33, M6): what the screen reader hears without moving the focus.
 * - #results-live: the results line after every filter change – the same words as the footer bar
 *   («6 Shows für diese Auswahl · Oktober 2026»); empty while the empty state (#status, role=status)
 *   speaks for itself.
 * - #feedback: the feedback words of the row actions («Kopiert», «Gespeichert», «Ich gehe» …),
 *   cleared first so the same word is announced again (app.js flashWord). */
import { agenda, isFestival } from "./agenda.svelte.js";
import { monthFmt } from "../lib/dates.js";

// "Oktober 2026" or "Oktober 2026 – Dezember 2026": the months a (sorted) list of shows spans.
export function monthSpan(visible) {
  const first = visible[0]._day;
  const last = visible.reduce(
    (m, s) => (s._end && s._end > m ? s._end : m),
    visible[visible.length - 1]._day,
  );
  return first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()
    ? monthFmt.format(first)
    : `${monthFmt.format(first)} – ${monthFmt.format(last)}`;
}

function createLive() {
  let feedback = $state("");
  let timer = 0;

  // Festivals are counted apart from the concerts: «12 Shows · 1 Festival · Juli 2027».
  const resultsText = $derived.by(() => {
    const visible = agenda.visible;
    if (agenda.loadState !== "ready" || !visible.length) return "";
    const nFest = visible.filter(isFestival).length;
    const nConc = visible.length - nFest;
    const festNote = nFest ? `${nConc ? " · " : ""}${nFest} ${nFest === 1 ? "Festival" : "Festivals"}` : "";
    const concerts = nConc ? `${nConc} ${nConc === 1 ? "Show" : "Shows"}` : "";
    return `${concerts}${festNote}${agenda.filtered ? " für diese Auswahl" : ""} · ${monthSpan(visible)}`;
  });

  return {
    /** The results line (footer bar and #results-live). */
    get resultsText() {
      return resultsText;
    },
    /** The text of #feedback. */
    get feedback() {
      return feedback;
    },
    /** Announce a feedback word; the same word twice in a row is heard twice. */
    announce(word) {
      if (!word) return;
      feedback = "";
      clearTimeout(timer);
      timer = setTimeout(() => (feedback = word), 30);
    },
  };
}

export const live = createLive();
