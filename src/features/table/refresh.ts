/**
 * Feature: table.refresh
 *
 * Reads the page shown again, to see what changed in the database meanwhile: the query as it was last run, not what
 * the bar reads now, and the page shown. The count is read again beside it (`query.count`).
 */
import type { Json } from '../../shared/engine-request';
import type { Context, Outcome, ReadRequest } from '../../shared/feature';
import { parse as parseRun, request as runRequest, type RunResult } from '../query/run';

/**
 * Feature: table.refresh
 *
 * The `find` of `query.run` with the texts last run (`args.texts` holds them, as `TabMemory.query` keeps them) and
 * the page shown, `args.page`; refused as `query.run` refuses, which a query that ran cannot be.
 */
export function request(context: Context, args: Json): ReadRequest | Outcome {
  return runRequest(context, args);
}

/** Feature: table.refresh — the documents of the page read again. */
export function parse(replies: readonly unknown[]): RunResult {
  return parseRun(replies);
}

/** The page to show after a refresh: the one asked for, or the last that has documents when the result now ends before it. */
export function pageAfterRefresh(page: number, lastPage: number | undefined): number {
  return lastPage === undefined ? page : Math.max(1, Math.min(page, lastPage));
}
