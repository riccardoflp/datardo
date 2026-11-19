/**
 * Feature: table.paging
 *
 * The row under the table that says which documents of the result are shown and moves between its pages: the range,
 * **Previous page**, **Next page** and **Page size**.
 */
import { countWritten } from '../query/count';
import { text as queryText } from '../query/text';
import { pageSizes, type PageSize } from '../query/types';
import { pageWindow } from './page-window';
import { text } from './text';

/** The count of the query, as `query.count` gave it: being read, read, or not counted. */
export type CountState =
  | { readonly kind: 'pending' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'counted'; readonly count: number; readonly estimated: boolean };

/** What the paging row is drawn from. */
export interface PagingState {
  readonly page: number;
  readonly pageSize: PageSize;
  /** **Skip** and **Limit** of the query as it was last run. */
  readonly skip: number;
  readonly limit?: number;
  /** How many documents the page shown received. */
  readonly received: number;
  readonly count: CountState;
}

/** A button of the paging row. */
export interface PagingButton {
  readonly label: string;
  /** The name a screen reader says, and the tooltip. */
  readonly name: string;
  readonly element: string;
  readonly enabled: boolean;
  /** The page it shows. */
  readonly page: number;
}

/** What the paging row shows. */
export interface PagingView {
  /** `1–50 of 1,204`. */
  readonly range: string;
  /** The total, with the tooltip and the click of `query.count` when it is an estimate. */
  readonly total: { readonly text: string; readonly estimated: boolean; readonly tip?: string };
  readonly previous: PagingButton;
  readonly next: PagingButton;
  readonly pageSize: {
    readonly label: string;
    readonly element: string;
    readonly value: PageSize;
    readonly choices: readonly PageSize[];
  };
}

function totalText(count: CountState, total: number | undefined): string {
  if (count.kind === 'pending') {
    return queryText.count.pending;
  }
  if (count.kind === 'failed' || total === undefined) {
    return queryText.count.failed;
  }
  return countWritten(total);
}

/**
 * Feature: table.paging
 *
 * The range (`1–50 of 1,204`, `0–0 of 0`, `1–50 of …` while counting, `1–50 of ?` when it could not be counted),
 * **Previous page** disabled on the first page, **Next page** disabled after the last document of the total or, with
 * the total unknown, when the page is not full; **Page size**.
 */
export function view(state: PagingState): PagingView {
  const count = state.count.kind === 'counted' ? state.count.count : undefined;
  const window = pageWindow({
    page: state.page,
    pageSize: state.pageSize,
    skip: state.skip,
    received: state.received,
    ...(state.limit === undefined ? {} : { limit: state.limit }),
    ...(count === undefined ? {} : { count }),
  });
  const total = totalText(state.count, window.total);
  const estimated = state.count.kind === 'counted' && state.count.estimated;
  return {
    range: text.paging.range(countWritten(window.first), countWritten(window.last), total),
    total: { text: total, estimated, ...(estimated ? { tip: queryText.count.estimated } : {}) },
    previous: {
      label: '‹',
      name: text.paging.previous,
      element: 'table.paging@paging',
      enabled: window.before,
      page: window.page - 1,
    },
    next: {
      label: '›',
      name: text.paging.next,
      element: 'table.paging@paging',
      enabled: window.after,
      page: window.page + 1,
    },
    pageSize: {
      label: text.paging.pageSize,
      element: 'table.paging@paging',
      value: state.pageSize,
      choices: pageSizes,
    },
  };
}
