import { describe, expect, it } from 'vitest';
import { fromLogLine, fromProfileDocument } from '../../../src/features/monitor/parts/slow-query-records';
import {
  logOperations,
  parse,
  profilerOperations,
  request,
  slowQueriesArgs,
} from '../../../src/features/monitor/read-slow-queries';
import { contextOn, date, failed, int, local, now, recorded, requestsOf } from './context';

const context = contextOn('monitor.read-slow-queries');

const slowLine =
  '{"t":{"$date":"2026-11-17T13:02:11.000Z"},"msg":"Slow query","attr":{"ns":"shop.orders",' +
  '"command":{"find":"orders","filter":{"status":"paid"}},"planSummary":"COLLSCAN","durationMillis":1840}}';

function logLine(attr: Record<string, unknown>, msg = 'Slow query'): string {
  return JSON.stringify({ t: { $date: '2026-11-17T13:30:00.000Z' }, msg, attr });
}

function readOf(read: ReturnType<typeof parse>): NonNullable<ReturnType<typeof parse>['operations']> {
  if (read.operations === undefined) {
    throw new Error('Expected the operations.');
  }
  return read.operations;
}

describe('monitor.read-slow-queries', () => {
  it('asks the profiler of the last hour at 14:00, by ts descending, with the limit 1,001', () => {
    const args = slowQueriesArgs({ connection: local.id, source: 'profiler', database: 'shop', sinceMinutes: 60, now });
    const [status, profile] = requestsOf(request(context, args));
    expect(status).toMatchObject({ database: 'shop', method: 'runCommand', arguments: [{ profile: int(-1) }] });
    expect(profile).toMatchObject({
      database: 'shop',
      collection: 'system.profile',
      method: 'find',
      arguments: [
        { ts: { $gte: { $date: { $numberLong: String(Date.UTC(2026, 10, 17, 13)) } } } },
        { sort: { ts: int(-1) }, limit: int(1001) },
      ],
    });
  });

  it('asks everything for All, and the server log on admin when no database is chosen', () => {
    const all = slowQueriesArgs({ connection: local.id, source: 'profiler', database: 'shop', sinceMinutes: 0, now });
    expect(requestsOf(request(context, all))[1]?.arguments[0]).toEqual({});
    const log = requestsOf(request(context, { connection: local.id, source: 'log' }));
    expect(log.map((each) => [each.database, each.arguments[0]])).toEqual([
      ['admin', { profile: int(-1) }],
      ['admin', { getLog: 'global' }],
    ]);
  });

  it('reads the profiler’s state alone for the Operations of the profiler', () => {
    const only = { connection: local.id, database: 'shop', source: 'profiler', only: 'profiler' };
    expect(requestsOf(request(context, only))).toHaveLength(1);
    expect(parse([recorded('profile-status')], only)).toEqual({
      source: 'profiler',
      database: 'shop',
      profiler: { kind: 'read', value: { level: 1, slowMs: 0 } },
    });
  });

  it('keeps 1,000 of 1,500 documents and says that there are more', () => {
    const documents = Array.from({ length: 1001 }, (_, index) => ({
      op: 'query',
      ns: 'shop.orders',
      command: { find: 'orders', filter: { n: int(index) } },
      millis: int(5),
      ts: date('2026-11-17T13:30:00Z'),
    }));
    const list = profilerOperations(documents);
    expect(list.operations).toHaveLength(1000);
    expect(list.more).toBe(true);
  });

  it('reads the recorded profiler: the find with its getMore, the aggregates (countDocuments is one), the writes', () => {
    const args = { connection: local.id, source: 'profiler', database: 'shop' };
    const operations = readOf(parse([recorded('profile-status'), recorded('system-profile')], args));
    if (operations.kind !== 'read') {
      throw new Error('Expected the operations.');
    }
    const kinds = operations.value.operations.map((each) => (each.getMore ? `${each.kind} getMore` : each.kind));
    expect(kinds).toEqual(expect.arrayContaining(['find', 'find getMore', 'aggregate', 'distinct']));
    expect(kinds).toEqual(expect.arrayContaining(['update', 'delete', 'insert']));
    const sorted = operations.value.operations.find((each) => each.shape.includes('sort'));
    expect(sorted).toMatchObject({ application: 'checkout', shape: '{ status: ? } · sort { createdAt: -1 }' });
    expect(operations.value.operations.every((each) => each.namespace === 'shop.orders')).toBe(true);
  });

  it('reads the log line of a find of 1,840 ms with the plan COLLSCAN and the shape { status: ? }', () => {
    expect(fromLogLine(slowLine)).toMatchObject({
      source: 'log',
      time: Date.UTC(2026, 10, 17, 13, 2, 11),
      kind: 'find',
      namespace: 'shop.orders',
      millis: 1840,
      plan: 'COLLSCAN',
      shape: '{ status: ? }',
    });
  });

  it('gives nothing for a log line that is not JSON or not a slow query', () => {
    expect(fromLogLine('not json')).toBeUndefined();
    expect(fromLogLine(logLine({ ns: 'shop.orders' }, 'Connection ended'))).toBeUndefined();
  });

  it('leaves out the batch of updates on shop.$cmd and keeps each update statement', () => {
    const batch = logLine({ ns: 'shop.$cmd', command: { update: 'orders', updates: [] }, durationMillis: 3 });
    expect(fromLogLine(batch)).toBeUndefined();
    const statement = logLine({
      ns: 'shop.orders',
      type: 'update',
      command: { q: { status: 'new' }, u: { $set: { seen: true } } },
      durationMillis: 3,
    });
    expect(fromLogLine(statement)).toMatchObject({
      kind: 'update',
      shape: '{ status: ? } · update { $set: { seen: ? } }',
    });
  });

  it('reads a getMore of an aggregate as the aggregate, marked as a getMore', () => {
    const pipeline = [{ $match: { status: 'paid' } }];
    const document = {
      op: 'getmore',
      ns: 'shop.orders',
      command: { getMore: int(7), collection: 'orders' },
      originatingCommand: { aggregate: 'orders', pipeline },
      millis: int(12),
      ts: date('2026-11-17T13:30:00Z'),
    };
    expect(fromProfileDocument(document)).toMatchObject({
      kind: 'aggregate',
      getMore: true,
      shape: '[{ $match: { status: ? } }]',
    });
  });

  it('leaves out system.profile, local.oplog.rs and serverStatus', () => {
    const documents = [
      { op: 'query', ns: 'shop.system.profile', command: { find: 'system.profile' }, millis: int(1) },
      { op: 'query', ns: 'local.oplog.rs', command: { find: 'oplog.rs' }, millis: int(1) },
      { op: 'command', ns: 'admin.$cmd', command: { serverStatus: int(1) }, millis: int(1) },
    ].map((document) => ({ ...document, ts: date('2026-11-17T13:30:00Z') }));
    expect(profilerOperations(documents).operations).toEqual([]);
  });

  it('keeps the operations of shop from the server log of the database shop, the most recent first', () => {
    const lines = {
      log: [
        slowLine,
        logLine({ ns: 'crm.users', command: { find: 'users' }, durationMillis: 400 }),
        logLine({ ns: 'shop.orders', command: { find: 'orders' }, durationMillis: 200 }),
      ],
      totalLinesWritten: int(3),
    };
    const args = { connection: local.id, source: 'log', database: 'shop' };
    const operations = readOf(parse([recorded('profile-status'), lines], args));
    expect(operations.kind === 'read' && operations.value.operations.map((each) => each.millis)).toEqual([200, 1840]);
  });

  it('reads the recorded server log and says that older lines were dropped', () => {
    const list = logOperations(recorded('get-log'));
    expect(list.operations.length).toBeGreaterThan(0);
    expect(list.olderLinesDropped).toBe(true);
    expect(list.operations.some((each) => each.kind === 'update')).toBe(true);
  });

  it('gives each failure apart', () => {
    const args = { connection: local.id, source: 'log' };
    const read = parse([recorded('profile-status'), failed('getLog not allowed', 8000)], args);
    expect(read.profiler.kind).toBe('read');
    expect(read.operations).toEqual({ kind: 'failed', failure: { message: 'getLog not allowed', code: 8000 } });
  });
});
