import { describe, expect, it } from 'vitest';
import type { Json, MongoRequest } from '../../../src/shared/engine-request';
import { allTools } from '../../../src/features/mcp';
import { answerOf, bytes, drive, failed, failureOf, hello, mcpState, nameOf, prod } from './harness';

const shopOrders = { connection: 'Local', database: 'shop', collection: 'orders' };
const pipeline = '[ { $match: { status: "paid" } }, { $group: { _id: "$city", n: { $sum: 1 } } } ]';

function mongo(kind: 'primary' | 'standalone' = 'primary') {
  return (request: MongoRequest): unknown => {
    if (request.method === 'listCollections') {
      const name = (request.arguments[0] as { name?: string }).name;
      return name === 'orders' ? [{ name: 'orders', type: 'collection', options: {} }] : [];
    }
    return nameOf(request) === 'runCommand:hello' ? hello(kind) : failed(`unexpected ${nameOf(request)}`);
  };
}

const opened = { app: () => ({ hidden: false }) };

function intentOf(driven: ReturnType<typeof drive>): Readonly<Record<string, Json>> {
  const open = driven.apps.find((each) => each.action === 'mcp.open-tab');
  return (open?.args as { intent?: Readonly<Record<string, Json>> } | undefined)?.intent ?? {};
}

describe('mcp.tab-tools', () => {
  it('opens a query, and says what it opened', () => {
    const driven = drive(
      'open_query',
      { ...shopOrders, filter: '{ a: 1 }', sort: '{ b: -1 }' },
      { mongo: mongo(), ...opened },
    );
    expect(answerOf(driven)).toBe('Opened shop.orders on Local with the filter { a: 1 }, sort { b: -1 }.');
    const intent = intentOf(driven);
    expect(intent['feature']).toBe('tab.open');
    expect(intent['args']).toMatchObject({
      shows: { kind: 'collection', database: 'shop', collection: 'orders' },
      background: false,
    });
  });

  it('opens an aggregation with its stages', () => {
    expect(answerOf(drive('open_aggregation', { ...shopOrders, pipeline }, { mongo: mongo(), ...opened }))).toBe(
      'Opened shop.orders on Local in Aggregate mode with 2 stages: $match, $group.',
    );
  });

  it('refuses a collection that does not exist, and $out, before anything opens', () => {
    const missing = drive('open_query', { ...shopOrders, collection: 'nope' }, { mongo: mongo(), ...opened });
    expect(failureOf(missing)).toContain('nope');
    expect(missing.apps).toEqual([]);
    const out = drive(
      'open_aggregation',
      { ...shopOrders, pipeline: '[ { $out: "x" } ]' },
      { mongo: mongo(), ...opened },
    );
    expect(failureOf(out)).toBe("$out writes to the database: Datardo's MCP server only reads.");
    expect(out.apps).toEqual([]);
  });

  it('opens an explain of a pipeline, and refuses a pipeline with a filter', () => {
    expect(answerOf(drive('open_explain', { ...shopOrders, pipeline }, { mongo: mongo(), ...opened }))).toBe(
      'Opened shop.orders on Local in Aggregate mode with 2 stages ($match, $group) and its explain plan.',
    );
    expect(
      answerOf(
        drive('open_explain', { ...shopOrders, filter: '{ a: 1 }', sort: '{ b: -1 }' }, { mongo: mongo(), ...opened }),
      ),
    ).toBe('Opened shop.orders on Local with the filter { a: 1 }, sort { b: -1 } and its explain plan.');
    expect(failureOf(drive('open_explain', { ...shopOrders, pipeline, filter: '{ a: 1 }' }))).toBe(
      'Give either filter/sort/projection or pipeline, not both.',
    );
  });

  it('opens a search, and refuses a collection without database, a bad regex and a limit not in the list', () => {
    expect(answerOf(drive('open_search', { connection: 'Local', text: 'ada' }, opened))).toBe(
      'Opened the search for "ada" in every database on Local. The results appear in Datardo\'s Search documents page.',
    );
    expect(failureOf(drive('open_search', { connection: 'Local', text: 'ada', collection: 'orders' }))).toBe(
      'collection needs database.',
    );
    expect(failureOf(drive('open_search', { connection: 'Local', text: '(', regex: true }))).toMatch(
      /^Invalid regular expression: /u,
    );
    expect(failureOf(drive('open_search', { connection: 'Local', text: 'ada', limit: 5 }))).toBe(
      'limit must be one of 0, 1000, 10000, 100000.',
    );
  });

  it('opens the Watch changes page, also on a standalone server', () => {
    expect(answerOf(drive('open_watch', shopOrders, { mongo: mongo(), ...opened }))).toBe(
      'Opened the Watch changes page on shop.orders of Local.',
    );
    expect(answerOf(drive('open_watch', shopOrders, { mongo: mongo('standalone'), ...opened }))).toBe(
      'Opened the Watch changes page on shop.orders of Local. The server is a standalone: change streams need a replica set or a sharded cluster, so the page shows an error.',
    );
  });

  it('opens the Monitor page on a section, and refuses an unknown one', () => {
    const state = mcpState({ connections: [prod] });
    expect(answerOf(drive('open_monitor', { connection: 'Prod', section: 'slow-queries' }, opened, state))).toBe(
      'Opened the Monitor page of Prod on slow-queries.',
    );
    expect(failureOf(drive('open_monitor', { connection: 'Prod', section: 'locks' }, opened, state))).toBe(
      'section must be one of operations, slow-queries, stats, replication, sharding.',
    );
  });

  it('opens the Undo history page', () => {
    const driven = drive(
      'open_history',
      {},
      {
        app: (action) => (action === 'mcp.undo-history' ? { total: 1, entries: [] } : { hidden: false }),
      },
      mcpState({ settings: { 'datardo.undo.enabled': false } }),
    );
    expect(answerOf(driven)).toBe(
      'Opened the Undo history page (1 write recorded; the history is off, new writes are not recorded).',
    );
  });

  it('opens the keys tab, which scans by itself, and returns no key', () => {
    const driven = drive('redis_open_keys', { connection: 'Cache local', pattern: 'orders:*', type: 'hash' }, opened);
    expect(answerOf(driven)).toBe('Opened the keys of db0 on Cache local with the pattern orders:* (type hash).');
    expect(driven.sent).toEqual([]);
    expect(intentOf(driven)['args']).toMatchObject({
      shows: { kind: 'keys', database: 0 },
      memory: { pattern: 'orders:*', typeFilter: 'hash' },
    });
  });

  it('opens a key that exists, and refuses one that does not, opening nothing', () => {
    const driven = drive(
      'redis_open_key',
      { connection: 'Cache local', key: 'orders:42' },
      { redis: () => bytes('hash'), ...opened },
    );
    expect(answerOf(driven)).toBe('Opened the key orders:42 of db0 on Cache local.');
    const none = drive(
      'redis_open_key',
      { connection: 'Cache local', key: 'orders:42' },
      { redis: () => bytes('none'), ...opened },
    );
    expect(failureOf(none)).toBe("The key orders:42 doesn't exist in db0 of Cache local: use redis_scan_keys.");
    expect(none.apps).toEqual([]);
  });

  it('opens the Server page on its six sections, and refuses any other', () => {
    for (const section of ['overview', 'clients', 'slow-log', 'memory', 'replication', 'configuration']) {
      expect(answerOf(drive('redis_open_server', { connection: 'Cache local', section }, opened))).toBe(
        `Opened the Server page of Cache local on ${section}.`,
      );
    }
    expect(failureOf(drive('redis_open_server', { connection: 'Cache local', section: 'keys' }, opened))).toBe(
      'section must be one of overview, clients, slow-log, memory, replication, configuration.',
    );
  });

  it("says when Datardo's window is hidden in the tray", () => {
    expect(answerOf(drive('redis_open_server', { connection: 'Cache local' }, { app: () => ({ hidden: true }) }))).toBe(
      "Opened the Server page of Cache local. Datardo's window is hidden in the tray: the user sees the tab when they open it.",
    );
  });

  it('has no tool that opens a console or a playground', () => {
    const names = allTools.map((tool) => tool.name);
    expect(names.some((name) => /console|playground|shell|eval/u.test(name))).toBe(false);
  });
});
