/**
 * What the tests of the GridFS area start the features from: the bucket `fs` of `shop` on Local (or on the read-only
 * Production), the replies of MongoDB 8.2 recorded by `test/integration/gridfs/record-replies.test.ts`, and readers
 * of what a feature returns.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileOf, type BucketPlace, type GridFile, type JsonRecord } from '../../../src/features/gridfs/types';
import type { ConnectionView } from '../../../src/shared/connection';
import type { Json, MongoRequest } from '../../../src/shared/engine-request';
import type { Answers, Context, Plan } from '../../../src/shared/feature';
import { featureId } from '../../../src/shared/ids';
import type { AppState } from '../../../src/shared/state';
import { mongoConnection, stateWith } from '../connection/context';

export { planOf, questionOf, refusalOf, stepTexts } from '../document/context';

/** Local, a MongoDB connection that writes. */
export const local = mongoConnection();

/** Production, a read-only MongoDB connection. */
export const production = mongoConnection({ name: 'Production', readOnly: true });

/** 2026-11-18 13:02:11 UTC, the time of the tests. */
export const now = Date.UTC(2026, 10, 18, 13, 2, 11);

/** A context of the feature on the database `shop` of the connection, at a fixed time. */
export function contextOn(feature: string, connection: ConnectionView = local, state?: AppState): Context {
  return {
    feature: featureId(feature),
    now,
    platform: 'windows',
    startedBy: 'user',
    target: { kind: 'database', connection: connection.id, database: 'shop' },
    state: state ?? stateWith([connection]),
  };
}

/** The bucket `fs` of `shop` on Local, as the features see it. */
export const fs: BucketPlace = {
  connection: local.id,
  connectionName: 'Local',
  readOnly: false,
  database: 'shop',
  bucket: 'fs',
};

/** The arguments of a feature started on the bucket `fs` of `shop`. */
export function onFs(more: Readonly<Record<string, Json>> = {}, connection: ConnectionView = local): Answers {
  return { args: { connection: connection.id, database: 'shop', bucket: 'fs', ...more } };
}

/** The `_id` of `logo.png`. */
export const logoId: Json = { $oid: '65f1c0ffee0000000000a2c1' };

/** A files document, as the driver writes one. */
export function filesDocument(more: JsonRecord = {}): JsonRecord {
  return {
    _id: logoId,
    length: { $numberLong: '734003' },
    chunkSize: { $numberInt: '261120' },
    uploadDate: { $date: { $numberLong: String(now) } },
    filename: 'logo.png',
    metadata: { contentType: 'image/png' },
    ...more,
  };
}

/** A file, as `gridfs.list` returns it. */
export function gridFile(more: JsonRecord = {}): GridFile {
  return fileOf(filesDocument(more));
}

/** The MongoDB requests of a read. */
export function mongoRequests(read: unknown): readonly MongoRequest[] {
  const requests = (read as { requests?: readonly { request: MongoRequest }[] }).requests ?? [];
  return requests.map((each) => each.request);
}

/** The engine requests of a plan's steps, in order. */
export function sentRequests(plan: Plan): readonly MongoRequest[] {
  return plan.steps.flatMap((step) =>
    step.kind === 'engine' && step.request.engine === 'mongodb' ? [step.request] : [],
  );
}

/** A reply of MongoDB 8.2 recorded in `test/fixtures/replies`. */
export function recorded(name: string): unknown {
  const path = join(import.meta.dirname, '..', '..', 'fixtures', 'replies', `mongodb-8.2-gridfs-${name}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}
