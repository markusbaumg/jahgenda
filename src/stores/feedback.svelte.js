/* Feedback words (§3.6): a 1.2 s word next to an action's icon («Kopiert», «Gespeichert», «Gemerkt»),
 * mirrored into the page-level live region #feedback so screen readers hear it as well. Ported from
 * app.js flashWord(): a row keeps one `flashes` map (act → word) and renders <span class="fb"> plus the
 * fb-on class from it; announce() fills the live region (cleared first, so the same word is announced
 * again). */
export const feedback = $state({ text: "" });

let announceTimer = 0;
export function announce(word) {
  feedback.text = "";
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => (feedback.text = word), 30);
}

export const FLASH_MS = 1200;

// A per-row flasher: `flashes` is reactive ({ [act]: word }), flash(act, word) shows the word for 1.2 s.
export function createFlasher() {
  const flashes = $state({});
  const timers = {};
  return {
    flashes,
    flash(act, word) {
      if (!act || !word) return;
      announce(word);
      flashes[act] = word;
      clearTimeout(timers[act]);
      timers[act] = setTimeout(() => delete flashes[act], FLASH_MS);
    },
  };
}
