/**
 * Records the replies of `index.list` and `index.list-search` from the throwaway MongoDB into
 * `test/fixtures/replies/`, named after the server version they came from (testing.md). It runs only when
 * `DATARDO_RECORD_REPLIES=1`: the unit tests of the index area read the recorded files, and the files change only when
 * they are recorded again.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEngines, type EngineService } from '../../../src/engines';
import { listRequests } from '../../../src/features/index/list';
import { listSearchRequest } from '../../../src/features/index/list-search';
import type { Json, MongoRequest } from '../../../src/shared/engine-request';
import { connectionId } from '../../../src/shared/ids';
import { testServers } from '../servers';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');
const id = connectionId('record');
const database = 'index-record';
const collection = 'orders';

function int(value: number): Json {
  return { $numberInt: String(value) };
}

/** `_id_` aside, one index of each kind the cards show. */
const indexes: readonly Json[] = [
  { key: { email: int(1) }, name: 'email_1', unique: true },
  { key: { createdAt: int(1) }, name: 'createdAt_1', expireAfterSeconds: int(86_400) },
  { key: { title: 'text', body: 'text' }, name: 'title_text_body_text', weights: { body: int(3) } },
  { key: { status: int(1) }, name: 'status_1', hidden: true },
  { key: { total: int(-1) }, name: 'total_-1', partialFilterExpression: { status: 'paid' } },
  { key: { name: int(1) }, name: 'name_1', collation: { locale: 'en', strength: int(2) } },
];

async function send(engines: EngineService, request: MongoRequest): Promise<unknown> {
  return engines.send({ connection: id, request }, AbortSignal.timeout(20_000));
}

/** The reply, or the error the engine threw as `{ message, code }`. */
async function replyOrError(engines: EngineService, request: MongoRequest): Promise<unknown> {
  try {
    return await send(engines, request);
  } catch (error: unknown) {
    const { message, code } = error as { message: string; code?: unknown };
    return { message, ...(code === undefined ? {} : { code }) };
  }
}

async function prepare(engines: EngineService): Promise<void> {
  const on = { engine: 'mongodb', database } as const;
  await send(engines, { ...on, method: 'runCommand', arguments: [{ dropDatabase: int(1) }] });
  await send(engines, { ...on, method: 'runCommand', arguments: [{ createIndexes: collection, indexes }] });
  const documents = [
    { email: 'a@example.com', status: 'paid', total: int(10), name: 'Ann', title: 'one', body: 'first' },
    { email: 'b@example.com', status: 'new', total: int(5), name: 'bob', title: 'two', body: 'second' },
  ];
  await send(engines, { ...on, collection, method: 'insertMany', arguments: [documents] });
  await send(engines, { ...on, collection, method: 'find', arguments: [{ email: 'a@example.com' }] });
}

async function save(name: string, value: unknown): Promise<void> {
  await writeFile(join(folder, `mongodb-8.2-index-${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
}

describe('the recorded replies of the server', () => {
  it.runIf(recording)('records the replies of index.list and index.list-search on MongoDB', async () => {
    const engines = createEngines();
    await engines.connect(
      id,
      { engine: 'mongodb', connectionString: testServers().mongoStandalone, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(20_000),
    );
    try {
      await mkdir(folder, { recursive: true });
      await prepare(engines);
      const args = { connection: id, database, collection };
      const replies: unknown[] = [];
      for (const request of listRequests(args)) {
        replies.push(await replyOrError(engines, request));
      }
      await save('list', replies);
      await save('list-search-error', await replyOrError(engines, listSearchRequest(args)));
      const drop = { dropDatabase: int(1) };
      await send(engines, { engine: 'mongodb', database, method: 'runCommand', arguments: [drop] });
    } finally {
      await engines.disconnectAll();
    }
    expect(recording).toBe(true);
  });
});
