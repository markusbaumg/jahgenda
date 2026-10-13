/* Clipboard and share – one behaviour for every button that copies or shares (a row's Teilen / Link,
 * Meine Shows' Teilen / Link, «Link zu dieser Auswahl», the calendar feed's «Adresse kopieren»). What a
 * failure falls back to stays with the caller: a page link is already in the address bar, the feed URL is
 * not (the sticker shows it in a prompt). */

// A clipboard write that never answers (a permission prompt nobody sees, a stalled browser) must not leave
// the button without feedback: after this long it counts as failed.
export const COPY_TIMEOUT = 1000;

/** Copy `text` to the clipboard → "copied" | "failed" (no clipboard, denied, or no answer in time). */
export async function copyText(text, { timeout = COPY_TIMEOUT } = {}) {
  let timer = 0;
  try {
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeout);
      }),
    ]);
    return "copied";
  } catch {
    return "failed";
  } finally {
    clearTimeout(timer);
  }
}

/** A WhatsApp link that carries `text` (the share fallback everywhere navigator.share is missing). */
export const waLink = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;

/** navigator.share(data) → "shared" | "cancelled" (the visitor closed the sheet) | "fallback" (no share()
 * or it failed: `fallbackUrl`, a WhatsApp link, opens in a new tab instead). */
export async function shareOr(data, fallbackUrl) {
  try {
    await navigator.share(data);
    return "shared";
  } catch (err) {
    if (err && err.name === "AbortError") return "cancelled";
    if (fallbackUrl) window.open(fallbackUrl, "_blank", "noopener");
    return "fallback";
  }
}
