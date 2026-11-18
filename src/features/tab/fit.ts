/**
 * Feature: tab.fit
 *
 * Decides the width of the tabs, and what happens when even the narrowest do not fit: the tabs share the strip down
 * to 96 px each, then the strip scrolls and **All tabs** is shown at its right end.
 */

/** The widest a tab is, in px (Datardo's choice). */
export const widestTab = 200;

/** The narrowest a tab is narrowed to, in px, unless its whole title needs less (Datardo's choice). */
export const narrowestTab = 96;

/** The px kept at the right end of the strip for **All tabs** while it is shown (Datardo's choice). */
export const allTabsWidth = 40;

/** How the tabs share the strip. */
export interface Fit {
  /** The width of each tab, in the order given, in whole px. */
  readonly widths: readonly number[];
  /** Whether the strip scrolls sideways, and **All tabs** is shown. */
  readonly scrolls: boolean;
}

/**
 * The common limit the tabs wider than it are narrowed to so that all of them take `room` px: the tabs that need less
 * keep their width, and the others share what is left. `Infinity` when every tab fits as it is.
 */
export function commonLimit(needs: readonly number[], room: number): number {
  const sorted = [...needs].sort((one, other) => one - other);
  let left = room;
  for (let index = 0; index < sorted.length; index += 1) {
    const share = left / (sorted.length - index);
    const need = sorted[index] ?? 0;
    if (need > share) {
      return share;
    }
    left -= need;
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * Feature: tab.fit
 *
 * The width of each tab, given the width of the strip, the width of each group's label (never narrowed), and the
 * width each tab's whole title needs, all in px.
 */
export function fit(stripWidth: number, labels: readonly number[], tabs: readonly number[]): Fit {
  const needs = tabs.map((need) => Math.min(Math.max(0, need), widestTab));
  const room = stripWidth - labels.reduce((sum, width) => sum + width, 0);
  const limit = commonLimit(needs, room);
  if (limit === Number.POSITIVE_INFINITY) {
    return { widths: needs.map((need) => Math.round(need)), scrolls: false };
  }
  if (limit >= narrowestTab) {
    const whole = Math.floor(limit);
    return { widths: needs.map((need) => Math.round(Math.min(need, whole))), scrolls: false };
  }
  return { widths: needs.map((need) => Math.round(Math.min(need, narrowestTab))), scrolls: true };
}
