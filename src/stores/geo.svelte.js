/* The visitor's position (ported from app.js locate() / autoLocate()). Asked for only by a tap – «Mein
 * Standort» in the Wo panel or a row's «Distanz & Zug anzeigen» – and on start only silently, when the
 * browser already allows it (never a permission prompt the visitor did not ask for: a reflexive «Block»
 * would kill the feature for good). The position is only used in this browser tab; it is never stored or
 * sent anywhere. The result lands in agenda.here / agenda.geoDeclined, which the rows read; the Wo panel
 * renders `geo.status` / `geo.near` and opens itself when `geo.panelRequest` changes. */
import { agenda } from "./agenda.svelte.js";
import { distanceKm } from "../lib/index.js";

export const geo = $state({
  locating: false,
  // "" (silent), "searching", "found", "blocked", "unavailable" – the Wo panel turns it into words.
  status: "",
  near: null, // { show, km }: the closest upcoming show once the position is in
  panelRequest: 0, // bumped when a row asked and failed: the message lives in the Wo panel
});

export const hasGeolocation = () => typeof navigator !== "undefined" && "geolocation" in navigator;

export function locate(opts = {}) {
  const silent = Boolean(opts.silent);
  if (geo.locating || !hasGeolocation()) return;
  geo.locating = true;
  if (!silent) geo.status = "searching";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      geo.locating = false;
      agenda.here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      agenda.geoDeclined = false;
      // Closest upcoming show (never a past one), as a link into the list.
      const near = agenda.shows
        .filter((s) => !s._past && typeof s.lat === "number")
        .map((s) => ({ show: s, km: distanceKm(agenda.here, s) }))
        .sort((a, b) => a.km - b.km)[0];
      geo.near = near || null;
      geo.status = "found";
    },
    (err) => {
      geo.locating = false;
      // 1 = the browser (or the visitor) blocks the position: the row placeholders go, the panel says how
      // to get it back. Anything else (timeout, no fix) is transient: the row placeholders stay.
      const blocked = err && err.code === 1;
      if (blocked) agenda.geoDeclined = true;
      if (!silent) geo.status = blocked ? "blocked" : "unavailable";
      // Asked from a row: without the Wo panel the only visible effect of the tap was the placeholder vanishing.
      if (opts.fromRow) geo.panelRequest++;
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
  );
}

// On start: silently when permission was granted before – nothing else. A browser that has never been
// asked waits for a tap; one that said no is left alone.
export function autoLocate() {
  if (!hasGeolocation() || !agenda.shows.length) return;
  if (!navigator.permissions || !navigator.permissions.query) return;
  navigator.permissions
    .query({ name: "geolocation" })
    .then((p) => {
      if (p.state === "granted") locate({ silent: true });
      else if (p.state === "denied") agenda.geoDeclined = true;
    })
    .catch(() => {});
}
