/* Jahgenda – the pure helpers behind the public URL and file contract: short hashes in share links,
 * .ics export and the Google Calendar link, plus the small text/geo helpers the page uses everywhere.
 *
 * No DOM, no location, no clock inside: everything that varies is an explicit argument, so
 * tests/lib.test.mjs can pin the exact output (node --test, run by `make test`). The same exports as
 * the old root lib.js (window.jahLib), now one ES module per topic. */
export { shortId, parseHash } from "./hash.js";
export { venueKey, safeUrl, escape, parseDay, pad2 } from "./text.js";
export { distanceKm, formatKm } from "./geo.js";
export { vevent, icsWrap, icsFor, gcalUrl, sbbUrl, lineupLines, dateText } from "./calendar.js";
