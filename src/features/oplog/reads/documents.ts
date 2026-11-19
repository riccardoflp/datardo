/**
 * The reads of `oplog.publish` (its **Reads** line, with no card of its own): the documents by `_id` after an update
 * whose fields aren't known, and the `_id`s still there after a delete that deleted fewer documents than it matched.
 * Both are plain engine requests, in batches of 1,000.
 */
import type { ConnectionRequest, Json } from '../../../shared/engine-request';
import type { Context, ReadRequest } from '../../../shared/feature';
import { connectionId } from '../../../shared/ids';

/** The identifier of the read of the documents by `_id`. */
export const documentsRead = 'oplog.read-documents';

/** The `_id`s are read in batches of 1,000. */
export const idBatch = 1000;

/** How long each read may take, in milliseconds (R9.2; Datardo's choice). */
export const readTimeLimitMs = 30_000;

/** What the read is asked: the collection, the `_id`s, and whether only the `_id`s are wanted. */
export interface DocumentsArgs {
  readonly connection: string;
  readonly database: string;
  readonly collection: string;
  readonly ids: readonly Json[];
  readonly onlyIds: boolean;
}

function argsOf(args: Json): DocumentsArgs {
  const fields = (typeof args === 'object' && args !== null && !Array.isArray(args) ? args : {}) as Readonly<
    Record<string, Json>
  >;
  const text = (name: string): string => {
    const value = fields[name];
    return typeof value === 'string' ? value : '';
  };
  const ids = fields['ids'];
  return {
    connection: text('connection'),
    database: text('database'),
    collection: text('collection'),
    ids: Array.isArray(ids) ? (ids as readonly Json[]) : [],
    onlyIds: fields['onlyIds'] === true,
  };
}

/** `db.orders.find({ _id: { $in: [<1,000 ids>] } })`, with `{ _id: 1 }` when only the `_id`s are wanted. */
export function documentRequests(args: DocumentsArgs): readonly ConnectionRequest[] {
  const requests: ConnectionRequest[] = [];
  for (let start = 0; start < args.ids.length; start += idBatch) {
    const filter: Json = { _id: { $in: args.ids.slice(start, start + idBatch) } };
    requests.push({
      connection: connectionId(args.connection),
      request: {
        engine: 'mongodb',
        database: args.database,
        collection: args.collection,
        method: 'find',
        arguments: args.onlyIds ? [filter, { projection: { _id: 1 } }] : [filter],
        timeLimitMs: readTimeLimitMs,
      },
    });
  }
  return requests;
}

/** The read: one request per batch. */
export function request(_context: Context, args: Json): ReadRequest {
  return { kind: 'engine', requests: documentRequests(argsOf(args)) };
}

/** The documents of every batch, in order. */
export function parse(replies: readonly unknown[]): readonly Json[] {
  return replies.flatMap((reply) => (Array.isArray(reply) ? (reply as readonly Json[]) : []));
}
