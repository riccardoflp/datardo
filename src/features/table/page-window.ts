/**
 * Feature: table.page-window
 *
 * Works out the `skip` and the `limit` a page sends, and the total the paging shows, from the page, the page size and
 * the **Skip** and **Limit** of the query bar.
 */

/** What a page is worked out from. */
export interface PageAsked {
  /** The page, from 1. */
  readonly page: number;
  readonly pageSize: number;
  /** **Skip** of the bar, 0 when empty. */
  readonly skip: number;
  /** **Limit** of the bar, absent when empty. */
  readonly limit?: number;
  /** The count of the filter, absent while unknown or when it could not be counted. */
  readonly count?: number;
  /** How many documents the page received, once it has. */
  readonly received?: number;
}

/** What a page sends and what the paging shows of it. */
export interface PageWindow {
  /** The page, moved back within **Limit** when it would start at or past it. */
  readonly page: number;
  /** The `skip` sent. */
  readonly skip: number;
  /** The `limit` sent, never 0. */
  readonly limit: number;
  /** The documents of the result after **Skip** and **Limit**; absent while unknown. */
  readonly total?: number;
  /** The number of the first row shown, 0 with no document. */
  readonly first: number;
  /** The number of the last row shown, 0 with no document. */
  readonly last: number;
  readonly before: boolean;
  readonly after: boolean;
  /** The last page that has documents, when the total is known. */
  readonly lastPage?: number;
}

function totalOf(asked: PageAsked): number | undefined {
  if (asked.count === undefined) {
    return undefined;
  }
  const left = Math.max(0, asked.count - asked.skip);
  return asked.limit === undefined ? left : Math.min(left, asked.limit);
}

/**
 * Feature: table.page-window
 *
 * The `skip` and `limit` a page sends (**Skip** + the pages before; the page size, or what is left of **Limit**), the
 * total (the count less **Skip**, within **Limit**), the first and last rows, and whether there is a page before and
 * after.
 */
export function pageWindow(asked: PageAsked): PageWindow {
  const size = Math.max(1, asked.pageSize);
  const lastOfLimit = asked.limit === undefined ? undefined : Math.max(1, Math.ceil(asked.limit / size));
  const page = Math.max(1, lastOfLimit === undefined ? asked.page : Math.min(asked.page, lastOfLimit));
  const before = (page - 1) * size;
  const limit = asked.limit === undefined ? size : Math.max(1, Math.min(size, asked.limit - before));
  const total = totalOf(asked);
  const received = asked.received ?? 0;
  const first = received === 0 ? 0 : before + 1;
  const last = received === 0 ? 0 : before + received;
  const limitReached = asked.limit !== undefined && before + received >= asked.limit;
  const after = total === undefined ? received >= limit && received >= size && !limitReached : last < total && last > 0;
  return {
    page,
    skip: asked.skip + before,
    limit,
    ...(total === undefined ? {} : { total, lastPage: Math.max(1, Math.ceil(total / size)) }),
    first,
    last,
    before: page > 1,
    after,
  };
}
