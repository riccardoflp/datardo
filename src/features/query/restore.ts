/**
 * Feature: query.restore
 *
 * A collection tab comes back as it was left: its mode, its query as last run, its page and page size, and whether
 * the builder was open. What is kept may be missing or partly unusable; each part then takes its default.
 */
import { emptySelection } from '../table/types';
import {
  defaultPageSize,
  emptyTexts,
  isPageSize,
  queryFields,
  type PageSize,
  type QueryMode,
  type QueryState,
  type QueryTexts,
} from './types';

/** What a tab keeps of its query (`TabMemory.query`, as JSON text). */
export interface KeptQuery {
  readonly mode: QueryMode;
  readonly texts: QueryTexts;
  readonly page: number;
  readonly pageSize: PageSize;
  readonly builderOpen: boolean;
}

function fieldsOf(kept: unknown): Readonly<Record<string, unknown>> {
  if (typeof kept === 'string') {
    try {
      return fieldsOf(JSON.parse(kept) as unknown);
    } catch {
      // Kept text that is not JSON is unusable: every part takes its default, as the card says.
      return {};
    }
  }
  return typeof kept === 'object' && kept !== null && !Array.isArray(kept) ? (kept as Record<string, unknown>) : {};
}

function textsOf(value: unknown): QueryTexts {
  const fields = fieldsOf(value);
  return Object.fromEntries(
    queryFields.map((field) => {
      const each = fields[field];
      return [field, typeof each === 'string' ? each : emptyTexts[field]];
    }),
  ) as QueryTexts;
}

/**
 * Feature: query.restore
 *
 * The query a tab restores from what was kept for it: the mode `find`, empty texts, page 1, page size 50 and the
 * builder closed where a part is missing or unusable; a page size that is not one of the list becomes 50.
 */
export function restoredQuery(kept: unknown): KeptQuery {
  const fields = fieldsOf(kept);
  const page = fields['page'];
  return {
    mode: fields['mode'] === 'aggregate' ? 'aggregate' : 'find',
    texts: textsOf(fields['texts']),
    page: typeof page === 'number' && Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize: isPageSize(fields['pageSize']) ? fields['pageSize'] : defaultPageSize,
    builderOpen: fields['builderOpen'] === true,
  };
}

/** What a tab keeps of its state: the query as it was last run, never a text typed and not run. */
export function keptQuery(state: QueryState): KeptQuery {
  return {
    mode: state.mode,
    texts: state.ran ?? emptyTexts,
    page: state.page,
    pageSize: state.pageSize,
    builderOpen: state.builderOpen,
  };
}

/** The kept query as the text `TabMemory.query` holds. */
export function keptText(kept: KeptQuery): string {
  return JSON.stringify(kept);
}

/** The state of a restored tab, which runs its query at once. */
export function restoredState(kept: KeptQuery): QueryState {
  return {
    mode: kept.mode,
    texts: kept.texts,
    ran: kept.texts,
    page: kept.page,
    pageSize: kept.pageSize,
    builderOpen: kept.builderOpen,
    invalid: [],
    selection: emptySelection,
  };
}
