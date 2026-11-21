/**
 * Feature: field.type-counts
 *
 * The pipeline that counts the BSON types of a field, shown in the list of **Convert type…**: one row per type, most
 * frequent first, as `<type> <n>` joined by ` · `. `field.convert-type` reads it through the runner, so this module
 * also gives the request and the reading of its reply; a count that fails or takes more than 30 seconds gives no row,
 * and the list opens without its *now:* part.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import { and, noArrayParents } from './array-guard';
import { isDocument, numberOf, type JsonDocument } from './types';

/** How long the count of the types may take, in ms (the card's 30 seconds). */
export const typeCountsTimeLimitMs = 30_000;

/** One row of the count: a BSON type as `$type` names it, and how many values have it. */
export interface TypeCount {
  readonly type: string;
  readonly count: number;
}

/** Feature: field.type-counts — the pipeline counting the types of `field` in the documents of `filter` that have it. */
export function typeCountsPipeline(filter: JsonDocument, field: string): readonly JsonDocument[] {
  return [
    { $match: and(filter, ...noArrayParents(field), { [field]: { $exists: true } }) },
    { $group: { _id: { $type: `$${field}` }, n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ];
}

/** What the count is started with. */
interface TypeCountsArgs {
  readonly connection: string;
  readonly database: string;
  readonly collection: string;
  readonly filter: JsonDocument;
  readonly field: string;
}

function argsOf(args: Json): TypeCountsArgs {
  const fields = isDocument(args) ? args : {};
  const textOf = (name: string): string => {
    const value = fields[name];
    return typeof value === 'string' ? value : '';
  };
  const filter = fields['filter'];
  return {
    connection: textOf('connection'),
    database: textOf('database'),
    collection: textOf('collection'),
    filter: isDocument(filter) ? filter : {},
    field: textOf('field'),
  };
}

/** `db.people.aggregate([…], { maxTimeMS: 30000 })`. */
export function typeCountsRequest(args: Json): MongoRequest {
  const asked = argsOf(args);
  return {
    engine: 'mongodb',
    database: asked.database,
    collection: asked.collection,
    method: 'aggregate',
    arguments: [typeCountsPipeline(asked.filter, asked.field), { maxTimeMS: typeCountsTimeLimitMs }],
    limit: 100,
    timeLimitMs: typeCountsTimeLimitMs,
  };
}

/** Feature: field.type-counts — the request, for `{ connection, database, collection, filter, field }`. */
export function request(_context: Context, args: Json): ReadRequest {
  return {
    kind: 'engine',
    requests: [{ connection: connectionId(argsOf(args).connection), request: typeCountsRequest(args) }],
    // A count that fails gives no row: the list opens without its *now:* part.
    failedRequests: 'are-replies',
  };
}

/** Feature: field.type-counts — the rows of the reply, most frequent first; none when the count failed. */
export function parse(replies: readonly unknown[]): readonly TypeCount[] {
  const [reply] = replies;
  if (!Array.isArray(reply)) {
    return [];
  }
  return reply.flatMap((row: unknown): TypeCount[] => {
    if (!isDocument(row) || typeof row['_id'] !== 'string') {
      return [];
    }
    const count = numberOf(row['n']);
    return count === undefined ? [] : [{ type: row['_id'], count }];
  });
}
