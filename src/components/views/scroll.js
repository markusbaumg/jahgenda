/* Scrolls the page makes itself (story #33 M4, app.js quietScrollUntil). The scrolling and focus keeping
 * around a list change itself – keep-in-view, the focus restore, the #list view transition – is
 * ui.applyFilter / ui.scrollUnderBar in the filter store (M1). */

// A scroll the page made itself (deep link, view switch, a day picked in the calendar) is not the
// visitor's: the subscribe nudge waits for a scroll of their own.
let quietUntil = 0;
export const quietScroll = (ms) => {
  quietUntil = Math.max(quietUntil, Date.now() + ms);
};
export const isQuietScroll = () => Date.now() < quietUntil;
