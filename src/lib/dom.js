/* The elements the stores reach into (focus, scrolling, panel sizing, the star echo) – one list instead of
 * string literals spread over the stores. Each id / class here is rendered by the component named next to
 * it; tests/test_contract.py (DomContract) fails when a component stops rendering one, so a rename cannot
 * silently break a store's focus or scroll handling. The e2e suite uses the same ids. */

export const ID = {
  filters: "filters", // FilterBar.svelte – the sticky form (its height is the scroll offset, --panel-top)
  q: "q", // FilterBar.svelte – the search field
  wherePanel: "where-panel", // WherePanel.svelte
  whenPanel: "when-panel", // WhenPanel.svelte
  toggleWhere: "toggle-where", // WhereToggle.svelte
  toggleWhen: "toggle-when", // WhenToggle.svelte
  views: "views", // App.svelte – the region of the three views
  list: "list", // App.svelte – the list view
  status: "status", // Status.svelte
  results: "results", // ResultsRow.svelte – the result count
  minePanel: "mine-panel", // MinePanel.svelte
  listTitle: "list-title", // ListHead.svelte
  toggleMine: "toggle-mine", // MineToggle.svelte – the ★ button
  undo: "undo", // UndoToast.svelte
};

export const CLASS = {
  resultsRow: "results-row", // ResultsRow.svelte
  chip: "chip", // WherePanel / WhenPanel / GenreChips
  show: "show", // Row.svelte – one row, with data-id = the show's id
  star: "star", // Row.svelte – the ★ action of a row
};

export const byId = (id) => document.getElementById(id);

/** The ★ button of the row of show `id` (Row.svelte), or null. */
export const starOf = (id) =>
  document.querySelector(`.${CLASS.show}[data-id="${CSS.escape(id)}"] .${CLASS.star}`);
