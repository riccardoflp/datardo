import { describe, expect, it } from 'vitest';
import type { MongoRequest } from '../../../src/shared/engine-request';
import { adviceText, type AdvisorReply } from '../../../src/features/mcp/tool/advice';
import { suggestIndex } from '../../../src/features/mcp/tool/explain';
import { answerOf, drive, failed, failureOf, mcpState, nameOf } from './harness';

const shopOrders = { connection: 'Local', database: 'shop', collection: 'orders' };
const collections = (request: MongoRequest): unknown => {
  if (request.method !== 'listCollections') {
    return undefined;
  }
  const name = (request.arguments[0] as { name?: string }).name;
  return name === 'paid'
    ? [{ name: 'paid', type: 'view', options: { viewOn: 'orders', pipeline: [] } }]
    : [{ name: 'orders', type: 'collection', options: {} }];
};
const unexpected = (request: MongoRequest): unknown => failed(`unexpected ${nameOf(request)}`);
const commandsOf = (sent: readonly { request: unknown }[]): readonly string[] =>
  sent.map((each) => nameOf(each.request as MongoRequest));

const collscan = {
  queryPlanner: { winningPlan: { stage: 'COLLSCAN', filter: { status: { $eq: 'paid' } } }, rejectedPlans: [] },
  executionStats: { nReturned: 3, executionTimeMillis: 12, totalKeysExamined: 0, totalDocsExamined: 1000 },
  ok: 1,
};

describe('mcp.performance-tools', () => {
  it('explains a find with a collection scan, and suggests the index to create without creating it', () => {
    const driven = drive(
      'explain_query',
      { ...shopOrders, filter: '{ status: "paid" }' },
      {
        mongo: (request) =>
          collections(request) ?? (nameOf(request) === 'runCommand:explain' ? collscan : unexpected(request)),
      },
    );
    const text = answerOf(driven);
    expect(text).toContain('Plan: COLLSCAN (every document of the collection is read: no index serves the filter).');
    expect(text).toContain('db.getCollection("orders").createIndex({ status: 1 })');
    expect(commandsOf(driven.sent)).not.toContain('runCommand:createIndexes');
    const explain = driven.sent
      .map((each) => each.request as MongoRequest)
      .find((each) => each.method === 'runCommand');
    expect(explain?.arguments[0]).toMatchObject({ verbosity: 'executionStats', explain: { find: 'orders' } });
  });

  it('refuses a pipeline with a filter, sort, projection or limit', () => {
    const sentence =
      'Give either a pipeline or filter/sort/projection/limit, not both: put a $match, $sort, $project or $limit stage in the pipeline instead.';
    expect(
      failureOf(drive('explain_query', { ...shopOrders, pipeline: '[ { $match: {} } ]', filter: '{ a: 1 }' })),
    ).toBe(sentence);
    expect(failureOf(drive('explain_query', { ...shopOrders, pipeline: '[ { $match: {} } ]', limit: 5 }))).toBe(
      sentence,
    );
  });

  it('orders the keys of a suggested index by equality, sort, then range', () => {
    expect(suggestIndex({ status: 'paid', total: { $gt: 100 } }, { at: -1 })).toEqual({ status: 1, at: -1, total: 1 });
  });

  it('gives the slow queries as shapes, reading the profiler without changing it', () => {
    const profile = {
      op: 'query',
      ns: 'shop.orders',
      command: { find: 'orders', filter: { a: 'secret-value', s: 5 }, sort: { b: 1 } },
      millis: 250,
      docsExamined: 5000,
      keysExamined: 0,
      nreturned: 2,
      planSummary: 'COLLSCAN',
      ts: { $date: { $numberLong: String(1_763_399_000_000) } },
    };
    const driven = drive(
      'slow_queries',
      { connection: 'Local', database: 'shop' },
      {
        mongo: (request) => {
          const name = nameOf(request);
          if (name === 'runCommand:profile') {
            return { was: 2, slowms: 100, ok: 1 };
          }
          if (request.method === 'findOne') {
            return { _id: 1 };
          }
          return request.method === 'find' ? [profile] : unexpected(request);
        },
      },
    );
    const text = answerOf(driven);
    expect(text).toContain('find shop.orders: { a: ?, s: ? } · sort { b: 1 }');
    expect(text).not.toContain('secret-value');
    const profiles = driven.sent
      .map((each) => each.request as MongoRequest)
      .filter((each) => nameOf(each) === 'runCommand:profile');
    expect(profiles.map((each) => each.arguments[0])).toEqual([{ profile: -1 }]);
  });

  it('reads the server log when the profiler is off and empty, and says how to turn it on', () => {
    const line = JSON.stringify({
      t: { $date: '2025-11-17T17:10:00.000Z' },
      msg: 'Slow query',
      attr: {
        ns: 'shop.orders',
        command: { find: 'orders', filter: { a: 1 } },
        durationMillis: 300,
        planSummary: 'COLLSCAN',
        docsExamined: 900,
        nreturned: 1,
      },
    });
    const text = answerOf(
      drive(
        'slow_queries',
        { connection: 'Local', database: 'shop' },
        {
          mongo: (request) => {
            const name = nameOf(request);
            if (name === 'runCommand:profile') {
              return { was: 0, slowms: 100, ok: 1 };
            }
            if (request.method === 'findOne') {
              return null;
            }
            return name === 'runCommand:getLog' ? { log: [line], totalLinesWritten: 1 } : unexpected(request);
          },
        },
      ),
    );
    expect(text).toContain('from the server log');
    expect(text).toContain(
      "it can be turned on in Datardo's Monitor page (Profiler) or with db.setProfilingLevel(1, { slowms: 100 })",
    );
    expect(text).toContain('find shop.orders: { a: ? }');
  });

  it('refuses the profiler without a database', () => {
    expect(failureOf(drive('slow_queries', { connection: 'Local', source: 'profiler' }))).toBe(
      'database is required with source "profiler": each database has its own profiler.',
    );
  });

  const ops = {
    inprog: [
      {
        opid: 1,
        active: true,
        op: 'command',
        ns: 'admin.$cmd',
        command: { currentOp: 1 },
        secs_running: 0,
        microsecs_running: 10,
      },
      ...Array.from({ length: 12 }, (_, index) => ({
        opid: index + 2,
        active: true,
        op: 'query',
        ns: 'shop.orders',
        command: {
          find: 'orders',
          filter: { email: 'ada@example.com', note: 'n'.repeat(400) },
          lsid: { id: 1 },
          $clusterTime: {},
        },
        secs_running: 2,
        microsecs_running: 2_000_000,
        client: '127.0.0.1:5000',
      })),
    ],
    ok: 1,
  };

  it('lists the operations running, without its own, with filters in the head', () => {
    const text = answerOf(
      drive('current_operations', { connection: 'Local', minSeconds: 3600, namespace: 'shop' }, { mongo: () => ops }),
    );
    expect(text).toBe('0 operations running 3600 s or more, in shop (of 12 active).');
  });

  it('cuts each command at 300 characters, with values only with readData on, and without the session fields', () => {
    const on = answerOf(drive('current_operations', { connection: 'Local', limit: 1 }, { mongo: () => ops }));
    expect(on).toContain('ada@example.com');
    expect(on).not.toContain('lsid');
    const command = on.split('\n').find((each) => each.includes('ada@example.com')) ?? '';
    expect(command.trim().length).toBeLessThanOrEqual(301);
    const off = answerOf(
      drive(
        'current_operations',
        { connection: 'Local', limit: 1 },
        { mongo: () => ops },
        mcpState({ settings: { 'datardo.mcp.readData': false } }),
      ),
    );
    expect(off).toContain('email: ?');
    expect(off).not.toContain('ada@example.com');
  });

  it("shows the user's own operations without the inprog privilege", () => {
    const driven = drive(
      'current_operations',
      { connection: 'Local' },
      {
        mongo: (request) =>
          '$ownOps' in (request.arguments[0] as object) ? { inprog: [], ok: 1 } : failed('not authorized on admin', 13),
      },
    );
    expect(answerOf(driven)).toContain(
      "Only the user's own operations: seeing all of them needs the clusterMonitor role (inprog).",
    );
  });

  it('answers that a view has no indexes, and asks the advisor otherwise', () => {
    expect(
      answerOf(
        drive('index_advice', { connection: 'Local', database: 'shop', collection: 'paid' }, { mongo: collections }),
      ),
    ).toBe('shop.paid is a view: it has no indexes of its own (the indexes of orders serve it).');
    const none: AdvisorReply = {
      collections: 1,
      indexes: 1,
      indexBytes: 4096,
      operations: { count: 0, source: 'profiler' },
      notes: [],
      advice: [],
      tooRecent: 0,
    };
    const driven = drive('index_advice', { connection: 'Local', database: 'shop' }, { app: () => none });
    expect(answerOf(driven)).toContain('No advice: no missing, redundant, unused or hidden index found.');
    expect(driven.apps.map((each) => each.action)).toEqual(['advisor.analyze']);
    expect(adviceText('shop', { ...none, tooRecent: 2 })).toContain(
      '2 indexes not used yet, whose statistics started less than 24 hours ago (a new index or a server restart): too early to call them unused.',
    );
  });
});
