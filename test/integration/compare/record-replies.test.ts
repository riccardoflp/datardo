/**
 * Records the replies of `compare.read` and `compare.read-details` from the throwaway MongoDB into
 * `test/fixtures/replies/`, named after the server version they came from (testing.md). It runs only when
 * `DATARDO_RECORD_REPLIES=1`: the unit tests of the compare area read the recorded files, and the files change only
 * when they are recorded again.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEngines, type EngineService } from '../../../src/engines';
import { parse as parseRead, request as readRequest } from '../../../src/features/compare/read';
import { request as detailsRequest } from '../../../src/features/compare/read-details';
import type { CompareResult } from '../../../src/features/compare/types';
import type { Json } from '../../../src/shared/engine-request';
import type { Context, ReadRequest } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import { initialState } from '../../../src/shared/state';
import { testServers } from '../servers';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');
const id = connectionId('record');
const database = 'compare-record';

const context: Context = {
  feature: featureId('compare.read'),
  now: 0,
  platform: 'windows',
  startedBy: 'user',
  target: { kind: 'app' },
  state: initialState,
};

function int(value: number): Json {
  return { $numberInt: String(value) };
}

const left: readonly Json[] = [
  { _id: int(1), status: 'new', total: int(10) },
  { _id: int(2), a: int(1), b: int(2) },
  { _id: int(3), n: int(1) },
  { _id: { a: int(1), b: int(2) }, x: 'sub' },
  { _id: int(4), only: 'left' },
  {
    _id: int(5),
    items: [
      { sku: 'A', qty: int(1) },
      { sku: 'B', qty: int(2) },
    ],
    price: { $numberDecimal: '1' },
  },
  { _id: int(6), n: int(1) },
];

const right: readonly Json[] = [
  { _id: int(1), status: 'paid', total: int(10) },
  { _id: int(2), b: int(2), a: int(1) },
  { _id: int(3), n: { $numberDouble: '1.0' } },
  { _id: { a: int(1), b: int(2) }, x: 'sub' },
  { _id: int(7), only: 'right' },
  {
    _id: int(5),
    items: [
      { sku: 'A', qty: int(1) },
      { sku: 'B', qty: int(3) },
    ],
    price: { $numberDecimal: '1' },
  },
  { _id: { $numberLong: '6' }, n: int(1) },
];

const sides = {
  left: { connection: id, database, collection: 'left', view: false },
  right: { connection: id, database, collection: 'right', view: false },
};

async function send(engines: EngineService, method: string, collection: string | undefined, args: readonly Json[]) {
  return engines.send(
    {
      connection: id,
      request: {
        engine: 'mongodb',
        database,
        ...(collection === undefined ? {} : { collection }),
        method,
        arguments: args,
      },
    },
    AbortSignal.timeout(20_000),
  );
}

async function replies(engines: EngineService, read: unknown): Promise<unknown[]> {
  const asked = read as ReadRequest;
  if (asked.kind !== 'engine') {
    throw new Error('Expected a read of the engine.');
  }
  const out: unknown[] = [];
  for (const each of asked.requests) {
    out.push(await engines.send(each, AbortSignal.timeout(20_000)));
  }
  return out;
}

async function save(name: string, reply: unknown): Promise<void> {
  await writeFile(join(folder, `mongodb-8.2-compare-${name}.json`), `${JSON.stringify(reply, null, 2)}\n`);
}

async function record(engines: EngineService): Promise<void> {
  await send(engines, 'insertMany', 'left', [left]);
  await send(engines, 'insertMany', 'right', [right]);
  const args = { ...sides, options: { filter: '', ignore: '', ignoreOrder: true, numbersByValue: true } };
  const [leftReply, rightReply] = await replies(engines, readRequest(context, args));
  await save('find-left', leftReply);
  await save('find-right', rightReply);
  const result = parseRead([leftReply, rightReply], args) as CompareResult;
  const details = { mode: 'details', ...args, differences: result.differences as unknown as Json };
  await save('details', await replies(engines, detailsRequest(context, details)));
  const selected = (key: Json) => ({ mode: 'selected', ...sides, side: 'left', id: key });
  await save('findOne', (await replies(engines, detailsRequest(context, selected(int(4)))))[0]);
  await save('findOne-missing', (await replies(engines, detailsRequest(context, selected(int(99)))))[0] ?? null);
}

describe('the recorded replies of the server', () => {
  it.runIf(recording)('records the reads of compare.read and compare.read-details on MongoDB', async () => {
    const engines = createEngines();
    await engines.connect(
      id,
      { engine: 'mongodb', connectionString: testServers().mongoStandalone, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(20_000),
    );
    try {
      await mkdir(folder, { recursive: true });
      await send(engines, 'runCommand', undefined, [{ dropDatabase: int(1) }]);
      await record(engines);
      await send(engines, 'runCommand', undefined, [{ dropDatabase: int(1) }]);
    } finally {
      await engines.disconnectAll();
    }
    expect(recording).toBe(true);
  });
});
