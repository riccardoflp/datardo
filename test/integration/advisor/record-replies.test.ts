/**
 * Records the replies of `advisor.read-indexes` and `advisor.read-slow-operations` from the throwaway MongoDB into
 * `test/fixtures/replies/`, named after the server version they came from (testing.md). It runs only when
 * `DATARDO_RECORD_REPLIES=1`: the unit tests of the Index advisor read the recorded files, and the files change only
 * when they are recorded again.
 *
 * The collection `shop.orders` gets one index of each kind the advisor tells apart (unique, TTL, partial, sparse,
 * hidden, with a collation, and a plain one); a few queries run with the profiler at level 2, so that `$indexStats`
 * counts uses and `system.profile` and the server log hold operations. So that the files say nothing of the machine
 * they were recorded on, the server log keeps only its "Slow query" lines on `shop`, every `host` is
 * `localhost:27017`, and `$collStats` loses the statistics of WiredTiger (`wiredTiger`, `indexDetails`), which no
 * feature reads.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';
import { createEngines, type EngineService } from '../../../src/engines';
import { request as indexesRequest } from '../../../src/features/advisor/read-indexes';
import { request as slowRequest } from '../../../src/features/advisor/read-slow-operations';
import type { Json, MongoRequest } from '../../../src/shared/engine-request';
import type { Context, ReadRequest } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import { initialState } from '../../../src/shared/state';
import { testServers } from '../servers';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');
const id = connectionId('record');
const database = 'shop';
const collection = 'orders';

const context: Context = {
  feature: featureId('advisor.read-indexes'),
  now: 0,
  platform: 'windows',
  startedBy: 'user',
  target: { kind: 'app' },
  state: initialState,
};

function int(value: number): Json {
  return { $numberInt: String(value) };
}

function date(iso: string): Json {
  return { $date: { $numberLong: String(Date.parse(iso)) } };
}

/** The documents of `shop.orders`. */
function orders(): readonly Json[] {
  return Array.from({ length: 60 }, (_, index) => ({
    customerId: int(index % 6),
    status: index % 3 === 0 ? 'new' : 'paid',
    total: int(index * 10),
    createdAt: date(`2026-11-${String(1 + (index % 28)).padStart(2, '0')}T10:00:00Z`),
    expiresAt: date('2030-01-01T00:00:00Z'),
    email: `customer${String(index)}@example.com`,
    name: `Customer ${String(index)}`,
    active: index % 2 === 0,
    ...(index % 5 === 0 ? { note: `note ${String(index)}` } : {}),
  }));
}

/** One index of each kind the advisor tells apart. */
const indexes: readonly Json[] = [
  { key: { email: int(1) }, name: 'email_1', unique: true },
  { key: { expiresAt: int(1) }, name: 'expiresAt_1', expireAfterSeconds: int(86_400) },
  { key: { customerId: int(1) }, name: 'customerId_1', partialFilterExpression: { active: true } },
  { key: { note: int(1) }, name: 'note_1', sparse: true },
  { key: { total: int(1) }, name: 'total_1', hidden: true },
  { key: { name: int(1) }, name: 'name_1', collation: { locale: 'fr' } },
  { key: { status: int(1) }, name: 'status_1' },
  { key: { status: int(1), createdAt: int(-1) }, name: 'status_1_createdAt_-1' },
];

async function send(engines: EngineService, given: Omit<MongoRequest, 'engine'>): Promise<unknown> {
  return engines.send({ connection: id, request: { engine: 'mongodb', ...given } }, AbortSignal.timeout(20_000));
}

async function command(engines: EngineService, body: Json): Promise<unknown> {
  return send(engines, { database, method: 'runCommand', arguments: [body] });
}

/** The replies of a Read, in the order of its requests. */
async function repliesOf(engines: EngineService, read: ReadRequest): Promise<readonly unknown[]> {
  if (read.kind !== 'engine') {
    throw new Error(`Expected requests to the engine, got ${read.kind}.`);
  }
  const replies: unknown[] = [];
  for (const each of read.requests) {
    replies.push(await engines.send(each, AbortSignal.timeout(20_000)));
  }
  return replies;
}

/** The queries whose operations the profiler and the log record. */
async function runQueries(engines: EngineService): Promise<void> {
  const on = { database, collection };
  await send(engines, { ...on, method: 'find', arguments: [{ status: 'paid' }, {}] });
  await send(engines, { ...on, method: 'find', arguments: [{ status: 'new' }, { sort: { createdAt: int(-1) } }] });
  await send(engines, { ...on, method: 'find', arguments: [{ customerId: int(3) }, { sort: { createdAt: int(-1) } }] });
  await send(engines, { ...on, method: 'find', arguments: [{ total: { $gt: int(100) } }, { batchSize: int(5) }] });
  await send(engines, { ...on, method: 'find', arguments: [{ email: 'customer7@example.com' }, {}] });
  await send(engines, {
    ...on,
    method: 'aggregate',
    arguments: [[{ $match: { customerId: int(2) } }, { $sort: { total: int(-1) } }]],
  });
}

/** Only the "Slow query" lines on `shop`: nothing of the machine the server runs on. */
function slowLinesOnly(reply: unknown): unknown {
  const record = reply as { log?: unknown; totalLinesWritten?: unknown; ok?: unknown };
  const lines = Array.isArray(record.log) ? record.log : [];
  const kept = lines.filter((line): line is string => {
    if (typeof line !== 'string') {
      return false;
    }
    const entry = JSON.parse(line) as { msg?: unknown; attr?: { ns?: unknown } };
    return entry.msg === 'Slow query' && typeof entry.attr?.ns === 'string' && entry.attr.ns.startsWith(`${database}.`);
  });
  return { totalLinesWritten: record.totalLinesWritten, log: kept, ok: record.ok };
}

/** The reply without the name of the machine and the statistics of WiredTiger. */
function scrubbed(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(scrubbed);
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const entries = Object.entries(value)
    .filter(([name]) => name !== 'wiredTiger' && name !== 'indexDetails')
    .map(([name, field]) => [name, name === 'host' ? 'localhost:27017' : scrubbed(field)]);
  return Object.fromEntries(entries);
}

async function save(name: string, reply: unknown): Promise<void> {
  const path = join(folder, `mongodb-8.2-advisor-${name}.json`);
  const options = (await resolveConfig(path)) ?? {};
  await writeFile(path, await format(`${JSON.stringify(scrubbed(reply), null, 2)}\n`, { ...options, filepath: path }));
}

async function recordAll(engines: EngineService): Promise<void> {
  const [databases] = await repliesOf(engines, indexesRequest(context, { connection: id, step: 'databases' }));
  const [collections] = await repliesOf(
    engines,
    indexesRequest(context, { connection: id, step: 'collections', databases: [database] }),
  );
  const [listIndexes, indexStats, collStats, count] = await repliesOf(
    engines,
    indexesRequest(context, { connection: id, step: 'indexes', collections: [{ database, collection }] }),
  );
  await command(engines, { profile: int(2), slowms: int(100) });
  const [profile, profiler, log] = await repliesOf(
    engines,
    slowRequest(context, {
      connection: id,
      databases: [database],
      profiled: [database],
      collections: [`${database}.${collection}`],
    }),
  );
  await Promise.all([
    save('list-databases', databases),
    save('list-collections', collections),
    save('list-indexes', listIndexes),
    save('index-stats', indexStats),
    save('coll-stats', collStats),
    save('estimated-document-count', count),
    save('profile-status', profile),
    save('system-profile', profiler),
    save('get-log', slowLinesOnly(log)),
  ]);
}

describe('the recorded replies of the server', () => {
  it.runIf(recording)('records the replies of the Index advisor on MongoDB', async () => {
    const engines = createEngines();
    await engines.connect(
      id,
      { engine: 'mongodb', connectionString: testServers().mongoStandalone, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(20_000),
    );
    try {
      await mkdir(folder, { recursive: true });
      await command(engines, { profile: int(0) });
      await command(engines, { dropDatabase: int(1) });
      await send(engines, { database, collection, method: 'insertMany', arguments: [orders()] });
      await command(engines, { createIndexes: collection, indexes: [...indexes] });
      // Every operation is profiled (level 2) and written to the log as slow (slowms 0) while the queries run.
      await command(engines, { profile: int(2), slowms: int(0) });
      await runQueries(engines);
      await recordAll(engines);
      await command(engines, { profile: int(0), slowms: int(100) });
      await command(engines, { dropDatabase: int(1) });
    } finally {
      await engines.disconnectAll();
    }
    expect(recording).toBe(true);
  });
});
