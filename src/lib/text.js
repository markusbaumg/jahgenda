/* Small text and date helpers shared by the page, the calendar export and the tests.
 * No DOM, no location, no clock inside. */

export const pad2 = (n) => String(n).padStart(2, "0");

// Dates are local calendar days ("YYYY-MM-DD"); parse without timezone shifts.
export const parseDay = (s) => {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, m - 1, d);
};

// The validator's artist_key / venue key rule: lowercase ASCII letters and digits only.
export const venueKey = (name) =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

export const escape = (s) =>
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

export const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");
