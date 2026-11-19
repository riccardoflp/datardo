/**
 * Feature: query.reset
 *
 * Empties the bar and shows the collection again from its first document. The mode, the page size, the columns and
 * whether the builder is open are kept; `query.run` starts at once with the empty query.
 */
import { emptySelection } from '../table/types';
import { emptyTexts, type QueryState } from './types';

/**
 * Feature: query.reset
 *
 * The state with **Filter**, **Sort**, **Project**, **Skip** and **Limit** empty, the first page, no error line, no
 * field outlined and no selection.
 */
export function resetQuery(state: QueryState): QueryState {
  const { error: _error, ...rest } = state;
  return { ...rest, texts: emptyTexts, page: 1, invalid: [], selection: emptySelection };
}
