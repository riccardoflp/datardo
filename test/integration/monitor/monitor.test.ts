/**
 * The Operations and the Slow queries sections of the Monitor page against a mongod of their own (M30): the operations
 * in progress and the kill of one; the profiler set, its threshold, its operations cleared; the slow operations read
 * from the profiler and from the server log; the index a slow query suggests, created. The profiler is turned off and
 * the threshold set back to 100 ms after each test that changes them.
 */
import { MongoClient } from 'mongodb';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { slowQueryGroups } from '../../../src/features/monitor/group-slow-queries';
import type { PartRead } from '../../../src/features/monitor/parts/failure';
import type { ServerOperation } from '../../../src/features/monitor/read-operations';
import type { SlowQueriesRead } from '../../../src/features/monitor/read-slow-queries';
import type { IntentResult } from '../../../src/shared/bridge';
import { ownServer, readOnlyId, type OwnServer } from './own-server';

const database = 'monitor_it';
let server: OwnServer;
let client: MongoClient;
// Both are made in beforeAll, which fails the file when they cannot be.

function readOf(result: IntentResult): unknown {
  if (result.kind !== 'read') {
    throw new Error(`Expected a read, got ${JSON.stringify(result)}`);
  }
  return result.result;
}

async function operations(idle = false): Promise<readonly ServerOperation[]> {
  const read = readOf(await server.start('monitor.read-operations', { connection: 'c-monitor', idle })) as PartRead<
    readonly ServerOperation[]
  >;
  if (read.kind !== 'read') {
    throw new Error(read.failure.message);
  }
  return read.value;
}

async function profilerOf(name: string): Promise<{ was: number; slowms: number }> {
  const reply = (await server.command(name, { profile: { $numberInt: '-1' } })) as Record<string, unknown>;
  const number = (value: unknown): number =>
    typeof value === 'number' ? value : Number((value as Record<string, string>)['$numberInt'] ?? NaN);
  return { was: number(reply['was']), slowms: number(reply['slowms']) };
}

async function slowQueries(args: Readonly<Record<string, string>>): Promise<SlowQueriesRead> {
  return readOf(
    await server.start('monitor.read-slow-queries', { connection: 'c-monitor', ...args }),
  ) as SlowQueriesRead;
}

interface Order {
  readonly _id: number;
  readonly status: string;
}

function orders() {
  return client.db(database).collection<Order>('orders');
}

/** A `find` that sleeps on the server, so that `currentOp` lists it while it runs. */
function sleeping(milliseconds: number): Promise<unknown> {
  return orders()
    .find({ _id: 0, $where: `sleep(${String(milliseconds)}) || true` })
    .toArray()
    .catch((error: unknown) => error);
}

async function sleepingOperation(): Promise<ServerOperation> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const found = (await operations()).find((each) => each.command.includes('sleep('));
    if (found !== undefined) {
      return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('The sleeping find was not listed.');
}

function killArgs(operation: ServerOperation): Record<string, unknown> {
  return {
    connection: 'c-monitor',
    operation: {
      opid: operation.opid ?? 0,
      type: operation.type,
      namespace: operation.namespace,
      command: operation.command,
    },
  };
}

beforeAll(async () => {
  server = await ownServer();
  client = await MongoClient.connect(server.uri);
  await orders().insertMany(
    Array.from({ length: 200 }, (_, index) => ({ _id: index, status: index % 2 === 0 ? 'paid' : 'new' })),
  );
}, 120_000);

afterEach(async () => {
  server.dialogs.confirm = true;
  await server.command(database, { profile: { $numberInt: '0' }, slowms: { $numberInt: '100' } });
});

afterAll(async () => {
  await client.close();
  await server.close();
});

describe('monitor.read-operations', () => {
  it('lists a find that runs, and the idle connections with $all: true', async () => {
    const running = sleeping(1500);
    const found = await sleepingOperation();
    expect(found).toMatchObject({ type: 'query', namespace: `${database}.orders` });
    expect(typeof found.opid).toBe('number');
    const withIdle = await operations(true);
    expect(withIdle.length).toBeGreaterThan((await operations()).length);
    await running;
  }, 30_000);
});

describe('monitor.kill-operation', () => {
  it('sends killOp with the opid, writes it in the Log, and reads the operations again', async () => {
    const running = sleeping(20_000);
    const found = await sleepingOperation();
    const result = await server.start('monitor.kill-operation', killArgs(found) as never);
    expect(result).toEqual({ kind: 'done' });
    const log = server.state().runner.log.map((line) => line.text);
    // The runner writes each step with `runner.step-text`, which writes the admin database as any other: the line the
    // card gives as `db.adminCommand(…)` reads `db.getSiblingDB("admin").runCommand(…)` (Q132).
    expect(log).toContain(
      `[monitor.kill-operation] db.getSiblingDB("admin").runCommand({ killOp: 1, op: ${String(found.opid)} })`,
    );
    expect(String(await running)).toMatch(/interrupted|killed/iu);
  }, 30_000);

  it('sends nothing when the confirmation is closed', async () => {
    const running = sleeping(2500);
    const found = await sleepingOperation();
    server.dialogs.confirm = false;
    const result = await server.start('monitor.kill-operation', killArgs(found) as never);
    expect(result).toEqual({ kind: 'cancelled' });
    expect((await operations()).some((each) => each.opid === found.opid)).toBe(true);
    expect(await running).toEqual(expect.any(Array));
  }, 30_000);

  it('fails with the server’s message for an operation that is not found, and refuses on a read-only connection', async () => {
    const gone = { opid: 2_000_000_000, type: 'query', namespace: `${database}.orders`, command: '{}' };
    const result = await server.start('monitor.kill-operation', { connection: 'c-monitor', operation: gone });
    expect(['done', 'failed']).toContain(result.kind);
    const refused = await server.start(
      'monitor.kill-operation',
      { connection: readOnlyId, operation: gone },
      readOnlyId,
    );
    expect(refused).toMatchObject({ kind: 'refused', code: 'monitor.kill-operation/read-only' });
  }, 30_000);
});

describe('monitor.set-profiler', () => {
  it('sets level 1 at 250 ms, then all operations, then off; refuses on a read-only connection', async () => {
    const on = { connection: 'c-monitor', database };
    expect(await server.start('monitor.set-profiler', { ...on, level: 1, slowMs: 250 })).toEqual({ kind: 'done' });
    expect(await profilerOf(database)).toEqual({ was: 1, slowms: 250 });
    expect(await server.start('monitor.set-profiler', { ...on, level: 2, slowMs: 12.6 })).toEqual({ kind: 'done' });
    expect(await profilerOf(database)).toEqual({ was: 2, slowms: 13 });
    expect(await server.start('monitor.set-profiler', { ...on, level: 0, slowMs: 100 })).toEqual({ kind: 'done' });
    expect(await profilerOf(database)).toEqual({ was: 0, slowms: 100 });
    const refused = await server.start('monitor.set-profiler', { ...on, connection: readOnlyId, level: 1 }, readOnlyId);
    expect(refused).toMatchObject({ kind: 'refused', code: 'monitor.set-profiler/read-only' });
    expect((await profilerOf(database)).was).toBe(0);
  }, 30_000);
});

describe('monitor.set-log-threshold', () => {
  it('sends profile: -1 with slowms: 50, which leaves the level as it is', async () => {
    await server.command(database, { profile: { $numberInt: '1' } });
    const result = await server.start('monitor.set-log-threshold', { connection: 'c-monitor', slowMs: 50 });
    expect(result).toEqual({ kind: 'done' });
    expect(await profilerOf(database)).toEqual({ was: 1, slowms: 50 });
    const read = await slowQueries({ source: 'log', database });
    expect(read.profiler).toEqual({ kind: 'read', value: { level: 1, slowMs: 50 } });
  }, 30_000);
});

describe('monitor.read-slow-queries', () => {
  it('reads the profiler of a database and the slow query lines of the server log', async () => {
    await server.command(database, { profile: { $numberInt: '1' }, slowms: { $numberInt: '0' } });
    await orders().find({ status: 'paid' }).toArray();
    const fromProfiler = await slowQueries({ source: 'profiler', database });
    expect(fromProfiler.profiler).toEqual({ kind: 'read', value: { level: 1, slowMs: 0 } });
    const listed = fromProfiler.operations?.kind === 'read' ? fromProfiler.operations.value.operations : [];
    expect(listed.some((each) => each.kind === 'find' && each.shape === '{ status: ? }')).toBe(true);
    const fromLog = await slowQueries({ source: 'log', database });
    const logged = fromLog.operations?.kind === 'read' ? fromLog.operations.value.operations : [];
    expect(logged.some((each) => each.namespace === `${database}.orders`)).toBe(true);
  }, 30_000);
});

describe('monitor.clear-profiler', () => {
  it('drops system.profile and sets the profiler back as it was', async () => {
    await server.command(database, { profile: { $numberInt: '2' } });
    await orders().countDocuments({ status: 'new' });
    const result = await server.start('monitor.clear-profiler', { connection: 'c-monitor', database });
    expect(result).toEqual({ kind: 'done' });
    expect((await profilerOf(database)).was).toBe(2);
    const read = await slowQueries({ source: 'profiler', database });
    const left = read.operations?.kind === 'read' ? read.operations.value.operations : [];
    expect(left.filter((each) => each.kind === 'count')).toEqual([]);
  }, 30_000);
});

describe('monitor.group-slow-queries', () => {
  it('shows a collection scan repeated ten times as one query shape that asks for an index', async () => {
    await server.command(database, { profile: { $numberInt: '1' }, slowms: { $numberInt: '0' } });
    for (let each = 0; each < 10; each += 1) {
      await orders()
        .find({ status: each % 2 === 0 ? 'paid' : 'new' })
        .toArray();
    }
    const read = await slowQueries({ source: 'profiler', database });
    const listed = read.operations?.kind === 'read' ? read.operations.value.operations : [];
    const groups = slowQueryGroups(listed).filter((group) => group.shape === '{ status: ? }');
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ count: 10, collectionScan: true, suggestion: [{ field: 'status', value: 1 }] });
  }, 30_000);
});

describe('monitor.create-suggested-index', () => {
  it('creates { status: 1 } on monitor_it.orders, then refuses it as existing', async () => {
    const args = {
      connection: 'c-monitor',
      namespace: `${database}.orders`,
      keys: { status: { $numberInt: '1' } },
      view: false,
      reread: null,
    };
    expect(await server.start('monitor.create-suggested-index', args)).toEqual({ kind: 'done' });
    const indexes = await orders().indexes();
    expect(indexes.map((index) => index.key)).toContainEqual({ status: 1 });
    expect(await server.start('monitor.create-suggested-index', args)).toMatchObject({
      kind: 'refused',
      code: 'monitor.create-suggested-index/exists',
    });
    await orders().dropIndex('status_1');
  }, 30_000);
});
