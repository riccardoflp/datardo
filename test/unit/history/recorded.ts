/**
 * What the unit tests of the document history and the Watch changes page build their inputs from: the replies
 * recorded from MongoDB 8.2 (`test/integration/history/record-replies.test.ts`), the document they are of, and the
 * app's state with a MongoDB connection.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { idKey } from '../../../src/features/history/document-writes';
import type { DocumentWrite } from '../../../src/features/history/types';
import type { ConnectionView } from '../../../src/shared/connection';
import type { Json } from '../../../src/shared/engine-request';
import { connectionId } from '../../../src/shared/ids';
import type { AppState } from '../../../src/shared/state';
import { mongoConnection, stateWith } from '../connection/context';
import { documentWrites } from '../../../src/features/history/document-writes';

const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');

/** A reply recorded from the test replica set, as canonical Extended JSON. */
export function recorded(name: string): Json {
  return JSON.parse(readFileSync(join(folder, `mongodb-8.2-${name}.json`), 'utf8')) as Json;
}

/** The collection the recorded writes are on, and the `_id` of their document. */
export const recordedCollection = 'history-record.orders';
export const recordedId: Json = { $oid: '65f1c0de9a7b4e00012f3a2c' };

/** The oplog entries of the recorded document, newest first, as `history.read-writes` found them. */
export function recordedEntries(): readonly Json[] {
  return recorded('history-read-writes') as readonly Json[];
}

/** The writes of the recorded document: insert, 3 updates, a replacement, an update in a transaction, a delete. */
export function recordedWrites(): readonly DocumentWrite[] {
  return recordedEntries().flatMap((entry) => documentWrites(entry, recordedCollection, idKey(recordedId)));
}

/** Local, which allows writes; Production, which is read-only. */
export const local: ConnectionView = mongoConnection();
export const production: ConnectionView = mongoConnection({
  id: connectionId('c-production'),
  name: 'Production',
  readOnly: true,
});

/** The app's state with Local and Production connected to a MongoDB server of this topology and version, or not. */
export function mongoState(
  topology: 'standalone' | 'replica-set' | 'sharded' | 'unknown' = 'replica-set',
  version = '8.2.5',
): AppState {
  const base = stateWith([local, production]);
  if (topology === 'unknown') {
    return base;
  }
  const server = { engine: 'mongodb', product: 'MongoDB', version, topology: { kind: topology } } as const;
  const live = {
    [local.id]: { state: 'connected' as const, server },
    [production.id]: { state: 'connected' as const, server },
  };
  return { ...base, connections: { ...base.connections, live } } as unknown as AppState;
}
