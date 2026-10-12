(() => {
  const DATA_URL = "data/shows.json";

  const CANTONS = {
    AG: "Aargau",
    AI: "Appenzell I.Rh.",
    AR: "Appenzell A.Rh.",
    BE: "Bern",
    BL: "Basel-Landschaft",
    BS: "Basel-Stadt",
    FR: "Freiburg",
    GE: "Genf",
    GL: "Glarus",
    GR: "Graubünden",
    JU: "Jura",
    LU: "Luzern",
    NE: "Neuenburg",
    NW: "Nidwalden",
    OW: "Obwalden",
    SG: "St. Gallen",
    SH: "Schaffhausen",
    SO: "Solothurn",
    SZ: "Schwyz",
    TG: "Thurgau",
    TI: "Tessin",
    UR: "Uri",
    VD: "Waadt",
    VS: "Wallis",
    ZG: "Zug",
    ZH: "Zürich",
  };

  const el = (id) => document.getElementById(id);
  const ABROAD = {
    D: "Deutschland (grenznah)",
    F: "Frankreich (grenznah)",
    I: "Italien (grenznah)",
    A: "Österreich (grenznah)",
    FL: "Liechtenstein",
  };
  const list = el("list");
  const status = el("status");
  const resultsText = el("results-text");
  const togglePast = el("toggle-past");
  let showPast = false;
  let pastCount = 0;
  const cantonSelect = el("canton");
  const search = el("q");
  const genreBar = el("genres");
  let activeGenre = "";

  const monthFmt = new Intl.DateTimeFormat("de-CH", {
    month: "long",
    year: "numeric",
  });
  const dowFmt = new Intl.DateTimeFormat("de-CH", { weekday: "short" });
  const stampFmt = new Intl.DateTimeFormat("de-CH", {
    dateStyle: "medium",
    timeStyle: "short",
  });

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
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");
  const regionName = (c) => CANTONS[c] || ABROAD[c] || c;

  let shows = [];
  let here = null; // { lat, lon } once the visitor shares their location

  // Straight-line distance in km (haversine).
  function distanceKm(a, b) {
    const rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }

  const formatKm = (km) =>
    km < 1
      ? "gleich ums Eck"
      : `≈ ${km < 10 ? km.toFixed(1) : Math.round(km)} km`;

  function distanceLabel(s) {
    if (!here || typeof s.lat !== "number" || typeof s.lon !== "number")
      return "";
    return ` · <span class="dist">${formatKm(distanceKm(here, s))}</span>`;
  }

  const ICONS = {
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zm-1 8v10h12V10H6zm2 2h3v3H8v-3z"/></svg>',
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.2 14.8l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 0 1 12 4zm-3 4.5c-.2 0-.5 0-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.2 5 4.4 2.5 1 3 .8 3.5.7.5 0 1.7-.7 2-1.4.2-.7.2-1.2.1-1.4l-.5-.3-1.8-.9c-.3-.1-.5-.1-.6.1l-.9 1.1c-.2.2-.3.2-.6.1a6.5 6.5 0 0 1-3.3-2.9c-.2-.4.3-.4.8-1.4.1-.2 0-.4 0-.5l-.9-2c-.2-.5-.4-.4-.6-.4H9z"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10.6 13.4a1 1 0 0 1 0 1.4 4 4 0 0 1-5.7-5.7l3-3a4 4 0 0 1 5.6 0 1 1 0 1 1-1.4 1.4 2 2 0 0 0-2.8 0l-3 3a2 2 0 0 0 2.9 2.9 1 1 0 0 1 1.4 0zm2.8-2.8a1 1 0 0 1 0-1.4 4 4 0 0 1 5.7 5.7l-3 3a4 4 0 0 1-5.6 0 1 1 0 1 1 1.4-1.4 2 2 0 0 0 2.8 0l3-3a2 2 0 0 0-2.9-2.9 1 1 0 0 1-1.4 0z"/></svg>',
  };

  const showUrl = (s) =>
    `${location.origin}${location.pathname}#${encodeURIComponent(s.id)}`;

  const shareText = (s) =>
    `${s.title} – ${dowFmt.format(s._day).replace(".", "")} ${s._day.getDate()}.${s._day.getMonth() + 1}.${s._day.getFullYear()}` +
    `${s.time ? ` ${s.time}` : ""} · ${s.venue}, ${s.city}\n${showUrl(s)}`;

  // Build an .ics file for one show (floating local time, so it lands at the right hour in Switzerland).
  function icsFor(s) {
    const d = s.date.replace(/-/g, "");
    const esc = (t) =>
      String(t)
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\n/g, "\\n");
    let when;
    if (s.time) {
      const [h, m] = s.time.split(":").map(Number);
      const end = new Date(
        s._day.getFullYear(),
        s._day.getMonth(),
        s._day.getDate(),
        h + 3,
        m,
      );
      const pad = (n) => String(n).padStart(2, "0");
      const stamp = (x) =>
        `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}T${pad(x.getHours())}${pad(x.getMinutes())}00`;
      when = `DTSTART:${d}T${pad(h)}${pad(m)}00\r\nDTEND:${stamp(end)}`;
    } else {
      when = `DTSTART;VALUE=DATE:${d}`;
    }
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Jahgenda//DE",
      "BEGIN:VEVENT",
      `UID:${s.id}@jahgenda`,
      when,
      `SUMMARY:${esc(s.title)}`,
      `LOCATION:${esc(`${s.venue}, ${s.city}`)}`,
      `DESCRIPTION:${esc(`${safeUrl(s.url) || ""}\n${showUrl(s)}`)}`,
      `URL:${showUrl(s)}`,
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n");
  }

  function downloadIcs(s) {
    const blob = new Blob([icsFor(s)], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${s.id}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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
      <li class="show${dow === 0 || dow === 5 || dow === 6 ? " weekend" : ""}${s._past ? " past" : ""}" id="${escape(s.id)}" data-id="${escape(s.id)}">
        <time class="date" datetime="${escape(s.date)}">
          <span class="dow">${dowFmt.format(d).replace(".", "")}</span>
          <span class="day">${String(d.getDate()).padStart(2, "0")}</span>
        </time>
        <div>
          <h3 class="title">${title}</h3>
          ${
            s.acts.length > 1 || (s.acts.length === 1 && s.acts[0] !== s.title)
              ? `<p class="acts">${s.acts.map((a) => `<span>${escape(a)}</span>`).join("")}</p>`
              : ""
          }
          <p class="meta">${time}${escape(s.venue)} · ${escape(s.city)}${distanceLabel(s)}</p>
        </div>
        <span class="canton${ABROAD[s.canton] ? " abroad" : ""}" title="${escape(regionName(s.canton))}"><img src="img/cantons/${escape(s.canton)}.svg" alt="" loading="lazy">${escape(s.canton)}</span>
        <div class="foot-row">
            ${s.genres.length ? `<div class="tags">${s.genres.map((g) => `<span class="tag-chip">${escape(g)}</span>`).join("")}</div>` : ""}
            <div class="actions">
              <button type="button" class="act" data-act="cal" title="In Kalender speichern">${ICONS.cal}<span>Kalender</span></button>
              <a class="act" href="https://wa.me/?text=${encodeURIComponent(shareText(s))}" target="_blank" rel="noopener" title="Per WhatsApp teilen">${ICONS.wa}<span>WhatsApp</span></a>
              <button type="button" class="act" data-act="link" title="Link kopieren">${ICONS.link}<span>Link</span></button>
            </div>
          </div>
      </li>`;
  }

  function render() {
    const canton = cantonSelect.value;
    const q = search.value.trim().toLowerCase();

    const visible = shows.filter((s) => {
      if (s._past && !showPast) return false;
      if (canton && s.canton !== canton) return false;
      if (activeGenre && !s.genres.includes(activeGenre)) return false;
      if (!q) return true;
      return [
        s.title,
        s.venue,
        s.city,
        regionName(s.canton),
        ...s.genres,
        ...s.acts,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    const filtered = Boolean(canton || activeGenre || q);
    el("clear-filters").hidden = !filtered;
    togglePast.hidden = pastCount === 0;
    togglePast.textContent = showPast
      ? "Vergangene ausblenden"
      : `Vergangene anzeigen (${pastCount})`;
    if (!visible.length) {
      list.innerHTML = "";
      resultsText.textContent = "";
      status.innerHTML = shows.some((s) => !s._past)
        ? `<p class="emoji">🔍</p><p class="big">Nichts gefunden</p><p>Keine Konzerte für diese Auswahl.</p><button type="button" class="primary" id="reset">Filter zurücksetzen</button>`
        : `<p class="emoji">🌴</p><p class="big">Noch nichts im Kalender</p><p>Sobald der Scraper etwas findet, steht es hier.</p>`;
      return;
    }
    status.innerHTML = "";
    const first = visible[0]._day;
    const last = visible[visible.length - 1]._day;
    const span =
      first.getMonth() === last.getMonth() &&
      first.getFullYear() === last.getFullYear()
        ? monthFmt.format(first)
        : `${monthFmt.format(first)} – ${monthFmt.format(last)}`;
    resultsText.textContent = `${visible.length} ${visible.length === 1 ? "Konzert" : "Konzerte"}${filtered ? " für diese Auswahl" : ""} · ${span}`;

    const groups = new Map();
    for (const s of visible) {
      const key = monthFmt.format(s._day);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }

    list.innerHTML = [...groups]
      .map(
        ([month, items]) => `
        <section>
          <h2 class="month">${escape(month)}</h2>
          <ul class="shows">${items.map(renderShow).join("")}</ul>
        </section>`,
      )
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
        .map((s) => ({
          ...s,
          _day: parseDay(s.date),
          genres: Array.isArray(s.genres)
            ? s.genres.map((g) => String(g).toLowerCase())
            : [],
          acts: Array.isArray(s.acts) ? s.acts.map(String).filter(Boolean) : [],
        }))
        .map((s) => ({ ...s, _past: s._day < today }))
        .sort(
          (a, b) =>
            a._day - b._day || (a.time || "").localeCompare(b.time || ""),
        );

      pastCount = shows.filter((s) => s._past).length;
      const used = [
        ...new Set(shows.map((s) => s.canton).filter(Boolean)),
      ].sort();
      cantonSelect.insertAdjacentHTML(
        "beforeend",
        used
          .map(
            (c) =>
              `<option value="${escape(c)}">${escape(regionName(c))}</option>`,
          )
          .join(""),
      );

      // Genre chips: one toggle per genre that occurs at least once, most common first.
      const counts = new Map();
      for (const s of shows)
        for (const g of s.genres) counts.set(g, (counts.get(g) || 0) + 1);
      genreBar.innerHTML =
        `<button type="button" class="chip" data-genre="" aria-pressed="true">Alle</button>` +
        [...counts]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(
            ([g]) =>
              `<button type="button" class="chip" data-genre="${escape(g)}" aria-pressed="false">${escape(g)}</button>`,
          )
          .join("");
      updateChipArrows();

      if (data.updated) {
        const note = data.source === "mock" ? " · Beispieldaten" : "";
        el("updated").textContent =
          `Stand: ${stampFmt.format(new Date(data.updated))}${note}`;
      }
      render();
      revealFromHash();
    } catch (err) {
      console.error(err);
      status.innerHTML = `<p class="emoji">📻</p><p class="big">Kein Empfang</p><p>Die Konzerte konnten nicht geladen werden. Bitte später nochmals versuchen.</p>`;
    }
  }

  // Per-show actions (calendar / copy link); WhatsApp is a plain link.
  list.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const s = shows.find((x) => x.id === btn.closest(".show").dataset.id);
    if (!s) return;
    if (btn.dataset.act === "cal") downloadIcs(s);
    if (btn.dataset.act === "link") {
      history.replaceState(null, "", `#${encodeURIComponent(s.id)}`);
      const label = btn.querySelector("span");
      try {
        await navigator.clipboard.writeText(showUrl(s));
        label.textContent = "Kopiert";
      } catch {
        label.textContent = "Link in Adresszeile";
      }
      setTimeout(() => (label.textContent = "Link"), 1500);
    }
  });

  function resetFilters() {
    cantonSelect.value = "";
    search.value = "";
    activeGenre = "";
    for (const c of genreBar.querySelectorAll(".chip"))
      c.setAttribute("aria-pressed", String(c.dataset.genre === ""));
    genreBar.scrollTo({ left: 0 });
    render();
  }
  status.addEventListener("click", (e) => {
    if (e.target.id === "reset") {
      resetFilters();
      search.focus();
    }
  });
  el("clear-filters").addEventListener("click", resetFilters);
  togglePast.addEventListener("click", () => {
    showPast = !showPast;
    renderAndKeepInView();
  });

  // Direct links: #<show id> scrolls to the show and highlights it (clearing filters if needed).
  function revealFromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    const target = shows.find((s) => s.id === id);
    if (!target) return;
    if (target._past && !showPast) showPast = true;
    if (!document.getElementById(id)) resetFilters();
    const row = document.getElementById(id);
    if (!row) return;
    row.classList.remove("highlight");
    void row.offsetWidth; // restart the animation
    row.classList.add("highlight");
    row.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  window.addEventListener("hashchange", revealFromHash);

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
        locateBtn.disabled = false;
        locateBtn.classList.add("active");
        // Closest upcoming show (never a past one), as a link into the list.
        const near = shows
          .filter((s) => !s._past && typeof s.lat === "number")
          .map((s) => ({ s, km: distanceKm(here, s) }))
          .sort((a, b) => a.km - b.km)
          .slice(0, 3);
        if (near.length) {
          const n = near[0];
          const when = `${dowFmt.format(n.s._day).replace(".", "")} ${n.s._day.getDate()}.${n.s._day.getMonth() + 1}.`;
          geoStatus.innerHTML =
            `<span class="geo-pin">📍</span> Am nächsten bei dir: ` +
            `<a href="#${encodeURIComponent(n.s.id)}"><strong>${escape(n.s.title)}</strong></a>, ${escape(when)} in ${escape(n.s.city)} · ` +
            `<span class="dist">${formatKm(n.km)}</span>` +
            (near.length > 1
              ? ` <span class="geo-more">· danach ${near
                  .slice(1)
                  .map((x) => `${escape(x.s.city)} (${formatKm(x.km)})`)
                  .join(", ")}</span>`
              : "");
        } else {
          geoStatus.textContent =
            "Standort gefunden – die Distanzen stehen jetzt bei jeder Show.";
        }
        render();
      },
      () => {
        locateBtn.disabled = false;
        geoStatus.textContent =
          "Standort nicht verfügbar. Kein Stress, die Agenda geht auch so.";
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  });

  // --- Scrolling ---
  const filters = el("filters");

  // Month headings stick below the filter bar, so expose its real height to CSS.
  const setBarHeight = () =>
    document.documentElement.style.setProperty(
      "--bar-h",
      `${filters.offsetHeight}px`,
    );
  setBarHeight();
  if ("ResizeObserver" in window)
    new ResizeObserver(setBarHeight).observe(filters);

  // Show a divider under the filter bar only once it is actually stuck.
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) =>
      filters.classList.toggle("stuck", !entry.isIntersecting),
    ).observe(el("stuck-sentinel"));
  }

  // After filtering, the list may get shorter than the current scroll position;
  // jump back to the start of the results so the user doesn't land in empty space.
  function renderAndKeepInView() {
    render();
    const listTop =
      list.getBoundingClientRect().top +
      window.scrollY -
      filters.offsetHeight -
      8;
    if (window.scrollY > listTop) window.scrollTo({ top: listTop });
  }

  // Scroll arrows for the chip row: only shown when there is something hidden in that direction.
  const genreWrap = genreBar.parentElement;
  function updateChipArrows() {
    const canLeft = genreBar.scrollLeft > 2;
    const canRight =
      genreBar.scrollLeft + genreBar.clientWidth < genreBar.scrollWidth - 2;
    genreWrap.classList.toggle("can-left", canLeft);
    genreWrap.classList.toggle("can-right", canRight);
    genreWrap.querySelector(".scroll-btn.left").hidden = !canLeft;
    genreWrap.querySelector(".scroll-btn.right").hidden = !canRight;
  }
  genreBar.addEventListener("scroll", updateChipArrows, { passive: true });
  window.addEventListener("resize", updateChipArrows);
  genreWrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".scroll-btn");
    if (btn)
      genreBar.scrollBy({
        left: Number(btn.dataset.dir) * genreBar.clientWidth * 0.7,
      });
  });

  // Drag the chip row with the mouse (touch scrolls natively). A real drag suppresses the click.
  let drag = null;
  genreBar.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") return;
    drag = { x: e.clientX, left: genreBar.scrollLeft, moved: false };
    genreBar.style.scrollBehavior = "auto";
  });
  genreBar.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) drag.moved = true;
    genreBar.scrollLeft = drag.left - dx;
  });
  const endDrag = () => {
    if (!drag) return;
    genreBar.style.scrollBehavior = "";
    const moved = drag.moved;
    drag = null;
    if (moved)
      genreBar.addEventListener("click", (e) => e.stopPropagation(), {
        capture: true,
        once: true,
      });
  };
  genreBar.addEventListener("pointerup", endDrag);
  genreBar.addEventListener("pointerleave", endDrag);
  genreBar.addEventListener("pointercancel", endDrag);

  genreBar.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    activeGenre = activeGenre === btn.dataset.genre ? "" : btn.dataset.genre;
    if (btn.dataset.genre === "") genreBar.scrollTo({ left: 0 });
    for (const c of genreBar.querySelectorAll(".chip")) {
      c.setAttribute("aria-pressed", String(c.dataset.genre === activeGenre));
    }
    renderAndKeepInView();
  });

  cantonSelect.addEventListener("change", renderAndKeepInView);
  search.addEventListener("input", renderAndKeepInView);
  init();
})();
