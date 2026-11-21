/**
 * Carries out a request of MongoDB: the methods of `methods.ts`, and those of the other modules of the engine (more
 * methods of a collection and of a database, indexes, change streams, cursors and sessions kept by the client). A
 * request that names a session runs in it. A method none of them knows fails with *Datardo cannot call … yet.*
 */
import type { MongoClient } from 'mongodb';
import type { MongoRequest } from '../../shared/engine-request';
import { callOptions, type Call } from './call';
import { changeStreamMethod } from './change-streams';
import { collectionMethod } from './collection-methods';
import { databaseMethod } from './database-methods';
import { gridFsMethod } from './gridfs';
import type { Handles } from './handles';
import { indexMethod } from './index-methods';
import { keptCursorMethod } from './kept-cursors';
import { callMethod, fromExtendedJson, mostDocuments } from './methods';
import { sessionMethod } from './sessions';

/** The client, and what it keeps between requests. */
export interface Kept {
  readonly client: MongoClient;
  readonly handles: Handles;
}

const methods: readonly ((call: Call) => Promise<unknown> | undefined)[] = [
  sessionMethod,
  keptCursorMethod,
  changeStreamMethod,
  gridFsMethod,
  collectionMethod,
  indexMethod,
  databaseMethod,
];

/** Carries out a request and returns the driver's reply, not yet as Extended JSON. */
export async function carryOut(kept: Kept, request: MongoRequest, signal: AbortSignal): Promise<unknown> {
  const db = kept.client.db(request.database);
  const session = request.session === undefined ? undefined : kept.handles.session(request.session);
  const call: Call = {
    client: kept.client,
    db,
    request,
    args: request.arguments.map(fromExtendedJson),
    options: callOptions(request, signal, session),
    handles: kept.handles,
    limit: request.limit ?? mostDocuments,
  };
  for (const method of methods) {
    const reply = method(call);
    if (reply !== undefined) {
      return reply;
    }
  }
  return callMethod(db, request, signal, session);
}
