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

/** A count `query.count` gave. */
export interface Counted {
  readonly kind: 'counted';
  readonly count: number;
  readonly estimated: boolean;
}

/**
 * The count of the query, as `query.count` gave it: being read (with the count read before, shown meanwhile), read, or
 * not counted.
 */
export type CountState = { readonly kind: 'pending'; readonly last?: Counted } | { readonly kind: 'failed' } | Counted;

/** The count as it is read again: the one read before stays shown, dimmed, until the new one comes. */
export function countAgain(before: CountState): CountState {
  const last = before.kind === 'counted' ? before : before.kind === 'pending' ? before.last : undefined;
  return last === undefined ? { kind: 'pending' } : { kind: 'pending', last };
}

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
  /**
   * The total, with the tooltip and the click of `query.count` when it is an estimate; `counting` while it is the
   * total read before, shown dimmed until the new count comes.
   */
  readonly total: {
    readonly text: string;
    readonly estimated: boolean;
    readonly tip?: string;
    readonly counting: boolean;
  };
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
  if (count.kind === 'pending' && total === undefined) {
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
 * The range (`1–50 of 1,204`, `0–0 of 0`, `1–50 of …` while counting the first time, the total counted before while
 * counting again, `1–50 of ?` when it could not be counted), **Previous page** disabled on the first page, **Next
 * page** disabled after the last document of the total or, with the total unknown, when the page is not full; **Page
 * size**.
 */
export function view(state: PagingState): PagingView {
  const asked = {
    page: state.page,
    pageSize: state.pageSize,
    skip: state.skip,
    received: state.received,
    ...(state.limit === undefined ? {} : { limit: state.limit }),
  };
  const count = state.count.kind === 'counted' ? state.count.count : undefined;
  const window = pageWindow({ ...asked, ...(count === undefined ? {} : { count }) });
  const last = state.count.kind === 'pending' ? state.count.last : undefined;
  const shownTotal = last === undefined ? window.total : pageWindow({ ...asked, count: last.count }).total;
  const total = totalText(state.count, shownTotal);
  const estimated = (state.count.kind === 'counted' && state.count.estimated) || last?.estimated === true;
  return {
    range: text.paging.range(countWritten(window.first), countWritten(window.last), total),
    total: {
      text: total,
      estimated,
      ...(estimated ? { tip: queryText.count.estimated } : {}),
      counting: last !== undefined,
    },
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
