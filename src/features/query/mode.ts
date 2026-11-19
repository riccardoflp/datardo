/**
 * Feature: query.mode
 *
 * Switches a collection tab between Find (a filter run with `find`) and Aggregate (a pipeline). The texts of the bar
 * and the stages of the pipeline are kept; the query of the new mode runs at once.
 */
import { emptySelection } from '../table/types';
import type { QueryMode, QueryState } from './types';

/**
 * Feature: query.mode
 *
 * The tab's state in the mode wanted: the first page, an empty error line, no selection, the texts untouched. The
 * mode the tab is already in changes nothing.
 */
export function switchedMode(state: QueryState, mode: QueryMode): QueryState {
  if (state.mode === mode) {
    return state;
  }
  const { error: _error, ...rest } = state;
  return { ...rest, mode, page: 1, invalid: [], selection: emptySelection };
}

/** What runs after a switch: `query.run` in Find, `aggregate.run` in Aggregate; nothing when the mode is the same. */
export function readAfterSwitch(before: QueryState, mode: QueryMode): 'query.run' | 'aggregate.run' | undefined {
  if (before.mode === mode) {
    return undefined;
  }
  return mode === 'find' ? 'query.run' : 'aggregate.run';
}
