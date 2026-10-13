/* Live regions (story #33, M6): what the screen reader hears without moving the focus.
 * - #results-live: the results line after every filter change – the same words as the footer bar
 *   («6 Shows für diese Auswahl · Oktober 2026»); empty while the empty state (#status, role=status)
 *   speaks for itself.
 * - #feedback: the feedback words of the row actions («Kopiert», «Gespeichert», «Ich gehe» …),
 *   cleared first so the same word is announced again (app.js flashWord). */
import { ui } from "./filters.svelte.js";

function createLive() {
  let feedback = $state("");
  let timer = 0;

  return {
    /** The results line (footer bar and #results-live), derived in the filter store (M1): it also names
     * the Wann pick («… · Heute»). */
    get resultsText() {
      return ui.resultsText;
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
