/**
 * `tab.fit` in the window: measures the strip, the labels of the groups and the width each tab's whole title needs
 * (in a hidden copy of the tabs), and gives each tab the width `fit` decides.
 */
import { useLayoutEffect, useState } from 'react';
import { fit, type Fit } from '../../../features/tab/fit';

/** The widths of the tabs by identifier, and whether the strip scrolls. */
export interface FittedTabs {
  readonly widths: ReadonlyMap<string, number>;
  readonly scrolls: boolean;
}

function horizontalSpace(element: Element, sides: readonly ('padding' | 'margin')[]): number {
  const style = getComputedStyle(element);
  return sides.reduce(
    (sum, side) =>
      sum +
      (Number.parseFloat(style.getPropertyValue(`${side}-left`)) || 0) +
      (Number.parseFloat(style.getPropertyValue(`${side}-right`)) || 0),
    0,
  );
}

/** What each group takes besides its tabs: its label, its margin and the gaps between its tabs. */
function groupRooms(scroller: HTMLElement): number[] {
  return [...scroller.querySelectorAll<HTMLElement>('[data-group]')].map((group) => {
    const label = group.querySelector<HTMLElement>('[data-group-label]');
    const count = group.querySelectorAll('[data-tab-id]').length;
    const gap = Number.parseFloat(getComputedStyle(group).columnGap) || 0;
    return (
      (label?.offsetWidth ?? 0) +
      horizontalSpace(group, ['margin']) +
      gap * Math.max(0, count + (label === null ? -1 : 0))
    );
  });
}

function measured(
  strip: HTMLElement,
  scroller: HTMLElement,
  measure: HTMLElement,
): { readonly ids: string[]; readonly result: Fit } {
  const copies = [...measure.querySelectorAll<HTMLElement>('[data-measure-id]')];
  const ids = copies.map((copy) => copy.dataset['measureId'] ?? '');
  const needs = copies.map((copy) => Math.ceil(copy.getBoundingClientRect().width));
  const width = strip.clientWidth - horizontalSpace(strip, ['padding']);
  return { ids, result: fit(width, groupRooms(scroller), needs) };
}

/** Fits the tabs whenever the strip changes size or the tabs or their titles change (`shape` names them). */
export function useFit(
  strip: React.RefObject<HTMLElement | null>,
  scroller: React.RefObject<HTMLElement | null>,
  measure: React.RefObject<HTMLElement | null>,
  shape: string,
): FittedTabs {
  const [fitted, setFitted] = useState<FittedTabs>({ widths: new Map(), scrolls: false });
  useLayoutEffect(() => {
    const outer = strip.current;
    const inner = scroller.current;
    const copies = measure.current;
    if (outer === null || inner === null || copies === null) {
      return undefined;
    }
    const update = (): void => {
      const { ids, result } = measured(outer, inner, copies);
      const widths = new Map(ids.map((id, index) => [id, result.widths[index] ?? 0]));
      setFitted((before) => {
        const same =
          before.scrolls === result.scrolls &&
          before.widths.size === widths.size &&
          [...widths].every(([id, width]) => before.widths.get(id) === width);
        return same ? before : { widths, scrolls: result.scrolls };
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(outer);
    return () => {
      observer.disconnect();
    };
  }, [strip, scroller, measure, shape]);
  return fitted;
}
