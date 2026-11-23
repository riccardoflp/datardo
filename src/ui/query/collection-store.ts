/**
 * The window's own memory of each collection tab (architecture, "State"): its query bar (`QueryState`), the documents
 * of the page shown, the count, how the last read went, the fields of its sample, the selected cell and the rows of
 * the builder. It is kept until the tab closes or Datardo quits; what a tab keeps across starts is its query as last
 * run, in `TabMemory.query`, which the main process keeps when `query.run` reads (`query.restore`).
 */
import { useSyncExternalStore } from 'react';
import type { BuilderRow, Combine } from '../../features/query/builder-filter';
import type { FieldHint } from '../../features/query/field-hints';
import { initialQuery, type QueryField, type QueryState, type QueryTexts } from '../../features/query/types';
import type { Position } from '../../features/table/navigate';
import type { CountState } from '../../features/table/paging';
import type { ShowPhase } from '../../features/table/show';
import type { Document } from '../../features/table/types';
import type { TabId } from '../../shared/ids';

/** The fields of the collection for the suggestions: not read yet, being read, read, or to read again. */
export type HintsState =
  | { readonly kind: 'unread' }
  | { readonly kind: 'reading' }
  | { readonly kind: 'read'; readonly fields: readonly FieldHint[] };

/** The rows of the builder as typed, with how they combine. */
export interface BuilderMemory {
  readonly rows: readonly BuilderRow[];
  readonly combine: Combine;
}

/** What the window keeps of one collection tab. */
export interface CollectionTab {
  /** Whether the tab was started: its query read from what it kept, and run once. */
  readonly started: boolean;
  readonly query: QueryState;
  /** The documents of the page shown, every type kept. */
  readonly documents: readonly Document[];
  /** Whether rows were shown by this read or the one before it. */
  readonly hasRows: boolean;
  readonly phase: ShowPhase;
  readonly count: CountState;
  /** How long the server took for the documents of the page shown, in ms. */
  readonly milliseconds?: number;
  /** The time the query last run was run: `ISODate()` in it, for the documents and for the count. */
  readonly ranAt: number;
  /** **Skip** and **Limit** of the query as it was last run, as the paging uses them. */
  readonly ranSkip: number;
  readonly ranLimit?: number;
  /** A query of the tab is running: the run button reads **Cancel**. */
  readonly running: boolean;
  readonly hints: HintsState;
  readonly cell?: Position;
  readonly builder: BuilderMemory;
  /** A field of the bar to flash once, after a drop wrote into it. */
  readonly flash?: { readonly field: QueryField; readonly at: number };
  /** Asks the field **Filter** for the focus with its text selected (`Ctrl+F`): a new number each time. */
  readonly focusFilter: number;
}

/** A collection tab before anything was read. */
export const freshTab: CollectionTab = {
  started: false,
  query: initialQuery,
  documents: [],
  hasRows: false,
  phase: { kind: 'loading' },
  count: { kind: 'pending' },
  ranAt: 0,
  ranSkip: 0,
  running: false,
  hints: { kind: 'unread' },
  builder: { rows: [], combine: 'all' },
  focusFilter: 0,
};

const tabs = new Map<TabId, CollectionTab>();
const listeners = new Set<() => void>();

/** What the window keeps of a collection tab. */
export function collectionOf(tab: TabId): CollectionTab {
  return tabs.get(tab) ?? freshTab;
}

/** Changes what the window keeps of a collection tab, and draws it again. */
export function changeCollection(tab: TabId, change: (before: CollectionTab) => CollectionTab): void {
  const before = collectionOf(tab);
  const after = change(before);
  if (after === before) {
    return;
  }
  tabs.set(tab, after);
  for (const listener of listeners) {
    listener();
  }
}

/** Changes the query bar of a collection tab. */
export function changeQuery(tab: TabId, change: (before: QueryState) => QueryState): void {
  changeCollection(tab, (before) => {
    const query = change(before.query);
    return query === before.query ? before : { ...before, query };
  });
}

/** Forgets the tabs that are no longer open. */
export function forgetClosed(open: ReadonlySet<TabId>): void {
  for (const tab of [...tabs.keys()]) {
    if (!open.has(tab)) {
      tabs.delete(tab);
    }
  }
}

/** The texts of the query as last run, or as the bar reads them before the first run. */
export function textsRan(collection: CollectionTab): QueryTexts {
  return collection.query.ran ?? collection.query.texts;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A collection tab as the window keeps it, drawn again whenever it changes. */
export function useCollection(tab: TabId | undefined): CollectionTab {
  return useSyncExternalStore(subscribe, () => (tab === undefined ? freshTab : collectionOf(tab)));
}

/** Whether the tab shows the answer of a read, rows or the message of an empty result, which stays while it runs again. */
export function shownBefore(before: CollectionTab): boolean {
  return before.hasRows || before.phase.kind === 'shown' || before.phase.kind === 'running';
}
