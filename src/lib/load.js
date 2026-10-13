/* Loading the published files – one helper for the agenda store and the owners' console (Mischpult).
 * Every data file is fetched with cache: "no-cache": the scraper rewrites them daily under the same
 * name, so the browser must revalidate (the service worker has its own network-first rule for data/). */

// The data contract (data/*.json, copied into dist/data by the build).
export const DATA = {
  shows: "data/shows.json",
  genres: "data/genres.json",
  venuesWeb: "data/venues.web.json", // venues.json trimmed to what the agenda reads (format_data.py)
  venues: "data/venues.json",
  artists: "data/artists.json",
  runs: "data/runs.json",
  status: "data/status.json",
};

// Repository files that are not part of the build (the scraper rules, the skill prompt, sources.json):
// the console reads them straight from main on GitHub.
export const RAW = "https://raw.githubusercontent.com/markusbaumg/jahgenda/main/";

async function get(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res;
}

/** The parsed JSON; rejects on a network error, a non-2xx answer or broken JSON. */
export const fetchJson = (url) => get(url).then((r) => r.json());
/** The body as text; rejects like fetchJson. */
export const fetchText = (url) => get(url).then((r) => r.text());
/** For optional files: the parsed JSON, or null when it cannot be loaded. */
export const tryJson = (url) => fetchJson(url).catch(() => null);
/** For optional files: the text, or null when it cannot be loaded. */
export const tryText = (url) => fetchText(url).catch(() => null);
