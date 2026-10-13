// Straight-line distance in km (haversine) between two { lat, lon } points.
export function distanceKm(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// The row's distance word: «≈ 2.4 km», «≈ 31 km», «gleich um die Ecke» under one km.
export const formatKm = (km) =>
  km < 1 ? "gleich um die Ecke" : `≈ ${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
