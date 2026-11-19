/**
 * `bulkWrite(operations, options)` with mongosh's reply: its counts, and the `_id`s it inserted and upserted, by the
 * index of their operation.
 *
 * The driver adds up `nModified` only when it is a number of JavaScript, so a client that reads values without
 * promoting them would count no modified document: the reply of the server is read with its values promoted. An
 * upserted `_id` is then taken from its operation, where it was given (the replacement's, or the filter's), so that it
 * keeps its BSON type; only an `_id` the server made is the server's.
 */
import { BSON, type AnyBulkWriteOperation, type BulkWriteResult, type Collection, type Document } from 'mongodb';
import { document, documents, type Options } from './methods';

function isOperatorDocument(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof BSON.BSONValue) &&
    Object.keys(value).some((key) => key.startsWith('$'))
  );
}

/** The `_id` an upsert inserted, as its operation gave it; `fromServer` when the operation gave none. */
export function upsertedId(operation: Document, fromServer: unknown): unknown {
  const body = document(Object.values(operation)[0]);
  const replacement = document(body['replacement']);
  if ('_id' in replacement) {
    return replacement['_id'];
  }
  const filtered: unknown = document(body['filter'])['_id'];
  return filtered === undefined || isOperatorDocument(filtered) ? fromServer : filtered;
}

function upsertedIds(result: BulkWriteResult, operations: readonly Document[]): Document {
  return Object.fromEntries(
    Object.entries(result.upsertedIds).map(([index, id]) => {
      const operation = operations[Number(index)];
      return [index, operation === undefined ? id : upsertedId(operation, id)];
    }),
  );
}

/** Carries out `bulkWrite` with its options merged with the call's, and gives mongosh's reply. */
export async function bulkWritten(collection: Collection, given: unknown, options: Options): Promise<Document> {
  const operations = documents(given);
  const result = await collection.bulkWrite(operations as AnyBulkWriteOperation[], {
    ...options,
    promoteValues: true,
  });
  return {
    acknowledged: result.isOk(),
    insertedCount: result.insertedCount,
    insertedIds: result.insertedIds,
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
    deletedCount: result.deletedCount,
    upsertedCount: result.upsertedCount,
    upsertedIds: upsertedIds(result, operations),
  };
}
