/**
 * The methods of a collection on its indexes and search indexes, as mongosh names them, each run as the server's
 * command so that every option reaches the server as given, with the request's signal and time limit: `createIndex`
 * gives the name, `createIndexes` the names, `dropIndex` and `dropIndexes` the server's reply, `createSearchIndex`
 * the name, `createSearchIndexes` the names, `updateSearchIndex` and `dropSearchIndex` `null`, and
 * `getSearchIndexes` the search indexes.
 */
import type { Document } from 'mongodb';
import type { Call } from './call';
import { document, documents, readCursor } from './methods';
import { indexDescriptions, indexesGiven, searchIndexDescription } from './mongosh-forms';

/** The command `createIndexes` with these indexes; gives their names. */
async function created(call: Call, collection: string, given: readonly Document[], options: unknown) {
  const { indexes, commitQuorum } = indexDescriptions(given, options);
  const command = { createIndexes: collection, indexes, ...(commitQuorum === undefined ? {} : { commitQuorum }) };
  await call.db.command(command, call.options);
  return indexes.map((each) => each['name'] as string);
}

async function searchCreated(call: Call, collection: string, indexes: readonly Document[]): Promise<string[]> {
  const reply = await call.db.command({ createSearchIndexes: collection, indexes }, call.options);
  const listed: unknown = reply['indexesCreated'];
  return Array.isArray(listed) ? listed.map((each) => String(document(each)['name'])) : [];
}

async function searchChanged(call: Call, command: Document): Promise<null> {
  await call.db.command(command, call.options);
  return null;
}

function searchIndexMethod(call: Call, collection: string): Promise<unknown> | undefined {
  const [first, second] = call.args;
  switch (call.request.method) {
    case 'createSearchIndex':
      return searchCreated(call, collection, [searchIndexDescription(call.args)]).then((names) => names[0] ?? null);
    case 'createSearchIndexes':
      return searchCreated(call, collection, documents(first));
    case 'updateSearchIndex':
      return searchChanged(call, { updateSearchIndex: collection, name: first, definition: document(second) });
    case 'dropSearchIndex':
      return searchChanged(call, { dropSearchIndex: collection, name: first });
    case 'getSearchIndexes': {
      const stage = typeof first === 'string' ? { name: first } : {};
      const pipeline = [{ $listSearchIndexes: stage }];
      return readCursor(call.db.collection(collection).aggregate(pipeline, call.options), call.limit);
    }
    default:
      return undefined;
  }
}

/** Carries out one of these methods on the request's collection; `undefined` when the method is not one of them. */
export function indexMethod(call: Call): Promise<unknown> | undefined {
  const collection = call.request.collection;
  if (collection === undefined) {
    return undefined;
  }
  const [first, second] = call.args;
  switch (call.request.method) {
    case 'createIndex':
      return created(call, collection, [document(first)], second).then((names) => names[0] ?? null);
    case 'createIndexes':
      return created(call, collection, indexesGiven(first), second);
    case 'dropIndex':
      // A name or a key pattern, as mongosh takes it.
      return call.db.command({ dropIndexes: collection, index: first ?? null }, call.options);
    case 'dropIndexes':
      // No argument drops every index but `_id_`; a name, a key pattern or an array of names drops those.
      return call.db.command({ dropIndexes: collection, index: first ?? '*' }, call.options);
    default:
      return searchIndexMethod(call, collection);
  }
}
