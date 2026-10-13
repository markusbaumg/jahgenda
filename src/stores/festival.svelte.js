/* Festival state (story #33, M5): which line-up disclosures are open and the format filter («Festival»
 * is a format, not a genre – design/ui-revamp.md §3.3). The format itself lives in agenda.filters.format
 * (the hash, the pills and the empty state read it there); this module only toggles and counts it. */
import { SvelteSet } from "svelte/reactivity";
import { agenda, FORMAT_LABEL } from "./agenda.svelte.js";

// The line-up disclosures stay open across re-renders and remounts (a row that leaves the list and comes
// back, a month that regroups). A search hit inside a line-up opens it too and – as on main, where the
// native «toggle» event of the open <details> recorded it – it then stays open.
const open = new SvelteSet();

export const lineups = {
  isOpen: (id) => open.has(id),
  set(id, on) {
    if (on) open.add(id);
    else open.delete(id);
  },
  // A shared link lands on the open line-up (app.js highlight()): the hash story calls this for the row.
  open(id) {
    open.add(id);
  },
};

export const formats = {
  label: (f) => FORMAT_LABEL[f] || f,
  // «Dub» + «Festival» = dub festivals: a toggle of its own next to the genre.
  toggle(f) {
    agenda.filters.format = agenda.filters.format === f ? "" : f;
  },
  set(f) {
    agenda.filters.format = FORMAT_LABEL[f] ? f : "";
  },
  // Shows the list would hold with this format under every other filter (the chip count).
  count: (f) => agenda.countWith({ format: f }),
};
