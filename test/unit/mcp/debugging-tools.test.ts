import { describe, expect, it } from 'vitest';
import type { MongoRequest } from '../../../src/shared/engine-request';
import { spanText } from '../../../src/features/mcp/tool/changes';
import { keptKeyLine, type UndoEntry } from '../../../src/features/mcp/tool/undo-writes';
import { historyFilter, isSystemWrite } from '../../../src/features/mcp/debugging-tools';
import {
  answerOf,
  cache,
  date,
  drive,
  failed,
  failureOf,
  hello,
  local,
  mcpState,
  nameOf,
  prod,
  timestamp,
} from './harness';

const at = Date.parse('2026-01-01T00:00:00Z');

function deployment(kind: 'primary' | 'standalone' | 'mongos', version = '8.0.4') {
  return (request: MongoRequest): unknown => {
    const name = nameOf(request);
    if (name === 'runCommand:hello') {
      return hello(kind);
    }
    return name === 'runCommand:buildInfo' ? { version, ok: 1 } : undefined;
  };
}

function withDeployment(
  kind: 'primary' | 'standalone' | 'mongos',
  rest: (request: MongoRequest) => unknown,
  version?: string,
) {
  return (request: MongoRequest): unknown =>
    deployment(kind, version)(request) ?? rest(request) ?? failed(`unexpected ${nameOf(request)}`);
}

const event = (n: number) => ({
  _id: { _data: `82${String(n)}` },
  operationType: 'insert',
  clusterTime: timestamp(1_767_225_600 + n),
  wallTime: date(at + n * 1000),
  ns: { db: 'shop', coll: 'orders' },
  documentKey: { _id: n },
  fullDocument: { _id: n, total: n },
});

const shopOrders = { connection: 'Local', database: 'shop', collection: 'orders' };
const listed = (request: MongoRequest): unknown =>
  request.method === 'listCollections' ? [{ name: 'orders', type: 'collection', options: {} }] : undefined;

describe('mcp.debugging-tools', () => {
  it('watches the changes, says how long it waited, and ends with the resume token', () => {
    const driven = drive(
      'watch_changes',
      { ...shopOrders, waitSeconds: 4 },
      {
        mongo: withDeployment(
          'primary',
          (request) =>
            listed(request) ??
            (request.method === 'watch'
              ? { events: [event(1), event(2), event(3)], resumeToken: { _data: '82ff' } }
              : undefined),
        ),
      },
    );
    const text = answerOf(driven);
    expect(text.split('\n')[0]).toBe('Changes of shop.orders: 3 events, waited 4 s.');
    expect(text).toContain('Resume token: 82ff\n(pass it as resumeAfter to get the changes after these)');
    const watch = driven.sent.map((each) => each.request as MongoRequest).find((each) => each.method === 'watch');
    expect(watch?.timeLimitMs).toBe(4000);
    expect(watch?.arguments[1]).toMatchObject({
      fullDocument: 'updateLookup',
      fullDocumentBeforeChange: 'whenAvailable',
    });
  });

  it('stops at maxEvents, and continues after the resume token', () => {
    const driven = drive(
      'watch_changes',
      { ...shopOrders, maxEvents: 2, resumeAfter: '82aa' },
      {
        mongo: withDeployment(
          'primary',
          (request) =>
            listed(request) ??
            (request.method === 'watch' ? { events: [event(1), event(2)], resumeToken: { _data: '82bb' } } : undefined),
        ),
      },
    );
    const text = answerOf(driven);
    expect(text.split('\n')[0]).toBe(
      'Changes of shop.orders after the resume token: 2 events, stopped at maxEvents (2): more changes may be waiting, call again with resumeAfter.',
    );
    const watch = driven.sent.map((each) => each.request as MongoRequest).find((each) => each.method === 'watch');
    expect(watch?.arguments[1]).toMatchObject({ resumeAfter: { _data: '82aa' } });
  });

  it('says an invalidated stream', () => {
    const text = answerOf(
      drive('watch_changes', shopOrders, {
        mongo: withDeployment(
          'primary',
          (request) =>
            listed(request) ??
            (request.method === 'watch'
              ? { events: [event(1), { _id: { _data: '83' }, operationType: 'invalidate' }], resumeToken: null }
              : undefined),
        ),
      }),
    );
    expect(text).toContain('the stream was invalidated');
    expect(text).not.toContain('Resume token');
  });

  it('refuses a standalone server, both starting points, and expanded events before 6.0', () => {
    expect(
      failureOf(drive('watch_changes', shopOrders, { mongo: withDeployment('standalone', () => undefined) })),
    ).toMatch(/^Change streams need a replica set or a sharded cluster: Local is a standalone server\./u);
    expect(failureOf(drive('watch_changes', { ...shopOrders, resumeAfter: '82aa', since: '5m' }))).toBe(
      'Use resumeAfter or since, not both.',
    );
    expect(
      failureOf(
        drive(
          'watch_changes',
          { ...shopOrders, operationTypes: ['createIndexes'] },
          { mongo: withDeployment('primary', () => undefined, '5.0.9') },
        ),
      ),
    ).toBe('createIndexes events need MongoDB 6.0 or later.');
  });

  it("gives the server's refusals as their sentences", () => {
    const refusing = (reply: unknown, args: Record<string, unknown> = {}) =>
      failureOf(
        drive(
          'watch_changes',
          { ...shopOrders, ...args },
          {
            mongo: withDeployment(
              'primary',
              (request) => listed(request) ?? (request.method === 'watch' ? reply : undefined),
            ),
          },
        ),
      );
    expect(refusing(failed('Resume of change stream was not possible', 286), { resumeAfter: '82aa' })).toMatch(
      /^The resume token is older than the oplog: /u,
    );
    expect(refusing(failed('Invalid resume token', 9), { resumeAfter: '82aa' })).toMatch(/^Invalid resume token: /u);
    expect(refusing(failed('not authorized on shop', 13))).toMatch(
      /^Not authorized to open a change stream on Local: /u,
    );
  });

  it('lists the writes of the oplog, a transaction under one heading, and the window', () => {
    const entries = [
      {
        op: 'c',
        ns: 'admin.$cmd',
        ts: timestamp(1_767_225_900),
        wall: date(at + 300_000),
        lsid: { id: { $binary: { base64: 'AAAAAAAAAAAAAAAAAAAAAA==', subType: '04' } } },
        txnNumber: long1(),
        o: { applyOps: [{ op: 'u', ns: 'shop.orders', o: { $set: { status: 'paid' } }, o2: { _id: 'w1' } }] },
      },
      {
        op: 'u',
        ns: 'shop.orders',
        ts: timestamp(1_767_225_700),
        wall: date(at + 100_000),
        o: { diff: { u: { total: 12 } } },
        o2: { _id: 'w1' },
      },
      { op: 'i', ns: 'shop.orders', ts: timestamp(1_767_225_600), wall: date(at), o: { _id: 'w1', total: 10 } },
    ];
    const driven = drive(
      'write_history',
      { ...shopOrders, id: '"w1"', since: '2025-12-31T00:00:00Z' },
      {
        mongo: withDeployment('primary', (request) => {
          if (request.method !== 'find') {
            return undefined;
          }
          const options = request.arguments[1] as { sort: { $natural: number }; projection?: unknown };
          if (options.projection === undefined) {
            return entries;
          }
          return options.sort.$natural === 1
            ? [{ ts: timestamp(1_767_214_080), wall: date(at - 11_520_000) }]
            : [{ ts: timestamp(1_767_225_600), wall: date(at) }];
        }),
      },
    );
    const text = answerOf(driven);
    expect(text.split('\n')[0]).toBe(
      'Writes to shop.orders (_id "w1", since 2025-12-31T00:00:00.000Z), newest first: 3 operations.',
    );
    expect(text).toContain('transaction, lsid UUID("00000000-0000-0000-0000-000000000000"), txnNumber');
    expect(text).toContain('Oplog window: 2025-12-31T20:48:00.000Z → 2026-01-01T00:00:00.000Z (3.2 h).');
    expect(driven.sent.every((each) => ['runCommand', 'find'].includes((each.request as MongoRequest).method))).toBe(
      true,
    );
  });

  it('never shows a write to a system.* collection, nor counts it', () => {
    expect(isSystemWrite({ op: 'i', ns: 'admin.system.users', o: { _id: 'shop.ada', user: 'ada' } })).toBe(true);
    expect(isSystemWrite({ op: 'c', ns: 'shop.$cmd', o: { drop: 'system.profile' } })).toBe(true);
    expect(isSystemWrite({ op: 'c', ns: 'shop.$cmd', o: { create: 'orders' } })).toBe(false);
    expect(isSystemWrite({ op: 'i', ns: 'shop.orders', o: { _id: 1 } })).toBe(false);
    const filter = JSON.stringify(historyFilter({ operations: [], limit: 20 }));
    expect(filter).toContain('"ns":{"$not":{"$regularExpression":{"pattern":"^[^.]*\\\\.system\\\\.","options":""}}}');
    const entries = [
      {
        op: 'i',
        ns: 'admin.system.users',
        ts: timestamp(1_767_225_900),
        wall: date(at + 300_000),
        o: { _id: 'shop.ada', user: 'ada', credentials: { 'SCRAM-SHA-256': { storedKey: 'secret-key' } } },
      },
      {
        op: 'c',
        ns: 'admin.$cmd',
        ts: timestamp(1_767_225_800),
        wall: date(at + 200_000),
        o: { applyOps: [{ op: 'i', ns: 'admin.system.users', o: { _id: 'shop.bob', user: 'bob' } }] },
      },
      { op: 'i', ns: 'shop.orders', ts: timestamp(1_767_225_600), wall: date(at), o: { _id: 'w1', total: 10 } },
    ];
    const text = answerOf(
      drive(
        'write_history',
        { connection: 'Local' },
        {
          mongo: withDeployment('primary', (request) => {
            if (request.method !== 'find') {
              return undefined;
            }
            const options = request.arguments[1] as { projection?: unknown };
            return options.projection === undefined ? entries : [{ ts: timestamp(1_767_225_600), wall: date(at) }];
          }),
        },
      ),
    );
    expect(text.split('\n')[0]).toMatch(/newest first: 1 operation\.$/u);
    for (const hidden of ['system.users', 'ada', 'bob', 'secret-key', 'transaction']) {
      expect(text).not.toContain(hidden);
    }
  });

  it('refuses the oplog of a mongos, a standalone server, without the role, and times out', () => {
    const history = (kind: 'primary' | 'standalone' | 'mongos', find: unknown = []) =>
      failureOf(
        drive(
          'write_history',
          { connection: 'Local' },
          { mongo: withDeployment(kind, (request) => (request.method === 'find' ? find : undefined)) },
        ),
      );
    expect(history('mongos')).toMatch(/^Local is a sharded cluster \(mongos\): the oplog is on each shard\. /u);
    expect(history('standalone')).toMatch(/^The oplog exists only on replica sets: Local is a standalone server\. /u);
    expect(history('primary', failed('not authorized on local', 13))).toMatch(
      /^Not authorized to read the oplog of Local: /u,
    );
    expect(history('primary', failed('operation exceeded time limit', 50))).toMatch(
      /^Reading the oplog took more than 30 s without finding a match: /u,
    );
    expect(failureOf(drive('write_history', { connection: 'Local', since: '1h', until: '2h' }))).toBe(
      'since is after until.',
    );
  });

  it('writes a span of the oplog window', () => {
    expect(spanText(0, 11_520_000)).toBe('3.2 h');
    expect(spanText(0, 45_000)).toBe('45 s');
  });

  const entries: readonly UndoEntry[] = [
    {
      id: 'u1',
      at,
      connection: local.id,
      connectionName: 'Local',
      database: 'shop',
      collection: 'orders',
      title: 'Update documents',
      updated: 3,
    },
    {
      id: 'u2',
      at: at + 1000,
      connection: cache.id,
      connectionName: 'Cache local',
      redisDatabase: 0,
      title: 'Delete keys',
      keys: 2,
      undoneAt: at + 5000,
    },
    {
      id: 'u3',
      at: at + 2000,
      connection: local.id,
      connectionName: 'Local',
      database: 'shop',
      collection: 'orders',
      title: 'Delete document ObjectId("65f1…a2c")',
      deleted: 1,
      undoOf: 'u0',
    },
  ];
  const history = { app: () => ({ total: entries.length, entries }) };

  it("lists Datardo's writes, newest first, with the limits of the history", () => {
    const text = answerOf(drive('datardo_writes', {}, history, mcpState({ connections: [local, cache, prod] })));
    expect(text).toContain('- id u1 · 2026-01-01T00:00:00Z · Local › shop.orders · Update documents · 3 updated');
    expect(text).toContain(
      '- id u2 · 2026-01-01T00:00:01Z · Cache local › db0 · Delete keys · 2 keys · undone 2026-01-01T00:00:05Z',
    );
    expect(text).toContain('undo of u0');
    expect(text.indexOf('id u3')).toBeLessThan(text.indexOf('id u1'));
    expect(text).toContain(
      "The history keeps up to 200 writes from the last 7 days, of up to 10,000 documents each: older or larger writes aren't listed.",
    );
    expect(text).toContain("Writes aren't recorded for: Prod (read-only).");
  });

  it('says the history is off, refuses collection on Redis, and hides the values of titles without readData', () => {
    const off = answerOf(
      drive('datardo_writes', {}, history, mcpState({ settings: { 'datardo.undo.enabled': false } })),
    );
    expect(off).toContain("The undo history is off (setting datardo.undo.enabled): new writes aren't recorded.");
    expect(
      failureOf(
        drive('datardo_writes', { connection: 'Cache local', database: 'shop', collection: 'orders' }, history),
      ),
    ).toBe('collection is for MongoDB connections.');
    const hidden = answerOf(
      drive('datardo_writes', {}, history, mcpState({ settings: { 'datardo.mcp.readData': false } })),
    );
    expect(hidden).toContain('· Delete document · 1 deleted');
    expect(hidden).not.toContain('65f1');
  });

  it('refuses an unknown write and an undone one, and lists the keys without their values', () => {
    expect(failureOf(drive('datardo_write_details', { id: 'nope' }, history))).toBe(
      "No write nope in the undo history: use datardo_writes (it may have been removed by the history's limits).",
    );
    expect(failureOf(drive('datardo_write_details', { id: 'u2' }, history))).toBe(
      'The write u2 was undone on 2026-01-01T00:00:05Z: its documents are no longer kept.',
    );
    expect(keptKeyLine({ key: 'orders:42', existed: true, type: 'hash', bytes: 1229, ttlMs: 3_540_000 })).toBe(
      '- orders:42 · hash · 1.2 KB · expires in 59 m',
    );
    expect(keptKeyLine({ key: 'orders:43', existed: true, type: 'string', bytes: 10 })).toContain('persistent');
    expect(keptKeyLine({ key: 'cart:7', existed: false })).toBe('- cart:7 · did not exist');
    const keys = [
      {
        id: 'k1',
        at,
        connection: cache.id,
        connectionName: 'Cache local',
        redisDatabase: 0,
        title: 'Set key',
        keys: 1,
      },
    ];
    const driven = drive(
      'datardo_write_details',
      { id: 'k1' },
      {
        app: (action) =>
          action === 'mcp.undo-history'
            ? { total: 1, entries: keys }
            : {
                total: 1,
                keys: [{ key: 'orders:42', existed: true, type: 'hash', bytes: 1229, value: 'secret-value' }],
              },
      },
    );
    const text = answerOf(driven);
    expect(text).toContain('- orders:42 · hash · 1.2 KB · persistent');
    expect(text).not.toContain('secret-value');
    expect(driven.apps.map((each) => each.action)).toEqual(['mcp.undo-history', 'mcp.undo-write']);
  });
});

function long1(): unknown {
  return { $numberLong: '1' };
}
