/* Festival state (story #33, M5): which line-up disclosures are open. The format filter («Festival» is a
 * format, not a genre – design/ui-revamp.md §3.3) lives in agenda.filters.format; its chips are the
 * #formats group of the filter bar (filters/GenreChips.svelte, M1). */
import { SvelteSet } from "svelte/reactivity";

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
