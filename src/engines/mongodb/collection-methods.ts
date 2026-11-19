/**
 * The methods of a collection that `methods.ts` leaves out, as mongosh names them and with mongosh's replies:
 * `findOneAnd…` give the document (or `null`), `bulkWrite` its counts and `_id`s, `drop` `true`, `renameCollection`
 * `{ ok: 1 }`, `getIndexes` the indexes, `stats` the collection's statistics.
 */
import type { Collection, Document } from 'mongodb';
import { EngineError } from '../engine';
import { bulkWritten } from './bulk-write';
import type { Call } from './call';
import { document, documents, merged, readCursor } from './methods';
import { findAndModifyOptions, plainNumber } from './mongosh-forms';

function update(value: unknown): Document | Document[] {
  return Array.isArray(value) ? documents(value) : document(value);
}

function findAndModify(collection: Collection, call: Call): Promise<unknown> | undefined {
  const [first, second, third] = call.args;
  switch (call.request.method) {
    case 'findOneAndUpdate':
      return collection.findOneAndUpdate(
        document(first),
        update(second),
        merged(findAndModifyOptions(third), call.options),
      );
    case 'findOneAndReplace':
      return collection.findOneAndReplace(
        document(first),
        document(second),
        merged(findAndModifyOptions(third), call.options),
      );
    case 'findOneAndDelete':
      return collection.findOneAndDelete(document(first), merged(findAndModifyOptions(second), call.options));
    default:
      return undefined;
  }
}

/** `renameCollection(to, dropTarget)`, or `renameCollection(to, { dropTarget })`: `{ ok: 1 }`. */
async function renamed(collection: Collection, call: Call): Promise<Document> {
  const [to, second] = call.args;
  if (typeof to !== 'string' || to === '') {
    throw new EngineError('renameCollection takes the new name of the collection.');
  }
  const given = typeof second === 'boolean' ? { dropTarget: second } : document(second);
  await collection.rename(to, merged(given, call.options));
  return { ok: 1 };
}

/** `stats(scale)` or `stats({ scale })`: the command `collStats`. */
function statistics(collection: Collection, call: Call): Promise<Document> {
  const [first] = call.args;
  const scale = plainNumber(first);
  const options = typeof scale === 'number' ? { scale } : document(first);
  return call.db.command({ collStats: collection.collectionName, ...options }, call.options);
}

/** Carries out one of these methods on the request's collection; `undefined` when the method is not one of them. */
export function collectionMethod(call: Call): Promise<unknown> | undefined {
  const name = call.request.collection;
  if (name === undefined) {
    return undefined;
  }
  const collection = call.db.collection(name);
  const [first, second] = call.args;
  switch (call.request.method) {
    case 'bulkWrite':
      return bulkWritten(collection, first, merged(second, call.options));
    case 'drop':
      return collection.drop(merged(first, call.options));
    case 'renameCollection':
      return renamed(collection, call);
    case 'getIndexes':
      return readCursor(collection.listIndexes(call.options), call.limit);
    case 'stats':
      return statistics(collection, call);
    default:
      return findAndModify(collection, call);
  }
}
