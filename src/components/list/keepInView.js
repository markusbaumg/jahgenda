/* After a filter change from inside the list (a row's coat of arms), the list may get shorter than the
 * current scroll position: scroll back so the start of the results – the results row with the filter
 * pills («Bern ✕»), else the views – sits right under the sticky bar, so the filter can be undone where
 * it was made. With no result the empty state takes the list's place. Ported from app.js keepInView(). */
import { tick } from "svelte";

const byId = (id) => document.getElementById(id);
const barHeight = () => (byId("filters") ? byId("filters").offsetHeight : 0);
const underBar = (el) => el.getBoundingClientRect().top + window.scrollY - barHeight() - 8;

export async function keepInView() {
  await tick();
  const views = byId("views");
  const status = byId("status");
  if (!views) return;
  const resultsRow = document.querySelector(".results-row");
  const target = views.hidden ? status : resultsRow || views;
  if (!target || (views.hidden && !status.textContent.trim())) return;
  const top = () => underBar(target.hidden ? views : target);
  if (window.scrollY > top()) {
    window.scrollTo({ top: top() });
    // The bar grows by a row once it sticks: check the target again a moment later.
    setTimeout(() => {
      if (window.scrollY > top()) window.scrollTo({ top: top() });
    }, 80);
  }
}
