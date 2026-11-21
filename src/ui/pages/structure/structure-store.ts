/**
 * What a structure comparison page keeps in the window, one for each tab (`structure.show`): the state its view is
 * drawn from, the sides of the last comparison (which the operations of the page are started with), whether a
 * comparison has started yet, and the work in progress of the one that runs. The reads and the operations are in
 * `./structure-runs.ts`.
 */
import { useSyncExternalStore } from 'react';
import type { StructurePageState } from '../../../features/structure/show';
import type { DifferenceKind, StructureSide } from '../../../features/structure/types';
import type { WorkId } from '../../../shared/ids';

/** The page of one tab. */
export interface StructureTab {
  readonly page: StructurePageState;
  /** The sides the result of the page was read on. */
  readonly compared?: { readonly left: StructureSide; readonly right: StructureSide };
  /** Whether a comparison has started: the first one starts by itself, later ones wait for **Compare**. */
  readonly started: boolean;
  /** The number of the comparison in flight: an older one that answers late is dropped. */
  readonly run: number;
  readonly work?: WorkId;
  /** What was last kept with the tab (`structure.keep`), as JSON, so that the same is not kept twice. */
  readonly kept?: string;
}

const tabs = new Map<string, StructureTab>();
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
export function useStructureTab(tab: string): StructureTab | undefined {
  return useSyncExternalStore(subscribe, () => tabs.get(tab));
}

/** Draws again whenever a page changes: for what the pages add to the active tab (`nav.inspector`). */
export function useStructureChanges(): number {
  return useSyncExternalStore(subscribe, () => version);
}

/** The page of a tab, as it is now. */
export function structureTabOf(tab: string): StructureTab | undefined {
  return tabs.get(tab);
}

/** Sets the page of a tab. */
export function setStructureTab(tab: string, next: StructureTab): void {
  tabs.set(tab, next);
  told();
}

/** Changes the page of a tab, when it has one. */
export function changeStructureTab(tab: string, change: (page: StructureTab) => StructureTab): void {
  const page = tabs.get(tab);
  if (page !== undefined) {
    tabs.set(tab, change(page));
    told();
  }
}

/** Changes the state the view is drawn from. */
export function changeStructurePage(tab: string, change: (page: StructurePageState) => StructurePageState): void {
  changeStructureTab(tab, (each) => ({ ...each, page: change(each.page) }));
}

/** A chip pressed: only the rows of its kind; pressed again, all of them. Pressing *same* turns **All** on. */
export function pressStructureChip(tab: string, kind: DifferenceKind): void {
  changeStructurePage(tab, (page) => {
    const { chip: _chip, ...rest } = page;
    return page.chip === kind ? rest : { ...rest, chip: kind, showAll: kind === 'same' ? true : page.showAll };
  });
}

/** A group's head clicked: it folds, or unfolds. */
export function toggleGroup(tab: string, collection: string): void {
  changeStructurePage(tab, (page) => ({
    ...page,
    folded: page.folded.includes(collection)
      ? page.folded.filter((each) => each !== collection)
      : [...page.folded, collection],
  }));
}

/** Selects a difference: its detail in the inspector island. */
export function selectDifference(tab: string, id: string): void {
  changeStructurePage(tab, (page) => (page.selected === id ? page : { ...page, selected: id }));
}
