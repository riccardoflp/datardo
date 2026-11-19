import { describe, expect, it } from 'vitest';
import { parse, request } from '../../../src/features/advisor/read-slow-operations';
import type { Json } from '../../../src/shared/engine-request';
import { contextOn, failed, int, local, requestsOf } from '../monitor/context';
import { profileDocument, recorded } from './context';

const connection = local.id;

/** A "Slow query" line of the server log on a namespace. */
function logLine(
  namespace: string,
  iso = '2026-11-17T12:00:00.000Z',
  command: Json = { find: 'x', filter: { a: 1 } },
): string {
  return JSON.stringify({
    t: { $date: iso },
    s: 'I',
    c: 'COMMAND',
    id: 51_803,
    ctx: 'conn12',
    msg: 'Slow query',
    attr: {
      type: 'command',
      ns: namespace,
      command,
      planSummary: 'COLLSCAN',
      durationMillis: 250,
      docsExamined: 900,
      nreturned: 1,
    },
  });
}

function log(...lines: readonly string[]): Json {
  return { totalLinesWritten: int(lines.length), log: [...lines], ok: int(1) };
}

function status(level: number, slowms = 100): Json {
  return { was: int(level), slowms: int(slowms), sampleRate: int(1), ok: int(1) };
}

const shopAndCrm = {
  connection,
  databases: ['crm', 'shop'],
  profiled: ['shop'],
  collections: ['crm.users', 'shop.orders', 'shop.customers'],
};

describe('advisor.read-slow-operations', () => {
  it('with shop profiled and crm not, the 5,000 most recent documents of shop are read, and not crm.system.profile', () => {
    const sent = requestsOf(request(contextOn('advisor.read-slow-operations'), shopAndCrm));
    expect(sent.map((each) => [each.database, each.collection, each.method, each.arguments])).toEqual([
      ['crm', undefined, 'runCommand', [{ profile: int(-1) }]],
      ['shop', undefined, 'runCommand', [{ profile: int(-1) }]],
      ['shop', 'system.profile', 'find', [{}, { sort: { ts: int(-1) }, limit: int(5000) }]],
      ['admin', undefined, 'runCommand', [{ getLog: 'global' }]],
    ]);
    expect(sent[2]?.limit).toBe(5000);
  });

  it('a log line on shop.orders is left out when the profiler of shop gave operations, and kept when it gave none', () => {
    const lines = log(logLine('shop.orders'), logLine('crm.users'));
    const gave = parse([status(0), status(1), [profileDocument({ filter: { b: int(1) } })], lines], shopAndCrm);
    expect(gave.operations.map((each) => [each.source, each.namespace])).toEqual([
      ['profiler', 'shop.orders'],
      ['log', 'crm.users'],
    ]);
    expect(gave.log).toEqual({ kind: 'read', operations: 1 });
    const none = parse([status(0), status(1), [], lines], shopAndCrm);
    expect(none.operations.map((each) => [each.source, each.namespace])).toEqual([
      ['log', 'shop.orders'],
      ['log', 'crm.users'],
    ]);
  });

  it('for the scope shop.orders, an operation on shop.customers is not returned', () => {
    const args = { connection, databases: ['shop'], profiled: ['shop'], collections: ['shop.orders'] };
    const documents = [profileDocument({ namespace: 'shop.customers' }), profileDocument({ namespace: 'shop.orders' })];
    expect(parse([status(1), documents, log()], args).operations.map((each) => each.namespace)).toEqual([
      'shop.orders',
    ]);
  });

  it('a serverStatus, an operation on shop.system.profile and one on local.oplog.rs are not returned', () => {
    const args = { ...shopAndCrm, collections: [...shopAndCrm.collections, 'shop.system.profile', 'local.oplog.rs'] };
    const lines = log(
      logLine('admin.$cmd', undefined, { serverStatus: 1 }),
      logLine('shop.system.profile'),
      logLine('local.oplog.rs'),
    );
    expect(parse([status(0), status(0), [], lines], args).operations).toEqual([]);
  });

  it('with the profiler of shop at level 0 and an empty system.profile, shop says level 0 and 0 operations', () => {
    expect(parse([status(0), status(0), [], log()], shopAndCrm).profilers).toEqual([
      { database: 'crm', level: 0, operations: 0 },
      { database: 'shop', level: 0, operations: 0 },
    ]);
  });

  it('when getLog is refused, the profiler operations are returned with the error of the log beside them', () => {
    const refused = failed('not authorized on admin to execute command { getLog: "global" }', 13);
    const read = parse([status(0), status(1), [profileDocument({})], refused], shopAndCrm);
    expect(read.operations).toHaveLength(1);
    expect(read.log).toEqual({
      kind: 'failed',
      message: 'not authorized on admin to execute command { getLog: "global" }',
    });
  });

  it('an error of one profiler is kept beside its database and does not fail the read', () => {
    const read = parse(
      [status(0), failed('profile refused', 13), failed('find refused', 13), log(logLine('crm.users'))],
      shopAndCrm,
    );
    expect(read.profilers[1]).toEqual({ database: 'shop', operations: 0, error: 'profile refused' });
    expect(read.operations).toHaveLength(1);
  });

  it('the oldest of operations of 09:00, 11:30 and 12:00 is 09:00; the threshold is the first one returned', () => {
    const documents = [
      profileDocument({ time: Date.UTC(2026, 10, 17, 12, 0) }),
      profileDocument({ time: Date.UTC(2026, 10, 17, 11, 30) }),
      profileDocument({ time: Date.UTC(2026, 10, 17, 9, 0) }),
    ];
    const read = parse([status(0, 250), status(1, 100), documents, log()], shopAndCrm);
    expect(read.oldest).toBe(Date.UTC(2026, 10, 17, 9, 0));
    expect(read.threshold).toBe(250);
  });

  it('with log: false only the state of each profiler is asked', () => {
    const args = { connection, databases: ['shop'], profiled: [], collections: [], log: false };
    expect(requestsOf(request(contextOn('advisor.read-slow-operations'), args))).toHaveLength(1);
    expect(parse([status(0, 250)], args)).toEqual({
      operations: [],
      profilers: [{ database: 'shop', level: 0, operations: 0 }],
      log: { kind: 'not-read' },
      threshold: 250,
    });
  });

  it('the replies recorded from MongoDB 8.2 give the finds and the aggregate on shop.orders, from the profiler', () => {
    const args = { connection, databases: ['shop'], profiled: ['shop'], collections: ['shop.orders'] };
    const read = parse([recorded('profile-status'), recorded('system-profile'), recorded('get-log')], args);
    expect(read.profilers).toEqual([{ database: 'shop', level: 2, operations: read.operations.length }]);
    expect(read.threshold).toBe(100);
    expect(read.log).toEqual({ kind: 'read', operations: 0 });
    expect(new Set(read.operations.map((each) => each.kind))).toEqual(
      new Set(['find', 'aggregate', 'count', 'listIndexes']),
    );
    const kept = parse([recorded('profile-status'), [], recorded('get-log')], args);
    expect(kept.log.kind === 'read' && kept.log.operations > 0).toBe(true);
    expect(kept.operations.every((each) => each.namespace === 'shop.orders')).toBe(true);
  });
});
