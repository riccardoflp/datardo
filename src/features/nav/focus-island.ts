/**
 * Feature: nav.focus-island
 *
 * `F6` takes the focus from one part of the window to the next, `Shift+F6` to the one before, so that no part needs
 * the mouse. While a dialog or Go to is open the window does not ask (`nav.dialog`).
 */

/** The parts of the window `F6` goes through, in their order. */
export const islandOrder = ['rail', 'connection', 'tree', 'main', 'inspector', 'status'] as const;

/** A part of the window `F6` goes to. */
export type FocusIsland = (typeof islandOrder)[number];

/** Which way `F6` goes. */
export type FocusDirection = 'next' | 'previous';

/**
 * The part that takes the focus: the next shown part after the one focused, round again; from the top bar or from
 * nowhere (`undefined`), the first part forward and the last backward. `undefined` when no part is shown.
 */
export function nextIsland(
  shown: readonly FocusIsland[],
  focused: FocusIsland | undefined,
  direction: FocusDirection,
): FocusIsland | undefined {
  const parts = islandOrder.filter((part) => shown.includes(part));
  if (parts.length === 0) {
    return undefined;
  }
  const step = direction === 'next' ? 1 : -1;
  if (focused === undefined) {
    return direction === 'next' ? parts[0] : parts[parts.length - 1];
  }
  const start = islandOrder.indexOf(focused);
  for (let offset = 1; offset <= islandOrder.length; offset += 1) {
    const candidate = islandOrder[(start + step * offset + islandOrder.length * 2) % islandOrder.length];
    if (candidate !== undefined && parts.includes(candidate)) {
      return candidate;
    }
  }
  return undefined;
}
