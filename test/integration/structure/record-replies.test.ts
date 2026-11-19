/**
 * Records the replies of `structure.read` from the throwaway MongoDB into `test/fixtures/replies/`, named after the
 * server version they came from (testing.md). It runs only when `DATARDO_RECORD_REPLIES=1`: the unit tests of
 * `structure.read` read the recorded files, and the files change only when they are recorded again.
 *
 * `mongodb-8.2-structure-shop.json` holds every reply of the read, in the order `nextRequests` asked for them:
 * `listCollections`, `hello`, the indexes of each collection that is not a view, then `$listSearchIndexes`, which a
 * server without search refuses (the refusal is kept as `{ kind: 'error', message, code }`).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEngines, type EngineService } from '../../../src/engines';
import { nextRequests, request } from '../../../src/features/structure/read';
import type { ConnectionRequest, Json } from '../../../src/shared/engine-request';
import type { Context } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import { initialState } from '../../../src/shared/state';
import { testServers } from '../servers';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');
const id = connectionId('record');
const database = 'structure-record';

const context: Context = {
  feature: featureId('structure.read'),
  now: 0,
  platform: 'windows',
  startedBy: 'user',
  target: { kind: 'app' },
  state: initialState,
};

function int(value: number): Json {
  return { $numberInt: String(value) };
}

async function command(engines: EngineService, document: Json): Promise<unknown> {
  return engines.send(
    { connection: id, request: { engine: 'mongodb', database, method: 'runCommand', arguments: [document] } },
    AbortSignal.timeout(20_000),
  );
}

/** `orders` with a validator and two indexes, `users` capped, the views `recent` and `big`, the time series `metrics`. */
async function prepare(engines: EngineService): Promise<void> {
  await command(engines, { dropDatabase: int(1) });
  await command(engines, { create: 'orders', validator: { total: { $exists: true } }, validationLevel: 'moderate' });
  await command(engines, {
    createIndexes: 'orders',
    indexes: [
      { key: { status: int(1) }, name: 'status_1' },
      { key: { date: int(-1) }, name: 'byDate', expireAfterSeconds: int(3600) },
      { key: { email: int(1) }, name: 'email_fr', unique: true, collation: { locale: 'fr' } },
      { key: { title: 'text', body: 'text' }, name: 'search_text', weights: { title: int(5) } },
    ],
  });
  await command(engines, { create: 'users', capped: true, size: int(8192), max: int(10) });
  await command(engines, { create: 'recent', viewOn: 'orders', pipeline: [{ $sort: { date: int(-1) } }] });
  await command(engines, { create: 'big', viewOn: 'recent', pipeline: [{ $match: { total: { $gt: int(100) } } }] });
  await command(engines, {
    create: 'metrics',
    timeseries: { timeField: 't', metaField: 'm', granularity: 'hours' },
    expireAfterSeconds: int(60),
  });
}

/** A request that fails, as the runner gives it to `parse`. */
function failure(error: unknown): Json {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { readonly code?: unknown }).code;
  return { kind: 'error', message, ...(typeof code === 'number' ? { code } : {}) };
}

/** Every reply of `structure.read`, asked for as the runner would: each batch of `nextRequests` at the same time. */
async function read(engines: EngineService): Promise<readonly unknown[]> {
  const args = { connection: id, database };
  const first = request(context, args);
  if (first.kind !== 'engine') {
    throw new Error('structure.read refused the recording.');
  }
  const replies: unknown[] = [];
  let batch: readonly ConnectionRequest[] = first.requests;
  while (batch.length > 0) {
    const answered = await Promise.all(
      batch.map((each) => engines.send(each, AbortSignal.timeout(20_000)).catch((error: unknown) => failure(error))),
    );
    replies.push(...answered);
    batch = nextRequests(args, replies);
  }
  return replies;
}

describe('the recorded replies of the server', () => {
  it.runIf(recording)('records the reads of structure.read on MongoDB', async () => {
    const engines = createEngines();
    await engines.connect(
      id,
      { engine: 'mongodb', connectionString: testServers().mongoStandalone, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(20_000),
    );
    try {
      await mkdir(folder, { recursive: true });
      await prepare(engines);
      const replies = await read(engines);
      await writeFile(join(folder, 'mongodb-8.2-structure-shop.json'), `${JSON.stringify(replies, null, 2)}\n`);
      await command(engines, { dropDatabase: int(1) });
    } finally {
      await engines.disconnectAll();
    }
    expect(recording).toBe(true);
  });
});
