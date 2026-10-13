<script>
  /* Karte: Leaflet + OpenStreetMap, fetched from unpkg (pinned by SRI) only when the map is first opened.
   * One striped pin per venue (rooms of one house share a pin), pins that would overlap at the current
   * zoom fold into a cluster badge, a popup lists the venue's shows and links to their rows in the list.
   * Offline (or when Leaflet cannot be fetched) «Karte braucht Netz» points to the list. Under the map: the
   * legend and the shows without a position. Ported from app.js renderMap() / layoutPins() /
   * loadLeaflet(). Leaflet owns the DOM inside #map; Svelte renders #map-rest. */
  import DayGroup from "../DayGroup.svelte";
  import { onMount } from "svelte";
  import { agenda, isFestival } from "../../stores/agenda.svelte.js";
  import { views, LEAFLET, LEAFLET_SRI } from "../../stores/views.svelte.js";
  import { escape, distanceKm } from "../../lib/index.js";
  import { CANTONS } from "../../lib/regions.js";
  import { dow, dm } from "../../lib/dates.js";
  import { nShows } from "../../stores/filters.svelte.js";
  import { t } from "../../i18n/i18n.svelte.js";

  let {
    shows, // the filtered shows (the same the list shows)
    active = false, // the map is the view on screen
    marks = {}, // { id: "interested" | "going" } – Meine Shows
  } = $props();

  let mapEl = $state();
  let online = $state(typeof navigator === "undefined" || navigator.onLine !== false);
  let leafletReady = $state(typeof window !== "undefined" && Boolean(window.L));

  const hasPos = (s) => typeof s.lat === "number" && typeof s.lon === "number";
  const shortDate = (d) => `${dow(d)} ${dm(d)}`;
  const touch = typeof matchMedia === "function" && matchMedia("(hover: none)").matches; // zoom bottom right, popups sized for a thumb
  const rest = $derived(shows.filter((s) => !hasPos(s)));
  const anyFestival = $derived(shows.some(isFestival));
  const here = $derived(agenda.here);
  const coarse = touch;
  const geoHintId = $derived(coarse ? (rest.find(hasPos) || {}).id || "" : "");

  // --- Leaflet on demand ------------------------------------------------------------------------
  let leafletLoading = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletLoading) return leafletLoading;
    leafletLoading = new Promise((resolve, reject) => {
      // Wait for the stylesheet as well, so the first popup is not unstyled.
      const cssReady = new Promise((done) => {
        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = `${LEAFLET}.css`;
        css.integrity = LEAFLET_SRI.css;
        css.crossOrigin = "";
        css.onload = css.onerror = done;
        document.head.appendChild(css);
      });
      const js = document.createElement("script");
      js.src = `${LEAFLET}.js`;
      js.integrity = LEAFLET_SRI.js;
      js.crossOrigin = "";
      js.onload = () => cssReady.then(resolve);
      js.onerror = () => {
        leafletLoading = null;
        reject(new Error("Leaflet konnte nicht geladen werden"));
      };
      document.head.appendChild(js);
    });
    return leafletLoading;
  }

  // «Karte braucht Netz» (§3.12): offline, or Leaflet could not be fetched – with the way to the list.
  const offlineNote = () =>
    `<p class="map-note offline"><strong>${t("map.offlineTitle")}</strong>${t("map.offlineText", {
      list: `<a href="#" data-view-link="list">${t("map.offlineList")}</a>`,
    })}</p>`;

  // --- The map ----------------------------------------------------------------------------------
  let map = null;
  let markerLayer = null;
  let clusterLayer = null;
  let pins = []; // { lat, lon, marker, shows } – every venue pin of the current render, clustered by zoom
  let pinSignature = ""; // the grouping of the last layoutPins(): unchanged → the layers (and an open popup) stay
  let popupPin = null;

  // Pins that would sit on top of each other at the current zoom (the whole Mittelland at the start view
  // of a portrait phone: 57 pins in a 160 px patch, 42 of them unreachable) are folded into one cluster
  // badge; a tap on it zooms into that group until the pins come apart. Re-run on every zoom.
  const CLUSTER_PX = 50;
  function layoutPins() {
    const L = window.L;
    if (!map || !pins.length) return;
    const zoom = map.getZoom();
    const groups = [];
    for (const p of [...pins].sort((a, b) => b.shows - a.shows)) {
      const px = map.project([p.lat, p.lon], zoom);
      const g = groups.find((x) => x.px.distanceTo(px) < CLUSTER_PX);
      if (g) g.members.push(p);
      else groups.push({ px, members: [p] });
    }
    const signature = groups.map((g) => g.members.map((p) => `${p.lat},${p.lon}`).join("|")).join(";");
    if (signature === pinSignature) return;
    pinSignature = signature;
    if (clusterLayer) clusterLayer.remove();
    clusterLayer = L.layerGroup().addTo(map);
    for (const p of pins) p.marker.remove();
    for (const g of groups) {
      if (g.members.length === 1) {
        g.members[0].marker.addTo(markerLayer);
        continue;
      }
      const n = g.members.reduce((sum, p) => sum + p.shows, 0);
      const lat = g.members.reduce((sum, p) => sum + p.lat, 0) / g.members.length;
      const lon = g.members.reduce((sum, p) => sum + p.lon, 0) / g.members.length;
      const title = t("map.cluster", { clubs: g.members.length, shows: n });
      const cluster = L.marker([lat, lon], {
        icon: L.divIcon({
          className: "cluster-icon",
          html: `<span><b>${n}</b></span>`, // the shows, as on the pins and in the legend
          iconSize: [44, 44],
          iconAnchor: [22, 40], // sits on its spot like a pin, so pin heads and badges share one height
        }),
        title,
        zIndexOffset: 500,
      });
      cluster.on("add", () => cluster.getElement().setAttribute("aria-label", title));
      // (Enter on the focused badge arrives as a click: Leaflet's keyboard handling for markers.)
      cluster.on("click", () =>
        map.fitBounds(
          g.members.map((p) => [p.lat, p.lon]),
          { padding: [48, 48], maxZoom: 16 },
        ),
      );
      cluster.addTo(clusterLayer);
    }
  }

  function createMap() {
    const L = window.L;
    mapEl.innerHTML = "";
    // Half zoom steps: the start view fits the country one notch closer on a portrait phone.
    map = L.map(mapEl, { scrollWheelZoom: false, zoomControl: false, zoomSnap: 0.5 });
    // Leaflet's own controls get German tooltips. On touch screens the zoom buttons sit bottom right,
    // where no popup is ever panned underneath them (popups open at the top left).
    L.control
      .zoom({
        zoomInTitle: t("map.zoomIn"),
        zoomOutTitle: t("map.zoomOut"),
        position: touch ? "bottomright" : "topleft",
      })
      .addTo(map);
    map.attributionControl.setPrefix(
      `<a href="https://leafletjs.com" title="${t("map.leafletTitle")}" target="_blank" rel="noopener">Leaflet</a>`,
    );
    // Until the first tiles are painted the frame is a plain dark square with pins floating on it: a
    // «Karte lädt …» corner note (CSS .map.tiles-pending) says that the map is still on its way.
    mapEl.classList.add("tiles-pending");
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      className: "map-tiles",
      attribution: `&copy; ${t("map.osm", {
        osm: `<a href="https://www.openstreetmap.org/copyright" title="${t("map.osmTitle")}">OpenStreetMap</a>`,
      })}`,
    })
      .once("load", () => mapEl.classList.remove("tiles-pending"))
      .addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    map.on("zoomend", layoutPins);
    // Leaflet stops clicks inside popups from bubbling up to the page, so the show links are handled on
    // the popup element itself (bound once per popup). Keyboard: the focus moves into the popup (first
    // show), Escape closes it, the pin gets it back.
    map.on("popupopen", (e) => {
      const popup = e.popup.getElement();
      popupPin = e.popup._source && e.popup._source.getElement ? e.popup._source.getElement() : null;
      if (!popup) return;
      const close = popup.querySelector(".leaflet-popup-close-button");
      if (close) {
        close.title = t("close");
        close.setAttribute("aria-label", t("close"));
      }
      const first = popup.querySelector("a[data-id]");
      if (first && popupPin && popupPin.contains(document.activeElement))
        first.focus({ preventScroll: true });
      if (popup.dataset.bound) return;
      popup.dataset.bound = "1";
      popup.addEventListener("click", (ev) => {
        const a = ev.target.closest("a[data-id]");
        if (!a) return;
        ev.preventDefault();
        map.closePopup();
        views.goToShow(a.dataset.id);
      });
    });
    map.on("popupclose", () => {
      if (popupPin && popupPin.isConnected && mapEl.contains(document.activeElement)) popupPin.focus();
      popupPin = null;
    });
  }

  // Google-Maps-style pins, filled with the red/gold/green stripes. Centre by role (§3.12): dark dot =
  // venue, gold star = «Ich gehe», gold dot = festival. Count badge = shows at this venue.
  let pinSeq = 0;
  const PIN_PATH = "M14 1C7 1 1.5 6.5 1.5 13.5c0 9.5 12.5 25 12.5 25s12.5-15.5 12.5-25C26.5 6.5 21 1 14 1z";
  const STAR = "M14 7.6l1.9 3.9 4.3.6-3.1 3 .7 4.3-3.8-2-3.8 2 .7-4.3-3.1-3 4.3-.6z";
  // The pin as SVG markup: the map's markers and the legend draw the very same shape.
  function pinSvg(kind, id, width = 28, height = 40) {
    const centre =
      kind === "going"
        ? `<circle cx="14" cy="13.5" r="7.5" fill="#14110e"/><path d="${STAR}" fill="#f2b632"/>`
        : kind === "festival"
          ? `<circle cx="14" cy="13.5" r="6.5" fill="#14110e"/><circle cx="14" cy="13.5" r="4" fill="#f2b632"/>`
          : `<circle cx="14" cy="13.5" r="5.5" fill="#14110e"/>`;
    return (
      `<svg viewBox="0 0 28 40" width="${width}" height="${height}" aria-hidden="true">` +
      `<clipPath id="${id}"><path d="${PIN_PATH}"/></clipPath>` +
      `<g clip-path="url(#${id})"><rect x="0" y="0" width="28" height="12" fill="#d8342f"/>` +
      `<rect x="0" y="12" width="28" height="9" fill="#f2b632"/><rect x="0" y="21" width="28" height="20" fill="#1e8f4e"/></g>` +
      `<path d="${PIN_PATH}" fill="none" stroke="#14110e" stroke-width="2"/>${centre}</svg>`
    );
  }
  function pinIcon(kind, count) {
    return window.L.divIcon({
      className: `pin-icon${kind === "going" ? " going" : ""}${kind === "festival" ? " festival" : ""}`,
      html: pinSvg(kind, `pin${++pinSeq}`) + (count > 1 ? `<b>${count}</b>` : ""),
      iconSize: [28, 40],
      iconAnchor: [14, 39],
      popupAnchor: [0, -34],
    });
  }
  // Legend icons: mini pins (14 x 20), so no legend entry looks like a cluster badge.
  const legendPin = (kind) => pinSvg(kind, `legend-pin-${kind}`, 14, 20);
  const showList = (items) =>
    `<ul class="popup-shows">${items
      .map(
        (x) =>
          `<li><a href="#${x._short}" data-id="${escape(x.id)}" title="${t("map.jump")}"><time>${shortDate(x._day)}</time> ${escape(x.title)}</a></li>`,
      )
      .join("")}</ul>`;

  function renderMap(visible, marks, here) {
    const L = window.L;
    if (!map) createMap();
    markerLayer.clearLayers();
    pins = [];
    pinSignature = "";
    const pinKind = (items) =>
      items.some((x) => marks[x.id] === "going") ? "going" : items.some(isFestival) ? "festival" : "venue";
    // One marker per venue; its popup lists the venue's shows. Venues at (almost) the same spot – the
    // rooms of one house, like the Reitschule in Bern – share one pin, otherwise the lower pin could never
    // be tapped.
    const venues = new Map();
    for (const s of visible.filter(hasPos)) {
      const key = `${s.venue}|${s.city}`;
      if (!venues.has(key)) venues.set(key, { s, items: [] });
      venues.get(key).items.push(s);
    }
    const places = [];
    for (const v of venues.values()) {
      const near = places.find((p) => distanceKm(p.s, v.s) < 0.12);
      if (near) near.venues.push(v);
      else places.push({ s: v.s, venues: [v] });
    }
    const points = [];
    const swiss = [];
    for (const { s, venues: vs } of places) {
      const items = vs.flatMap((v) => v.items);
      const names = vs.map((v) => v.s.venue).join(", ");
      const title = t("map.pinTitle", { names, city: s.city, count: nShows(items.length) });
      const marker = L.marker([s.lat, s.lon], {
        icon: pinIcon(pinKind(items), items.length),
        riseOnHover: true,
        zIndexOffset: items.length * 10, // the busier pin on top where pins still overlap
        title,
      }).bindPopup(
        vs.length === 1
          ? `<strong>${escape(s.venue)}</strong> · ${escape(s.city)}${showList(items)}`
          : `<strong>${escape(s.city)}</strong>` +
              vs
                .map(
                  (v) =>
                    `<p class="popup-venue"><strong>${escape(v.s.venue)}</strong></p>${showList(v.items)}`,
                )
                .join(""),
        // Leaflet's default popup (300 px + margins + ×) is wider than the map on a phone: the wrapper
        // (content + 2 × 14 px margin + 2 px) stays one gutter inside the frame on both sides, and the
        // auto-pan padding never asks for more room than that. On a pointer screen the zoom control sits
        // top left, so a tall popup keeps clear of it.
        {
          maxWidth: Math.min(320, mapEl.clientWidth - 62),
          autoPanPaddingTopLeft: [touch ? 16 : 60, 24],
          autoPanPaddingBottomRight: [16, 24],
        },
      );
      // Leaflet names a pin by its text (the count badge): give it the venue instead. The element exists
      // once the marker is on the map, which happens after fitBounds() below (the map has no view yet).
      marker.on("add", () => marker.getElement().setAttribute("aria-label", title));
      pins.push({ lat: s.lat, lon: s.lon, marker, shows: items.length });
      points.push([s.lat, s.lon]);
      if (CANTONS[s.canton]) swiss.push([s.lat, s.lon]);
    }
    if (here) {
      // Your own position: Google's blue dot with a soft halo.
      const youIcon = L.divIcon({
        className: "you-icon",
        html: `<span class="halo"></span><span class="dot"></span>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -12],
      });
      L.marker([here.lat, here.lon], { icon: youIcon, zIndexOffset: 1000, title: t("map.you") })
        .bindPopup(t("map.youHere"))
        .addTo(markerLayer);
      points.push([here.lat, here.lon]);
    }
    map.invalidateSize();
    // The frame fits Switzerland (plus the own position); the few venues just across the border are still
    // on the map, but they do not zoom the whole country out to Strasbourg and Munich.
    const frame = swiss.length ? swiss.concat(here ? [[here.lat, here.lon]] : []) : points;
    if (frame.length) map.fitBounds(frame, { padding: [40, 40], maxZoom: 12 });
    else map.setView([46.8, 8.2], 7);
    layoutPins();
  }

  // Draw whenever the map is on screen and its input changes (filters, marks, the own position).
  $effect(() => {
    if (!active || !mapEl) return;
    const visible = shows;
    const m = marks;
    const h = here;
    if (!leafletReady) {
      if (map) return; // (never: the map exists only once Leaflet is in)
      if (!online) {
        mapEl.innerHTML = offlineNote();
        return;
      }
      mapEl.innerHTML = `<p class="map-note">${t("map.loading")}</p>`;
      loadLeaflet().then(
        () => (leafletReady = true),
        () => {
          if (!window.L) mapEl.innerHTML = offlineNote();
        },
      );
      return;
    }
    renderMap(visible, m, h);
  });

  onMount(() => {
    // Back online while the offline note shows: the map loads now.
    const up = () => (online = true);
    const down = () => (online = false);
    // Escape closes an open popup (the pin gets the focus back, see popupclose).
    const key = (ev) => {
      if (ev.key === "Escape" && active && map && mapEl.querySelector(".leaflet-popup")) map.closePopup();
    };
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    document.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      document.removeEventListener("keydown", key);
    };
  });

  // «Liste» in the offline note.
  function onclick(e) {
    const a = e.target.closest("[data-view-link]");
    if (!a) return;
    e.preventDefault();
    views.setView(a.dataset.viewLink, { push: true });
  }
</script>

<div id="map-view" class="map-view" hidden={!active}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions (only the «Liste» link inside the offline note) -->
  <div id="map" class="map" role="region" aria-label={t("map.label")} bind:this={mapEl} {onclick}></div>
  <div id="map-rest">
    {#if active && leafletReady}
      <p class="map-legend">
        <span class="legend-item"
          ><span class="pin-mini">{@html legendPin("venue")}</span>{t("map.legendClub")}</span
        >
        <span class="legend-item"><span class="cluster-mini"></span>{t("map.legendCluster")}</span>
        <span class="legend-item"
          ><span class="pin-mini">{@html legendPin("going")}</span>{t("map.legendGoing")}</span
        >{#if anyFestival}{" "}<span class="legend-item"
            ><span class="pin-mini">{@html legendPin("festival")}</span>{t("map.legendFestival")}</span
          >{/if}{#if here}{" "}<span class="legend-item"
            ><span class="pin-mini you"></span>{t("map.legendYou")}</span
          >{/if}
      </p>
      {#if rest.length}
        <section>
          <h2 class="month">{t("map.noPosition")}</h2>
          <div class="shows"><DayGroup items={rest} {geoHintId} /></div>
        </section>
      {/if}
    {/if}
  </div>
</div>
