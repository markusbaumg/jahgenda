/* The agenda store (Svelte 5 runes): the shows from data/shows.json with their derived fields, the
 * genre labels, the filters and the visible list. Ported from the IIFE state in app.js (init(),
 * matchesFilters, isVisible). Everything the components render comes from here; the data files stay
 * the scraper's contract (CLAUDE.md), nothing is invented in the browser. */
import { parseDay, shortId, distanceKm, venueKey } from "../lib/index.js";
import { fold, searchText, matchesSearch } from "../lib/search.js";
import { todayStart, setTimeFlags, monthStart, addDays } from "../lib/dates.js";
import { t } from "../i18n/core.js";
import { DATA, fetchJson, tryJson } from "../lib/load.js";

export const FORMAT_LABEL = {
  get festival() {
    return t("format.festival");
  },
};
export const isFestival = (s) => Boolean(s._end);

// A range entry (festival-spec.md): end_date after date, else it is a normal show.
const endDay = (s) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s.end_date || "") && s.end_date > s.date ? parseDay(s.end_date) : null;

export function createAgenda() {
  let shows = $state.raw([]);
  let loadState = $state("loading"); // "loading" | "ready" | "error"
  let loadError = $state(null);
  let genreOrder = $state.raw([]); // slugs in display order (from data/genres.json)
  let genreLabel = $state.raw({}); // slug → label
  let venueSites = $state.raw({}); // normalised venue name → website/programme URL
  let venuePlaces = $state.raw([]); // {city, lat, lon} per known venue
  let dataUpdated = $state(0); // Date.parse of data.updated
  let dataSource = $state("");
  let here = $state.raw(null); // { lat, lon } once the visitor shares their location
  let homeCity = $state("");
  let geoDeclined = $state(false);
  let today = $state.raw(todayStart());
  // The list mode (★ Meine Shows / a friend's #m=… list, src/stores/marks.svelte.js): a source that
  // returns null (the agenda) or { ids: { id: state }, shared } – then exactly those shows are the list,
  // the filters are bypassed (not cleared) and past shows of the list stay in.
  let listSource = $state.raw(() => null);
  const list = $derived(listSource());

  // Filters: one object, so a later story can bind the toolbar to it and sync it with the hash.
  const filters = $state({
    q: "",
    cantons: new Set(),
    radius: 0, // km; 0 = no distance filter, only applies once the position is known
    genre: "",
    format: "", // "" or "festival"
    months: new Set(), // "YYYY-M" keys of the Wann panel
    range: null, // [from, to] of a quick pick
    showPast: false,
  });

  // HEUTE / MORGEN pills only while the data is fresher than 48 h: stale data must not claim a day.
  const isFresh = () => dataUpdated > 0 && Date.now() - dataUpdated < 48 * 3600 * 1000;

  const monthKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}`;
  // A festival counts for every month and every quick range it touches.
  const inRange = (s, o = {}) => {
    const ms = "months" in o ? o.months : filters.months;
    const end = s._end || s._day;
    if (ms.size) {
      for (let m = monthStart(s._day); m <= end; m = monthStart(addDays(m, 32)))
        if (ms.has(monthKey(m))) return true;
      return false;
    }
    const [from, to] = "range" in o ? o.range || [] : filters.range || [];
    return !(from && to) || (s._day <= to && end >= from);
  };

  // Every filter except the date range. `o` replaces single filters for what-if counts (countWith).
  function matchesFilters(s, o = {}) {
    const q = fold("q" in o ? o.q : filters.q.trim());
    const cs = "cantons" in o ? o.cantons : filters.cantons;
    const radius = "radius" in o ? o.radius : filters.radius;
    const genre = "genre" in o ? o.genre : filters.genre;
    const format = "format" in o ? o.format : filters.format;
    if (cs.size && !cs.has(s.canton)) return false;
    if (radius && here && typeof s.lat === "number" && distanceKm(here, s) > radius) return false;
    if (genre && !s.genres.includes(genre)) return false;
    if (format && !s.genres.includes(format)) return false;
    return !q || matchesSearch(s, q);
  }
  const isVisible = (s, o = {}) =>
    list ? Boolean(list.ids[s.id]) : (!s._past || filters.showPast) && inRange(s, o) && matchesFilters(s, o);

  const visible = $derived(shows.filter((s) => isVisible(s)));
  const filtered = $derived(
    Boolean(
      list ||
        filters.cantons.size ||
        filters.genre ||
        filters.format ||
        filters.q.trim() ||
        filters.months.size ||
        filters.range ||
        (here && filters.radius),
    ),
  );
  const pastCount = $derived(shows.filter((s) => s._past).length);
  const hasUpcoming = $derived(shows.some((s) => !s._past));

  // The genres that occur at least once, in the order of data/genres.json (unknown slugs go last,
  // alphabetically). «Festival» is a format, not a genre (§3.3).
  const genres = $derived.by(() => {
    const set = new Set(shows.flatMap((s) => s.genres));
    const rank = (g) => (genreOrder.includes(g) ? genreOrder.indexOf(g) : genreOrder.length);
    return [...set].filter((g) => !FORMAT_LABEL[g]).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  });
  const formats = $derived.by(() => {
    const set = new Set(shows.flatMap((s) => s.genres));
    return Object.keys(FORMAT_LABEL).filter((f) => set.has(f));
  });

  const countWith = (o) => shows.filter((s) => isVisible(s, o)).length;
  const findShow = (token) => shows.find((s) => s._short === token) || shows.find((s) => s.id === token);

  // The town nearest to the user's position (from the venue list) – the "von" of the SBB timetable link.
  function updateHomeCity() {
    if (!here || !venuePlaces.length) return;
    const near = venuePlaces.map((p) => ({ p, km: distanceKm(here, p) })).sort((a, b) => a.km - b.km)[0];
    homeCity = near && near.km < 60 ? near.p.city : "";
  }

  // Venue sites and places arrive after the shows (venues.web.json is optional for the page).
  function loadVenues() {
    return tryJson(DATA.venuesWeb)
      .then((v) => {
        const sites = {};
        const places = [];
        for (const [name, info] of Object.entries((v && v.venues) || {})) {
          if (!info) continue;
          if (/^https?:\/\//i.test(info.url || "")) sites[venueKey(name)] = info.url;
          if (typeof info.lat === "number" && typeof info.lon === "number" && info.city)
            places.push({ city: info.city, lat: info.lat, lon: info.lon });
        }
        venueSites = sites;
        venuePlaces = places;
        updateHomeCity();
      })
      .catch(() => {
        /* venues.json is optional for the page */
      });
  }
  async function load() {
    loadState = "loading";
    loadError = null;
    try {
      // shows.json is the agenda (an error state without it); genres.json is optional.
      const [data, g] = await Promise.all([fetchJson(DATA.shows), tryJson(DATA.genres)]);
      try {
        const order = [];
        const label = {};
        for (const item of (g && g.genres) || []) {
          if (item && typeof item.slug === "string") {
            order.push(item.slug);
            label[item.slug] = item.label || item.slug;
          }
        }
        genreOrder = order;
        genreLabel = label;
      } catch {
        /* genres.json is optional for the page; chips then follow the data */
      }

      today = todayStart();
      const list = (data.shows || [])
        .filter((s) => s && s.date && s.title)
        .map((s) => ({
          ...s,
          _day: parseDay(s.date),
          _end: endDay(s),
          genres: Array.isArray(s.genres) ? s.genres.map((g) => String(g).toLowerCase()) : [],
          acts: Array.isArray(s.acts) ? s.acts.map(String).filter(Boolean) : [],
        }))
        .map((s) => ({ ...s, _short: shortId(s.id), _hay: searchText(s, genreLabel) }))
        .sort((a, b) => a._day - b._day || (a.time || "99:99").localeCompare(b.time || "99:99")); // unknown time last
      for (const s of list) setTimeFlags(s, today);
      shows = list;
      dataUpdated = data.updated ? Date.parse(data.updated) || 0 : 0;
      dataSource = data.source || "";
      loadState = "ready";
      loadVenues();
    } catch (err) {
      console.error(err);
      loadError = err;
      loadState = "error";
    }
  }

  // HEUTE / MORGEN, the coming weekend and «vorbei» depend on the clock: when the tab comes back on
  // another day, the flags are computed again and the list re-renders through `today`.
  function refreshDay() {
    const t = todayStart();
    if (t.getTime() === today.getTime()) return;
    today = t;
    for (const s of shows) setTimeFlags(s, t);
    shows = [...shows];
  }

  // A canton badge in a row (and the Wo chips) toggle one canton / region in the filter. The Set is
  // replaced, not mutated: `filters` is a $state proxy, a Set inside it is not reactive by itself.
  function toggleCanton(code) {
    const next = new Set(filters.cantons);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    filters.cantons = next;
  }

  return {
    get shows() {
      return shows;
    },
    get visible() {
      return visible;
    },
    get filtered() {
      return filtered;
    },
    get loadState() {
      return loadState;
    },
    get loadError() {
      return loadError;
    },
    get genreOrder() {
      return genreOrder;
    },
    get genreLabel() {
      return genreLabel;
    },
    get genres() {
      return genres;
    },
    get formats() {
      return formats;
    },
    get venueSites() {
      return venueSites;
    },
    get venuePlaces() {
      return venuePlaces;
    },
    get dataUpdated() {
      return dataUpdated;
    },
    get dataSource() {
      return dataSource;
    },
    get here() {
      return here;
    },
    set here(v) {
      here = v;
      updateHomeCity();
    },
    get homeCity() {
      return homeCity;
    },
    get geoDeclined() {
      return geoDeclined;
    },
    set geoDeclined(v) {
      geoDeclined = v;
    },
    get today() {
      return today;
    },
    /** null in the agenda, { ids, shared } in the list mode (Meine Shows, a shared list). */
    get list() {
      return list;
    },
    setListSource(fn) {
      listSource = typeof fn === "function" ? fn : () => null;
    },
    get pastCount() {
      return pastCount;
    },
    get hasUpcoming() {
      return hasUpcoming;
    },
    filters,
    isFresh,
    inRange,
    matchesFilters,
    isVisible,
    countWith,
    findShow,
    load,
    refreshDay,
    toggleCanton,
  };
}

export const agenda = createAgenda();
