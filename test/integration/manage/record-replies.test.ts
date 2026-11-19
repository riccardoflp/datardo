/**
 * Records the replies of `manage.read-options` from the throwaway MongoDB into `test/fixtures/replies/`, named after
 * the server version they came from (testing.md): a view with a `$match`, a collection whose validator holds a date,
 * and a name that does not exist. It runs only when `DATARDO_RECORD_REPLIES=1`: the unit tests of the manage area read
 * the recorded files, and the files change only when they are recorded again.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEngines, type EngineService } from '../../../src/engines';
import { request } from '../../../src/features/manage/read-options';
import type { Json, MongoRequest } from '../../../src/shared/engine-request';
import type { Context } from '../../../src/shared/feature';
import { connectionId } from '../../../src/shared/ids';
import { testServers } from '../servers';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');
const id = connectionId('record');
const database = 'manage-record';

async function send(engines: EngineService, sent: MongoRequest): Promise<unknown> {
  return engines.send({ connection: id, request: sent }, AbortSignal.timeout(20_000));
}

async function prepare(engines: EngineService): Promise<void> {
  const on = { engine: 'mongodb', database } as const;
  await send(engines, { ...on, method: 'runCommand', arguments: [{ dropDatabase: { $numberInt: '1' } }] });
  const since: Json = { $date: { $numberLong: '1704067200000' } };
  const validator = { createdAt: { $gte: since }, status: { $type: 'string' } };
  await send(engines, { ...on, method: 'runCommand', arguments: [{ create: 'orders', validator }] });
  const pipeline = [{ $match: { status: 'paid' } }];
  await send(engines, { ...on, method: 'runCommand', arguments: [{ create: 'recent', viewOn: 'orders', pipeline }] });
}

/** The reply of `manage.read-options` for `collection`. */
async function readOptions(engines: EngineService, collection: string): Promise<unknown> {
  const read = request({} as Context, { connection: id, database, collection });
  const [first] = read.kind === 'engine' ? read.requests : [];
  if (first === undefined || first.request.engine !== 'mongodb') {
    throw new Error('manage.read-options sends one request to MongoDB.');
  }
  return send(engines, first.request);
}

async function save(name: string, value: unknown): Promise<void> {
  await writeFile(join(folder, `mongodb-8.2-manage-${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
}

describe('the recorded replies of the server', () => {
  it.runIf(recording)('records the replies of manage.read-options on MongoDB', async () => {
    const engines = createEngines();
    await engines.connect(
      id,
      { engine: 'mongodb', connectionString: testServers().mongoStandalone, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(20_000),
    );
    try {
      await mkdir(folder, { recursive: true });
      await prepare(engines);
      await save('options-view', await readOptions(engines, 'recent'));
      await save('options-validator', await readOptions(engines, 'orders'));
      await save('options-missing', await readOptions(engines, 'gone'));
      const drop = { dropDatabase: { $numberInt: '1' } };
      await send(engines, { engine: 'mongodb', database, method: 'runCommand', arguments: [drop] });
    } finally {
      await engines.disconnectAll();
    }
    expect(recording).toBe(true);
  });
});
