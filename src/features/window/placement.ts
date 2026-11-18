/**
 * Feature: window.placement
 *
 * Decides the size and place of the window at start, also when the display it was on is gone.
 */

/** A rectangle of the screen, in the system's pixels: a display's work area or a window's bounds. */
export interface Rectangle {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** What `window.remember` saves, and what this returns: the bounds when not maximized, and whether it is. */
export interface Placement extends Rectangle {
  readonly maximized: boolean;
}

/** The size the window opens with when nothing usable was saved. */
export const defaultSize = { width: 1280, height: 800 } as const;

/** The smallest window, on every platform (`window.frame`). */
export const minimumSize = { width: 640, height: 400 } as const;

/** A saved size under this is not used (Mongoster's check). */
const smallestSaved = { width: 400, height: 300 } as const;

/** How much of the window's width must be on a display for it to stay there (Datardo's choice). */
const visibleWidth = 100;

/** The height of the top bar, which must be whole on a display (`window.frame`). */
const topBarHeight = 40;

/**
 * Feature: window.placement
 *
 * The rules of the card, in order: the saved size or the default, within the minimum and the display; kept where it
 * was when it is on screen, centered on the primary display otherwise; maximized as saved. `displays` are the work
 * areas of the displays now connected, the primary one first.
 */
export function placement(saved: Placement | undefined, displays: readonly Rectangle[]): Placement {
  const primary = displays[0] ?? { left: 0, top: 0, ...defaultSize };
  const usable =
    saved !== undefined && saved.width >= smallestSaved.width && saved.height >= smallestSaved.height
      ? saved
      : undefined;
  const wanted = usable === undefined ? defaultSize : atLeastMinimum(usable);
  const home = usable === undefined ? undefined : displayHolding({ ...usable, ...wanted }, displays);
  const display = home ?? primary;
  const width = Math.max(minimumSize.width, Math.min(wanted.width, display.width));
  const height = Math.max(minimumSize.height, Math.min(wanted.height, display.height));
  const maximized = usable?.maximized ?? false;
  if (usable !== undefined && home !== undefined) {
    return { left: usable.left, top: usable.top, width, height, maximized };
  }
  return {
    left: display.left + Math.floor((display.width - width) / 2),
    top: display.top + Math.floor((display.height - height) / 2),
    width,
    height,
    maximized,
  };
}

function atLeastMinimum(size: { readonly width: number; readonly height: number }): {
  readonly width: number;
  readonly height: number;
} {
  return { width: Math.max(minimumSize.width, size.width), height: Math.max(minimumSize.height, size.height) };
}

/** The display the window is on screen on, holding most of it, or none (rule 3). */
function displayHolding(window: Rectangle, displays: readonly Rectangle[]): Rectangle | undefined {
  let best: Rectangle | undefined;
  let bestArea = -1;
  for (const display of displays) {
    if (!isOnScreen(window, display)) {
      continue;
    }
    const area =
      overlap(window.left, window.width, display.left, display.width) *
      overlap(window.top, window.height, display.top, display.height);
    if (area > bestArea) {
      best = display;
      bestArea = area;
    }
  }
  return best;
}

function isOnScreen(window: Rectangle, display: Rectangle): boolean {
  const width = overlap(window.left, window.width, display.left, display.width);
  const topBarInside = window.top >= display.top && window.top + topBarHeight <= display.top + display.height;
  return width >= visibleWidth && topBarInside;
}

/** How long two segments of one axis share. */
function overlap(start: number, length: number, otherStart: number, otherLength: number): number {
  return Math.max(0, Math.min(start + length, otherStart + otherLength) - Math.max(start, otherStart));
}
