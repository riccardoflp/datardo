/**
 * The indexes of a collection, for the text of the confirmation of `manage.drop-collection`: `db.orders.getIndexes()`.
 * A read of its own, named as a variant of the feature that reads it, because the card wants the number left out of
 * the text when the read fails, where `index.list` (M22) ends the read on a failure of `getIndexes`.
 */
import type { Json } from '../../../shared/engine-request';
import type { Context, ReadFeature, ReadRequest } from '../../../shared/feature';
import { connectionId, featureId } from '../../../shared/ids';
import { isDocument, mongoRequest } from '../types';

/** How long the server may take, in ms (Datardo's choice, as the tree's counts). */
export const indexNamesTimeLimitMs = 5000;

/** How many indexes are read at most (MongoDB allows 64 a collection). */
export const mostIndexes = 1000;

/** The identifier the runner knows this read by. */
export const indexNamesRead = featureId('manage.drop-collection:indexes');

function textOf(args: Json, name: string): string {
  const value = isDocument(args) ? args[name] : undefined;
  return typeof value === 'string' ? value : '';
}

/** The request for `{ connection, database, collection }`; a failure is given to {@link parse}. */
export function request(_context: Context, args: Json): ReadRequest {
  const where = { database: textOf(args, 'database'), collection: textOf(args, 'collection') };
  return {
    kind: 'engine',
    requests: [
      {
        connection: connectionId(textOf(args, 'connection')),
        request: { ...mongoRequest(where, 'getIndexes', []), limit: mostIndexes, timeLimitMs: indexNamesTimeLimitMs },
      },
    ],
    // A failure leaves the number out of the confirmation: the drop goes on.
    failedRequests: 'are-replies',
  };
}

/** `{ indexes }`, the indexes listed; `{ kind: 'error', message }` when the server refused. */
export function parse(replies: readonly unknown[]): Json {
  const [reply] = replies;
  if (!Array.isArray(reply)) {
    return isDocument(reply) && reply['kind'] === 'error' ? reply : { kind: 'error', message: 'No list of indexes.' };
  }
  return { indexes: reply.filter(isDocument) };
}

/** The read, as the runner starts it. */
export const feature: ReadFeature = { kind: 'read', id: indexNamesRead, request, parse };
