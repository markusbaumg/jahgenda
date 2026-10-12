(() => {
  const DATA_URL = "data/shows.json";

  const CANTONS = {
    AG: "Aargau", AI: "Appenzell I.Rh.", AR: "Appenzell A.Rh.", BE: "Bern",
    BL: "Basel-Landschaft", BS: "Basel-Stadt", FR: "Freiburg", GE: "Genf",
    GL: "Glarus", GR: "Graubünden", JU: "Jura", LU: "Luzern", NE: "Neuenburg",
    NW: "Nidwalden", OW: "Obwalden", SG: "St. Gallen", SH: "Schaffhausen",
    SO: "Solothurn", SZ: "Schwyz", TG: "Thurgau", TI: "Tessin", UR: "Uri",
    VD: "Waadt", VS: "Wallis", ZG: "Zug", ZH: "Zürich",
  };

  const el = (id) => document.getElementById(id);
  const list = el("list");
  const status = el("status");
  const cantonSelect = el("canton");
  const search = el("q");

  const monthFmt = new Intl.DateTimeFormat("de-CH", { month: "long", year: "numeric" });
  const dowFmt = new Intl.DateTimeFormat("de-CH", { weekday: "short" });
  const stampFmt = new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short" });

  // Dates are local calendar days ("YYYY-MM-DD"); parse without timezone shifts.
  const parseDay = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  const todayStart = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  };

  const escape = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");

  let shows = [];
  let here = null; // { lat, lon } once the visitor shares their location

  // Straight-line distance in km (haversine).
  function distanceKm(a, b) {
    const rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }

  const formatKm = (km) => (km < 1 ? "gleich ums Eck" : `≈ ${km < 10 ? km.toFixed(1) : Math.round(km)} km`);

  function distanceLabel(s) {
    if (!here || typeof s.lat !== "number" || typeof s.lon !== "number") return "";
    return ` · <span class="dist">${formatKm(distanceKm(here, s))}</span>`;
  }

  function renderShow(s) {
    const d = s._day;
    const dow = d.getDay();
    const url = safeUrl(s.url);
    const title = url
      ? `<a href="${escape(url)}" target="_blank" rel="noopener">${escape(s.title)}</a>`
      : escape(s.title);
    const time = s.time ? `<time>${escape(s.time)}</time> · ` : "";
    return `
      <li class="show${dow === 0 || dow === 5 || dow === 6 ? " weekend" : ""}">
        <div class="date" aria-hidden="true">
          <span class="dow">${dowFmt.format(d).replace(".", "")}</span>
          <span class="day">${String(d.getDate()).padStart(2, "0")}</span>
        </div>
        <div>
          <h3 class="title">${title}</h3>
          <p class="meta">${time}${escape(s.venue)} · ${escape(s.city)}${distanceLabel(s)}</p>
        </div>
        <span class="canton" title="${escape(CANTONS[s.canton] || s.canton)}">${escape(s.canton)}</span>
      </li>`;
  }

  function render() {
    const canton = cantonSelect.value;
    const q = search.value.trim().toLowerCase();

    const visible = shows.filter((s) => {
      if (canton && s.canton !== canton) return false;
      if (!q) return true;
      return [s.title, s.venue, s.city, CANTONS[s.canton]].join(" ").toLowerCase().includes(q);
    });

    if (!visible.length) {
      list.innerHTML = "";
      status.textContent = shows.length ? "Keine Konzerte für diese Auswahl." : "Zurzeit sind keine Konzerte eingetragen.";
      return;
    }
    status.textContent = "";

    const groups = new Map();
    for (const s of visible) {
      const key = monthFmt.format(s._day);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }

    list.innerHTML = [...groups]
      .map(([month, items]) => `
        <section>
          <h2 class="month">${escape(month)}</h2>
          <ul class="shows">${items.map(renderShow).join("")}</ul>
        </section>`)
      .join("");
  }

  async function init() {
    try {
      const res = await fetch(DATA_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const today = todayStart();
      shows = (data.shows || [])
        .filter((s) => s && s.date && s.title)
        .map((s) => ({ ...s, _day: parseDay(s.date) }))
        .filter((s) => s._day >= today)
        .sort((a, b) => a._day - b._day || (a.time || "").localeCompare(b.time || ""));

      const used = [...new Set(shows.map((s) => s.canton).filter(Boolean))].sort();
      cantonSelect.insertAdjacentHTML(
        "beforeend",
        used.map((c) => `<option value="${escape(c)}">${escape(CANTONS[c] || c)}</option>`).join("")
      );

      if (data.updated) {
        const note = data.source === "mock" ? " · Beispieldaten" : "";
        el("updated").textContent = `Stand: ${stampFmt.format(new Date(data.updated))}${note}`;
      }
      render();
    } catch (err) {
      console.error(err);
      status.textContent = "Konzerte konnten nicht geladen werden.";
    }
  }

  const locateBtn = el("locate");
  const geoStatus = el("geo-status");

  if (!("geolocation" in navigator)) locateBtn.hidden = true;

  locateBtn.addEventListener("click", () => {
    geoStatus.textContent = "Suche dich …";
    locateBtn.disabled = true;
    // The position is only used in this browser tab; it is never stored or sent anywhere.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        locateBtn.hidden = true;
        const nearest = shows
          .filter((s) => typeof s.lat === "number")
          .map((s) => ({ s, km: distanceKm(here, s) }))
          .sort((a, b) => a.km - b.km)[0];
        geoStatus.textContent = nearest
          ? `Nächste Show: ${nearest.s.title} in ${nearest.s.city}, ${formatKm(nearest.km)}. Irie!`
          : "";
        render();
      },
      () => {
        locateBtn.disabled = false;
        geoStatus.textContent = "Standort nicht verfügbar. Kein Stress, die Agenda geht auch so.";
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  });

  cantonSelect.addEventListener("change", render);
  search.addEventListener("input", render);
  init();
})();
