/* Jahgenda client-side storage.
 * Everything the page remembers for a visitor (marks, chosen view, install-banner dismissal, …) goes
 * through this one object, so the backend can change later (localStorage today, a database or account
 * sync tomorrow) without touching the rest of the code. Values are JSON; every call is safe in private
 * mode or with blocked storage (falls back to an in-memory map for the page view). */
(() => {
  const PREFIX = "jahgenda.";
  const memory = new Map();

  const backend = {
    get(key) {
      try {
        return localStorage.getItem(PREFIX + key);
      } catch {
        return memory.has(key) ? memory.get(key) : null;
      }
    },
    set(key, raw) {
      memory.set(key, raw);
      try {
        localStorage.setItem(PREFIX + key, raw);
      } catch {
        /* private mode / quota: memory only */
      }
    },
    remove(key) {
      memory.delete(key);
      try {
        localStorage.removeItem(PREFIX + key);
      } catch {
        /* ignore */
      }
    },
  };

  window.jahStore = {
    /** Read a value; `fallback` when missing or unreadable. */
    get(key, fallback = null) {
      const raw = backend.get(key);
      if (raw === null || raw === undefined) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    /** Store any JSON-serialisable value. */
    set(key, value) {
      backend.set(key, JSON.stringify(value));
    },
    remove(key) {
      backend.remove(key);
    },
    /** Keys in use — documented here so a future migration knows what to move. */
    KEYS: {
      MARKS: "marks", // { showId: "interested" | "going" }
      VIEW: "view", // "list" | "calendar" | "map"
      INSTALL_DISMISSED: "install.dismissed", // timestamp (ms) or "forever"
      VISITS: "visits", // number of page loads in this browser (the install nudge waits for the 2nd)
    },
  };
})();
