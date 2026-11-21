/**
 * The part of the app's state about the recent and saved queries (`saved-query.show`, `saved-query.run`): the query
 * `saved-query.run` put in a collection tab, which the window then shows in the query bar or the pipeline editor and
 * runs; and a number per connection that grows each time its saved or recent queries change (a save, a rename, a file
 * of its queries folder changed on disk), so that the open queries list, Go to and **Pinned** read them again.
 */
import type { Json } from '../engine-request';
import type { ConnectionId, TabId } from '../ids';

/** A query to put in a collection tab and run: the query as `saved-query` writes it, and a new number each time. */
export interface QueryLoad {
  readonly number: number;
  readonly query: Json;
}

/** This part of the state. */
export interface SavedQueryState {
  /** The last query loaded into each collection tab, by tab. */
  readonly loads: Readonly<Record<string, QueryLoad>>;
  /** The number the next load takes. */
  readonly nextLoad: number;
  /** How many times the queries of each connection changed in this run, by connection id. */
  readonly revisions: Readonly<Record<string, number>>;
}

/** The events of this part of the state. */
export type SavedQueryEvent =
  | { readonly slice: 'saved-query'; readonly type: 'loaded'; readonly tab: TabId; readonly query: Json }
  | { readonly slice: 'saved-query'; readonly type: 'changed'; readonly connection: ConnectionId };

/** Nothing loaded, nothing changed. */
export const initialSavedQueryState: SavedQueryState = { loads: {}, nextLoad: 1, revisions: {} };

/** How many times the queries of a connection changed in this run. */
export function revisionOf(state: SavedQueryState, connection: string): number {
  return state.revisions[connection] ?? 0;
}

/** Changes this part of the state. */
export function reduceSavedQuery(state: SavedQueryState, event: SavedQueryEvent): SavedQueryState {
  switch (event.type) {
    case 'loaded':
      return {
        ...state,
        loads: { ...state.loads, [event.tab]: { number: state.nextLoad, query: event.query } },
        nextLoad: state.nextLoad + 1,
      };
    case 'changed':
      return {
        ...state,
        revisions: { ...state.revisions, [event.connection]: revisionOf(state, event.connection) + 1 },
      };
  }
}
