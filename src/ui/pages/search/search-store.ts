/**
 * What the window keeps of each Search documents tab (`search.show`) until Datardo quits: the input as the page shows
 * it, why the last **Search** could not start, the groups folded, the item selected and the document the inspector
 * island shows of it. The search itself is the main process's, in the app's state (`search` slice); the input is kept
 * with the tab once it settles (`tab.restore`).
 */
import { useSyncExternalStore } from 'react';
import type { SearchInput } from '../../../features/search/types';
import type { JsonRecord } from '../../../features/document/types';
import type { ConnectionId } from '../../../shared/ids';

/** The item selected, by its group and the text of its `_id`, with what the inspector needs to read it. */
export interface SearchSelection {
  readonly key: string;
  readonly idText: string;
  readonly database: string;
  readonly collection: string;
  readonly view: boolean;
  readonly id: unknown;
}

/** The document of the item selected, as `document.read` gave it. */
export type InspectedDocument =
  | { readonly kind: 'reading' }
  | { readonly kind: 'read'; readonly document: JsonRecord }
  | { readonly kind: 'gone' }
  | { readonly kind: 'failed'; readonly message: string };

/** What one Search documents tab keeps in the window. */
export interface SearchTab {
  readonly connection: ConnectionId;
  readonly input: SearchInput;
  readonly error?: string;
  readonly folded: readonly string[];
  readonly selected?: SearchSelection;
  readonly inspected?: InspectedDocument;
  /** The number of the last ask of the main process the page followed. */
  readonly askFollowed: number;
}

const tabs = new Map<string, SearchTab>();
const listeners = new Set<() => void>();
let version = 0;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function changedAll(): void {
  version += 1;
  for (const listener of listeners) {
    listener();
  }
}

/** What a tab keeps, when the page was shown in this run. */
export function searchTabOf(tab: string): SearchTab | undefined {
  return tabs.get(tab);
}

/** Keeps the state of a tab shown for the first time. */
export function keepSearchTab(tab: string, state: SearchTab): void {
  tabs.set(tab, state);
  changedAll();
}

/** Changes what a tab keeps, and draws the page again. */
export function changeSearchTab(tab: string, change: (state: SearchTab) => SearchTab): void {
  const state = tabs.get(tab);
  if (state !== undefined) {
    tabs.set(tab, change(state));
    changedAll();
  }
}

/** Forgets the tabs that are no longer open. */
export function forgetClosedSearchTabs(open: ReadonlySet<string>): void {
  let changed = false;
  for (const tab of tabs.keys()) {
    if (!open.has(tab)) {
      tabs.delete(tab);
      changed = true;
    }
  }
  if (changed) {
    changedAll();
  }
}

/** What a tab keeps, drawn again whenever it changes. */
export function useSearchTab(tab: string | undefined): SearchTab | undefined {
  useSyncExternalStore(subscribe, () => version);
  return tab === undefined ? undefined : tabs.get(tab);
}
