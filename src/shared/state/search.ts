/**
 * The part of the app's state about the Search documents page (`search.show`): for each page tab, the search that runs
 * or ran last, as the main process reads it (`search.scan`), and what the main process asks the page to do (set its
 * scope to a node of the tree, or fill it and search, for the tool `open_search`). A search is kept until its tab
 * closes or Datardo quits; it is never saved.
 *
 * The search is kept as the search area writes it (`SearchRun` of `src/features/search/types`), which this folder may
 * not import (R1.3): its head without its collections, and the scan of each collection apart, so that the news of one
 * collection changes only it.
 */
import type { Json } from '../engine-request';
import type { TabId } from '../ids';

/** What the main process asks a page tab: a scope, or a whole input to search with; a new number each time. */
export interface SearchAsk {
  readonly number: number;
  readonly ask: Json;
}

/** One page tab's search. */
export interface SearchTabState {
  /** The head of the search: everything but its collections. */
  readonly run?: Json;
  /** The scan of each collection, in the order of `search.collections`. */
  readonly scans: readonly Json[];
  readonly ask?: SearchAsk;
}

/** This part of the state. */
export interface SearchState {
  readonly tabs: Readonly<Record<string, SearchTabState>>;
  /** The number the next ask takes. */
  readonly nextAsk: number;
}

/** The events of this part of the state. */
export type SearchStateEvent =
  /** The head of the search changed; with `scans`, its collections are replaced too (a new search, its listing). */
  | {
      readonly slice: 'search';
      readonly type: 'run';
      readonly tab: TabId;
      readonly run: Json;
      readonly scans?: readonly Json[];
    }
  /** One collection of the search has news. */
  | {
      readonly slice: 'search';
      readonly type: 'scan';
      readonly tab: TabId;
      readonly index: number;
      readonly scan: Json;
    }
  | { readonly slice: 'search'; readonly type: 'asked'; readonly tab: TabId; readonly ask: Json }
  /** The tab closed: its search is forgotten. */
  | { readonly slice: 'search'; readonly type: 'forgotten'; readonly tab: TabId };

/** No search. */
export const initialSearchState: SearchState = { tabs: {}, nextAsk: 1 };

function tabOf(state: SearchState, tab: TabId): SearchTabState {
  return state.tabs[tab] ?? { scans: [] };
}

function withTab(state: SearchState, tab: TabId, changed: SearchTabState): SearchState {
  return { ...state, tabs: { ...state.tabs, [tab]: changed } };
}

/** Changes this part of the state. */
export function reduceSearch(state: SearchState, event: SearchStateEvent): SearchState {
  const before = tabOf(state, event.tab);
  switch (event.type) {
    case 'run':
      return withTab(state, event.tab, { ...before, run: event.run, scans: event.scans ?? before.scans });
    case 'scan': {
      if (event.index < 0 || event.index >= before.scans.length) {
        return state;
      }
      const scans = before.scans.map((scan, index) => (index === event.index ? event.scan : scan));
      return withTab(state, event.tab, { ...before, scans });
    }
    case 'asked':
      return {
        ...withTab(state, event.tab, { ...before, ask: { number: state.nextAsk, ask: event.ask } }),
        nextAsk: state.nextAsk + 1,
      };
    case 'forgotten': {
      const tabs = Object.fromEntries(Object.entries(state.tabs).filter(([tab]) => tab !== event.tab));
      return { ...state, tabs };
    }
  }
}
