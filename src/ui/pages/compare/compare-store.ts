/**
 * What a comparison page keeps in the window, one for each tab (`compare.show`): the state its view is drawn from,
 * every difference of the last comparison (the list shows the first 300 of each kind, the bulk writes apply to all),
 * whether a comparison has started yet, and the work in progress of the one that runs. The reads and the writes are
 * in `./compare-runs.ts`.
 */
import { useSyncExternalStore } from 'react';
import type { ComparePageState } from '../../../features/compare/show';
import type { CompareResult, Difference, DifferenceKind } from '../../../features/compare/types';
import type { WorkId } from '../../../shared/ids';

/** The page of one tab. */
export interface CompareTab {
  readonly page: ComparePageState;
  /** Every difference of the last comparison, in the order of `compare.read`. */
  readonly differences: readonly Difference[];
  /** Whether a comparison has started: the first one starts by itself, later ones wait for **Compare**. */
  readonly compared: boolean;
  /** The number of the comparison in flight: an older one that answers late is dropped. */
  readonly run: number;
  readonly work?: WorkId;
  /** The comparison whose **Cancel** was pressed before its work in progress appeared. */
  readonly cancelled?: number;
  /** What was last kept with the tab (`compare.keep`), as JSON, so that the same is not kept twice. */
  readonly kept?: string;
  /** The counts of the last comparison, for the result while the details are read. */
  readonly found?: CompareResult;
}

const tabs = new Map<string, CompareTab>();
const listeners = new Set<() => void>();
let version = 0;

function told(): void {
  version += 1;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The page of a tab, drawn again whenever it changes. */
export function useCompareTab(tab: string): CompareTab | undefined {
  return useSyncExternalStore(subscribe, () => tabs.get(tab));
}

/** Draws again whenever a page changes: for what the pages add to the active tab (`nav.inspector`). */
export function useCompareChanges(): number {
  return useSyncExternalStore(subscribe, () => version);
}

/** The page of a tab, as it is now. */
export function compareTabOf(tab: string): CompareTab | undefined {
  return tabs.get(tab);
}

/** Sets the page of a tab. */
export function setCompareTab(tab: string, next: CompareTab): void {
  tabs.set(tab, next);
  told();
}

/** Changes the page of a tab, when it has one. */
export function changeCompareTab(tab: string, change: (page: CompareTab) => CompareTab): void {
  const page = tabs.get(tab);
  if (page !== undefined) {
    tabs.set(tab, change(page));
    told();
  }
}

/** Changes the state the view is drawn from. */
export function changePage(tab: string, change: (page: ComparePageState) => ComparePageState): void {
  changeCompareTab(tab, (each) => ({ ...each, page: change(each.page) }));
}

/** A chip pressed: only the rows of its kind; pressed again, all of them. */
export function pressChip(tab: string, kind: DifferenceKind): void {
  changePage(tab, (page) => {
    const { chip: _chip, ...rest } = page;
    return page.chip === kind ? rest : { ...rest, chip: kind };
  });
}
