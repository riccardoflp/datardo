/**
 * The methods of a database, and of the connection, that a request names without a collection, as mongosh names them
 * and with mongosh's replies: `createCollection` and `createView` `{ ok: 1 }`, `dropDatabase` `{ ok: 1, dropped }`,
 * `getCollectionInfos` and `getCollectionNames` what `listCollections` gives, `stats` the command `dbStats`, and the
 * commands of the admin database `serverStatus`, `hostInfo`, `currentOp`, `version` (from `buildInfo`),
 * `getDBNames` and `getDBs` (from `listDatabases`).
 */
import type { Document } from 'mongodb';
import { EngineError } from '../engine';
import type { Call } from './call';
import { document, documents, merged, readCursor } from './methods';
import { plainNumber } from './mongosh-forms';

function nameOf(value: unknown, method: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new EngineError(`${method} takes the name of the collection.`);
  }
  return value;
}

/** `createCollection(name, options)` and `createView(name, viewOn, pipeline, options)`, as the command `create`. */
function create(call: Call): Promise<Document> {
  const [first, second, third, fourth] = call.args;
  const name = nameOf(first, call.request.method);
  const options =
    call.request.method === 'createView'
      ? { ...document(fourth), viewOn: nameOf(second, 'createView'), pipeline: documents(third) }
      : document(second);
  return call.db.command({ create: name, ...options }, call.options);
}

async function dropDatabase(call: Call): Promise<Document> {
  const reply = await call.db.command({ dropDatabase: 1 }, call.options);
  return { ...reply, dropped: call.db.databaseName };
}

function admin(call: Call, command: Document): Promise<Document> {
  return call.client.db('admin').command(command, call.options);
}

async function databaseNames(call: Call): Promise<string[]> {
  const reply = await admin(call, { listDatabases: 1, nameOnly: true });
  const listed: unknown = reply['databases'];
  return Array.isArray(listed) ? listed.map((each) => String(document(each)['name'])).sort() : [];
}

async function collectionNames(call: Call): Promise<string[]> {
  const listed = await readCursor(call.db.listCollections({}, merged({ nameOnly: true }, call.options)), call.limit);
  return listed.map((each) => String(document(each)['name'])).sort();
}

function connectionMethod(call: Call): Promise<unknown> | undefined {
  const [first] = call.args;
  switch (call.request.method) {
    case 'serverStatus':
      return admin(call, { serverStatus: 1, ...document(first) });
    case 'hostInfo':
      return admin(call, { hostInfo: 1 });
    case 'currentOp':
      // `currentOp(true)` lists idle connections and system operations too, as `$all`.
      return admin(call, { currentOp: 1, ...(first === true ? { $all: true } : document(first)) });
    case 'version':
      return admin(call, { buildInfo: 1 }).then((reply) => String(reply['version']));
    case 'getDBNames':
      return databaseNames(call);
    case 'getDBs':
      return admin(call, { listDatabases: 1, ...document(first) });
    default:
      return undefined;
  }
}

/** Carries out one of these methods on the request's database; `undefined` when the method is not one of them. */
export function databaseMethod(call: Call): Promise<unknown> | undefined {
  if (call.request.collection !== undefined) {
    return undefined;
  }
  const [first, second] = call.args;
  switch (call.request.method) {
    case 'createCollection':
    case 'createView':
      return create(call);
    case 'dropDatabase':
      return dropDatabase(call);
    case 'getCollectionInfos':
      return readCursor(call.db.listCollections(document(first), merged(second, call.options)), call.limit);
    case 'getCollectionNames':
      return collectionNames(call);
    case 'stats': {
      const scale = plainNumber(first);
      return call.db.command(
        { dbStats: 1, ...(typeof scale === 'number' ? { scale } : document(first)) },
        call.options,
      );
    }
    default:
      return connectionMethod(call);
  }
}
