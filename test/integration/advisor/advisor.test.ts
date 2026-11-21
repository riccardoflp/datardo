/**
 * The Index advisor against a mongod of its own (M30): its reads of the indexes with their use and of the slow
 * operations of the profiler and of the server log, the advice made of them, the profiler turned on, and the reply of
 * `advisor.analyze` that the tool `index_advice` writes. The exit criterion of M30 is here: a collection scan repeated
 * ten times is one slow query shape, and the advisor proposes the index the Explain section suggests for it.
 */
import { MongoClient } from 'mongodb';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  nextRead,
  nothingRead,
  analysisOf,
  withReply,
  withSlowOperations,
} from '../../../src/features/advisor/parts/reading';
import type { AnalysisInput, AnalysisProgress, AnalysisRead } from '../../../src/features/advisor/parts/reading';
import type { IndexesReply } from '../../../src/features/advisor/read-indexes';
import type { ScopeSlowOperations } from '../../../src/features/advisor/read-slow-operations';
import type { CreateAdvice } from '../../../src/features/advisor/types';
import { advice } from '../../../src/features/advisor/analyze';
import type { ExplainResult } from '../../../src/features/explain/run';
import { slowQueryGroups } from '../../../src/features/monitor/group-slow-queries';
import type { SlowQueriesRead } from '../../../src/features/monitor/read-slow-queries';
import { analyzeForTool } from '../../../src/main/advisor';
import { start } from '../../../src/runner/start';
import { featureId } from '../../../src/shared/ids';
import { ownId, ownServer, readOnlyId, type OwnServer } from '../monitor/own-server';

const database = 'advisor_it';
let server: OwnServer;
let client: MongoClient;
// Both are made in beforeAll, which fails the file when they cannot be.

interface Order {
  readonly _id: number;
  readonly customerId: number;
  readonly status: string;
  readonly createdAt: Date;
}

function orders() {
  return client.db(database).collection<Order>('orders');
}

/** The reads of `advisor.show` for the database, one after the other, then the analysis. */
async function analysis(): Promise<Extract<AnalysisRead, { kind: 'read' }>> {
  const input: AnalysisInput = { connection: ownId, scope: { kind: 'database', database }, fallback: database };
  let progress: AnalysisProgress = nothingRead;
  for (let need = nextRead(input, progress); need !== undefined; need = nextRead(input, progress)) {
    const result = await server.start(need.read, need.args);
    if (result.kind !== 'read') {
      throw new Error(JSON.stringify(result));
    }
    progress =
      need.key === 'slow'
        ? withSlowOperations(progress, result.result as ScopeSlowOperations)
        : withReply(progress, result.result as IndexesReply);
  }
  const read = analysisOf(input, progress);
  if (read?.kind !== 'read') {
    throw new Error(JSON.stringify(read));
  }
  return read;
}

async function profileLevel(): Promise<number> {
  const reply = (await server.command(database, { profile: { $numberInt: '-1' } })) as Record<string, unknown>;
  const was = reply['was'];
  return typeof was === 'number' ? was : Number((was as Record<string, string>)['$numberInt']);
}

beforeAll(async () => {
  server = await ownServer();
  client = await MongoClient.connect(server.uri);
  const day = Date.UTC(2026, 10, 1);
  await orders().insertMany(
    Array.from({ length: 500 }, (_, index) => ({
      _id: index,
      customerId: index % 50,
      status: index % 3 === 0 ? 'paid' : 'new',
      createdAt: new Date(day + index * 60_000),
    })),
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

describe('advisor.indexes-to-create', () => {
  it('a collection scan repeated ten times is one shape, and the advisor proposes the index Explain suggests', async () => {
    await server.command(database, { profile: { $numberInt: '1' }, slowms: { $numberInt: '0' } });
    for (let each = 0; each < 10; each += 1) {
      await orders().find({ customerId: each }).sort({ createdAt: -1 }).toArray();
    }
    await server.command(database, { profile: { $numberInt: '0' } });
    const slow = await server.start('monitor.read-slow-queries', { connection: ownId, source: 'profiler', database });
    const read = (slow.kind === 'read' ? slow.result : undefined) as SlowQueriesRead;
    const listed = read.operations?.kind === 'read' ? read.operations.value.operations : [];
    const shapes = slowQueryGroups(listed).filter((group) => group.namespace === `${database}.orders`);
    expect(shapes.map((group) => group.shape)).toEqual(['{ customerId: ? } · sort { createdAt: -1 }']);
    expect(shapes[0]?.count).toBe(10);

    const explained = await start(server.ports, {
      feature: featureId('explain.run'),
      target: { kind: 'collection', connection: ownId, database, collection: 'orders' },
      args: { mode: 'find', query: { filter: '{ customerId: 7 }', sort: '{ createdAt: -1 }', projection: '' } },
    });
    const suggestion = (explained.kind === 'read' ? (explained.result as ExplainResult).suggestion : undefined) ?? [];
    expect(suggestion.length).toBeGreaterThan(0);

    const { indexes, slow: operations } = await analysis();
    const created = advice(indexes.collections, operations.operations, Date.now()).advices.filter(
      (each): each is CreateAdvice => each.kind === 'create',
    );
    expect(created).toHaveLength(1);
    expect(created[0]?.keys).toEqual(suggestion.map((key) => ({ field: key.field, value: key.direction })));
    expect(shapes[0]?.suggestion).toEqual(created[0]?.keys);
  }, 60_000);
});

describe('advisor.read-indexes', () => {
  it('reads the indexes of the database with how many times each was used', async () => {
    await orders().createIndex({ status: 1 });
    await orders().find({ status: 'paid' }).toArray();
    const { indexes } = await analysis();
    const found = indexes.collections.find((each) => each.collection === 'orders')?.indexes ?? [];
    expect(found.map((index) => index.name).sort()).toEqual(['_id_', 'status_1']);
    expect(found.find((index) => index.name === 'status_1')?.uses).toBeGreaterThanOrEqual(1);
    await orders().dropIndex('status_1');
  }, 60_000);
});

describe('advisor.redundant-indexes', () => {
  it('says that { status: 1 } is the start of { status: 1, createdAt: -1 }', async () => {
    await orders().createIndex({ status: 1 });
    await orders().createIndex({ status: 1, createdAt: -1 });
    const { indexes, slow } = await analysis();
    const redundant = advice(indexes.collections, slow.operations, Date.now()).advices.flatMap((each) =>
      each.kind === 'redundant' ? [[each.index.name, each.by.name]] : [],
    );
    expect(redundant).toEqual([['status_1', 'status_1_createdAt_-1']]);
    await orders().dropIndex('status_1');
    await orders().dropIndex('status_1_createdAt_-1');
  }, 60_000);
});

describe('advisor.read-slow-operations', () => {
  it('reads the profiler of the database and says its level', async () => {
    await server.command(database, { profile: { $numberInt: '1' }, slowms: { $numberInt: '0' } });
    await orders().find({ status: 'new' }).toArray();
    const { slow } = await analysis();
    expect(slow.profilers).toEqual([expect.objectContaining({ database, level: 1 })]);
    expect(slow.operations.some((each) => each.namespace === `${database}.orders`)).toBe(true);
  }, 60_000);
});

describe('advisor.turn-on-profiler', () => {
  it('turns the profiler of the database on after a confirmation, and refuses on a read-only connection', async () => {
    expect(await profileLevel()).toBe(0);
    server.dialogs.confirm = false;
    expect(await server.start('advisor.turn-on-profiler', { connection: ownId, database })).toEqual({
      kind: 'cancelled',
    });
    expect(await profileLevel()).toBe(0);
    server.dialogs.confirm = true;
    expect(await server.start('advisor.turn-on-profiler', { connection: ownId, database })).toEqual({ kind: 'done' });
    expect(await profileLevel()).toBe(1);
    const refused = await server.start('advisor.turn-on-profiler', { connection: readOnlyId, database }, readOnlyId);
    expect(refused).toMatchObject({ kind: 'refused', code: 'advisor.turn-on-profiler/read-only' });
  }, 60_000);
});

describe('advisor.analyze', () => {
  it('gives index_advice the advice of the database, through the reads the MCP server starts', async () => {
    await server.command(database, { profile: { $numberInt: '1' }, slowms: { $numberInt: '0' } });
    await orders().find({ customerId: 3 }).sort({ createdAt: -1 }).toArray();
    await server.command(database, { profile: { $numberInt: '0' } });
    const reply = await analyzeForTool({ connection: ownId, database }, (need, connection) =>
      start(
        server.ports,
        { feature: need.read, target: { kind: 'connection', connection }, args: need.args },
        { startedBy: 'mcp' },
      ),
    );
    expect(reply.collections).toBeGreaterThanOrEqual(1);
    expect(reply.operations).toMatchObject({ source: 'profiler' });
    expect(reply.advice).toContainEqual(
      expect.objectContaining({ kind: 'create', collection: 'orders', keys: { customerId: 1, createdAt: -1 } }),
    );
  }, 60_000);
});
