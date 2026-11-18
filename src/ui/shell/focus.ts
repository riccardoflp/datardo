/**
 * Moves the focus between the parts of the window (`nav.focus-island`): each part is an element with `data-island`,
 * and the control that had the focus last in each is remembered, so that coming back puts the focus where it was.
 */
import { islandOrder, nextIsland, type FocusDirection, type FocusIsland } from '../../features/nav/focus-island';

const lastFocused = new Map<FocusIsland, HTMLElement>();

function isIsland(name: string | undefined): name is FocusIsland {
  return islandOrder.some((island) => island === name);
}

/** The part of the window an element is in, or `undefined` for the top bar and what is outside the shell. */
export function islandOf(element: Element | null): FocusIsland | undefined {
  const name = element?.closest<HTMLElement>('[data-island]')?.dataset['island'];
  return isIsland(name) ? name : undefined;
}

/** Remembers the control that has the focus, for its part of the window. */
export function rememberFocus(element: Element | null): void {
  const island = islandOf(element);
  if (island !== undefined && element instanceof HTMLElement) {
    lastFocused.set(island, element);
  }
}

function islandElement(island: FocusIsland): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-island="${island}"]`);
}

/** The parts of the window that are shown now, in their order. */
export function shownIslands(): FocusIsland[] {
  return islandOrder.filter((island) => islandElement(island) !== null);
}

/** Puts the focus in a part: on the control that had it last, else on the part's first control, else on the part. */
export function focusIsland(island: FocusIsland): void {
  const part = islandElement(island);
  if (part === null) {
    return;
  }
  const last = lastFocused.get(island);
  if (last?.isConnected === true && part.contains(last) && !last.matches(':disabled')) {
    last.focus();
    return;
  }
  const first =
    part.querySelector<HTMLElement>('[data-focus-first]') ??
    part.querySelector<HTMLElement>('button:not(:disabled), [href], input, [tabindex="0"]');
  (first ?? part).focus();
}

/** Whether a dialog over the window holds the focus: `F6` and the keys of the shell then do nothing. */
export function isDialogOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}

/** Moves the focus to the next or the previous part of the window. */
export function focusNextIsland(direction: FocusDirection): void {
  const next = nextIsland(shownIslands(), islandOf(document.activeElement), direction);
  if (next !== undefined) {
    focusIsland(next);
  }
}
