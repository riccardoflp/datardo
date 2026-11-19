/**
 * What the query area decides from: the query bar of a collection tab, its texts as typed and as last run, its page,
 * and the parts of the tab its cards change together (the error line, the invalid fields, the selection of rows).
 */
import type { Selection } from '../table/types';
import { emptySelection } from '../table/types';

/** How a collection tab queries its collection (`query.mode`). */
export type QueryMode = 'find' | 'aggregate';

/** The five fields of the query bar. */
export type QueryField = 'filter' | 'sort' | 'project' | 'skip' | 'limit';

/** The texts of the five fields. */
export type QueryTexts = Readonly<Record<QueryField, string>>;

/** The fields in the order of the bar. */
export const queryFields: readonly QueryField[] = ['filter', 'sort', 'project', 'skip', 'limit'];

/** Every field empty: every document, in the order of the server, every field. */
export const emptyTexts: QueryTexts = { filter: '', sort: '', project: '', skip: '', limit: '' };

/** The page sizes the paging row offers. */
export const pageSizes = [10, 20, 50, 100, 200, 500] as const;

/** One of the page sizes. */
export type PageSize = (typeof pageSizes)[number];

/** The page size a tab starts with. */
export const defaultPageSize: PageSize = 50;

/** Whether a number is one of the page sizes. */
export function isPageSize(value: unknown): value is PageSize {
  return typeof value === 'number' && (pageSizes as readonly number[]).includes(value);
}

/** The error line under the bar: one message, the last; a message of the server has **Details** and **Run again**. */
export interface ErrorLine {
  readonly message: string;
  /** The server's own text, under **Details**. */
  readonly details?: string;
  /** Whether **Run again** is offered: for a failure of the server or a cancelled query, not for a refusal. */
  readonly runAgain: boolean;
}

/** The query bar of a collection tab, and what its cards change with it. */
export interface QueryState {
  readonly mode: QueryMode;
  /** The texts as the bar reads them now, also those typed and never run. */
  readonly texts: QueryTexts;
  /** The query as it was last run, which paging and **Refresh** use; absent before the first run. */
  readonly ran?: QueryTexts;
  /** The page shown, from 1. */
  readonly page: number;
  readonly pageSize: PageSize;
  readonly builderOpen: boolean;
  readonly error?: ErrorLine;
  /** The fields outlined as invalid when the query was run. */
  readonly invalid: readonly QueryField[];
  readonly selection: Selection;
}

/** A tab's query when nothing is kept: Find, empty fields, page 1, page size 50, the builder closed. */
export const initialQuery: QueryState = {
  mode: 'find',
  texts: emptyTexts,
  page: 1,
  pageSize: defaultPageSize,
  builderOpen: false,
  invalid: [],
  selection: emptySelection,
};
