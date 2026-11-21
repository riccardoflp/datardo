/**
 * The tools of the MCP server called by an MCP client over HTTP against the test MongoDB and Redis (M29): every tool
 * offered runs and writes nothing (the documents, the collections, the keys and the profiler level are the same
 * after), `$out` and `$merge` are refused, a `$lookup` with `$merge` inside is refused by the server with nothing
 * written, `datardo.mcp.readData` hides the seven tools and every value at the next request, no answer holds a
 * connection's password or the access token, and a tool connects a saved connection or opens a tab for the user. The
 * keys are `m29:*` in database 11 of the shared Redis, the documents in the database `m29shop`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { builtTools, waitingTools } from '../../../src/features/mcp';
import { hiddenWithoutReadData } from '../../../src/features/mcp/read-data';
import { isReadingRequest } from '../../../src/features/mcp/tool/read-only';
import { tokenKey } from '../../../src/main/mcp/host';
import type { Json } from '../../../src/shared/engine-request';
import { liveMcp, lockedPassword, prodId, redisDatabase, shopDatabase, type LiveMcp } from './live';

const decoder = new TextDecoder();
let live: LiveMcp;

/** Values that only reading the data could give: none may be returned with `datardo.mcp.readData` off. */
const values = ['ada@example.com', 'bob@example.com', 'hello-m29-value', 'secret-hash-value'];

const orders: Json[] = [
  { _id: 1, status: 'active', total: { $numberInt: '10' }, email: 'ada@example.com' },
  { _id: 2, status: 'active', total: { $numberInt: '20' }, email: 'bob@example.com' },
  { _id: 3, status: 'done', total: { $numberInt: '30' }, email: 'cy@example.com', customer: 7 },
];

async function onShop(method: string, args: Json[], collection?: string): Promise<unknown> {
  return live.mongo(shopDatabase, method, args, collection);
}

async function ourKeys(): Promise<string[]> {
  const found: string[] = [];
  let cursor = '0';
  do {
    const [next, keys] = (await live.redis('SCAN', cursor, 'MATCH', 'm29:*', 'COUNT', '1000')) as [
      Uint8Array,
      Uint8Array[],
    ];
    found.push(...keys.map((key) => decoder.decode(key)));
    cursor = decoder.decode(next);
  } while (cursor !== '0');
  return found.sort();
}

async function unlinkOurs(): Promise<void> {
  const keys = await ourKeys();
  if (keys.length > 0) {
    await live.redis('UNLINK', ...keys);
  }
}

/** What is stored: every document of m29shop, its collections, and our keys with their values. */
async function snapshot(): Promise<string> {
  const collections = await onShop('runCommand', [{ listCollections: 1, nameOnly: true }]);
  const documents = await onShop('find', [{}], 'orders');
  const keys = await ourKeys();
  const dumped = await Promise.all(keys.map(async (key) => [key, await live.redis('DUMP', key)]));
  // The cluster's time moves whenever another test file writes to the replica set: it says nothing of this data.
  const unclocked = (key: string, value: unknown): unknown =>
    key === '$clusterTime' || key === 'operationTime' ? undefined : value;
  return JSON.stringify({ collections, documents, dumped }, (key, value: unknown) =>
    value instanceof Uint8Array ? Buffer.from(value).toString('hex') : unclocked(key, value),
  );
}

async function profileLevel(): Promise<unknown> {
  const reply = (await onShop('runCommand', [{ profile: -1 }])) as Record<string, unknown>;
  return reply['was'];
}

function setReadData(value: boolean): void {
  live.dispatch({ slice: 'settings', type: 'changed', name: 'datardo.mcp.readData', value });
}

/** Arguments that make a tool run on the test data. */
function argumentsOf(tool: (typeof builtTools)[number]): Record<string, Json> {
  const redis = tool.name.startsWith('redis_') && tool.name !== 'redis_oplog_status';
  const known: Record<string, Json> = {
    connection: redis ? 'Cache local' : 'Local',
    database: redis ? redisDatabase : shopDatabase,
    collection: 'orders',
    pipeline: '[ { $match: { status: "active" } } ]',
    field: 'status',
    key: 'm29:greeting',
    id: 'none',
    pattern: 'm29:*',
    waitSeconds: 0,
  };
  const required = new Set(tool.inputSchema.required ?? []);
  const properties = Object.keys(tool.inputSchema.properties).filter((name) => name !== 'id' || required.has(name));
  return Object.fromEntries(
    properties.filter((name) => name in known).map((name) => [name, known[name] ?? null] as const),
  );
}

beforeAll(async () => {
  live = await liveMcp();
});

afterAll(async () => {
  await onShop('dropDatabase', []).catch(() => undefined);
  await unlinkOurs().catch(() => undefined);
  await live.close();
});

beforeEach(async () => {
  setReadData(true);
  await onShop('dropDatabase', []);
  await onShop('insertMany', [orders], 'orders');
  await onShop('createIndex', [{ status: 1 }], 'orders');
  await unlinkOurs();
  await live.redis('SET', 'm29:greeting', 'hello-m29-value');
  await live.redis('HSET', 'm29:orders:42', 'email', 'ada@example.com', 'hash', 'secret-hash-value');
  await live.redis('RPUSH', 'm29:list', 'a', 'b');
});

describe('mcp.protocol', () => {
  it('initializes and lists the tools offered, not those of features still to be built', async () => {
    const init = await live.rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    expect(init['result']).toMatchObject({
      serverInfo: { name: 'datardo' },
      capabilities: { tools: { listChanged: false } },
    });
    const listed = (await live.rpc('tools/list'))['result'] as { tools: { name: string }[] };
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual(builtTools.map((tool) => tool.name).sort());
    for (const name of waitingTools.keys()) {
      const call = await live.rpc('tools/call', { name, arguments: { connection: 'Local' } });
      expect(call['error']).toMatchObject({ code: -32602, message: `Unknown tool: ${name}` });
    }
  });
});

describe('mcp.data-tools', () => {
  it('lists the connections, the databases and the collections, and reads documents', async () => {
    const connections = await live.tool('list_connections');
    expect(connections.text).toContain('Local');
    expect(connections.text).toContain('Cache local');
    expect((await live.tool('list_databases', { connection: 'Local' })).text).toContain(shopDatabase);
    expect((await live.tool('list_collections', { connection: 'Local', database: shopDatabase })).text).toContain(
      'orders',
    );
    const found = await live.tool('find_documents', {
      connection: 'Local',
      database: shopDatabase,
      collection: 'orders',
      filter: '{ status: "active" }',
    });
    expect(found.isError).toBe(false);
    expect(found.text).toContain('ada@example.com');
    expect(found.text).not.toContain('cy@example.com');
  });

  it('connects a saved connection that is not connected, read-only included, without asking', async () => {
    expect(live.state().connections.live[prodId]).toBeUndefined();
    const reply = await live.tool('list_databases', { connection: 'Prod' });
    expect(reply.isError).toBe(false);
    expect(reply.text).toContain(shopDatabase);
    expect(live.state().connections.live[prodId]?.state).toBe('connected');
  });
});

describe('mcp.refuse-write-stages', () => {
  it('refuses $out and $merge, spaced or not, and sends nothing', async () => {
    const before = live.sent.length;
    for (const pipeline of [
      '[ { $match: {} }, { $out: "copy" } ]',
      '[ { $merge: { into: "copy" } } ]',
      '[ { " $out ": "copy" } ]',
    ]) {
      for (const tool of ['aggregate', 'explain_query', 'open_aggregation']) {
        const reply = await live.tool(tool, {
          connection: 'Local',
          database: shopDatabase,
          collection: 'orders',
          pipeline,
        });
        expect(reply.isError, `${tool} ${pipeline}`).toBe(true);
      }
    }
    expect(live.sent.slice(before).filter((each) => each.request.engine === 'mongodb')).toEqual([]);
    expect(live.opened).toEqual([]);
    const names = JSON.stringify(await onShop('runCommand', [{ listCollections: 1, nameOnly: true }]));
    expect(names).not.toContain('copy');
  });

  it('a $merge inside a $lookup is refused by the server, with its message and nothing written', async () => {
    const reply = await live.tool('aggregate', {
      connection: 'Local',
      database: shopDatabase,
      collection: 'orders',
      pipeline: '[ { $lookup: { from: "orders", pipeline: [ { $merge: { into: "copy" } } ], as: "x" } } ]',
    });
    expect(reply.isError).toBe(true);
    expect(reply.text).toMatch(/\$merge/u);
    const names = JSON.stringify(await onShop('runCommand', [{ listCollections: 1, nameOnly: true }]));
    expect(names).not.toContain('copy');
  });
});

describe('mcp.read-data', () => {
  it('with the setting off hides the seven tools and every value, and on again offers them at the next request', async () => {
    setReadData(false);
    const listed = (await live.rpc('tools/list'))['result'] as { tools: { name: string }[] };
    const names = listed.tools.map((tool) => tool.name);
    for (const hidden of hiddenWithoutReadData) {
      expect(names).not.toContain(hidden);
      const call = await live.rpc('tools/call', {
        name: hidden,
        arguments: { connection: 'Local', database: shopDatabase, collection: 'orders' },
      });
      expect(call['error']).toMatchObject({ code: -32602, message: `Unknown tool: ${hidden}` });
    }
    expect(names).toHaveLength(builtTools.length - hiddenWithoutReadData.length);
    const counted = await live.tool('count_documents', {
      connection: 'Local',
      database: shopDatabase,
      collection: 'orders',
      filter: '{ status: "active" }',
    });
    expect(counted.text).toContain('2 documents match { status: "active" }');
    const start = live.answered.length;
    for (const tool of builtTools.filter((each) => !hiddenWithoutReadData.includes(each.name))) {
      await live.tool(tool.name, argumentsOf(tool));
    }
    const answers = live.answered.slice(start).join('\n');
    for (const value of values) {
      expect(answers).not.toContain(value);
    }
    expect(answers).toContain('m29:orders:42');
    setReadData(true);
    const read = await live.tool('redis_read_value', {
      connection: 'Cache local',
      database: redisDatabase,
      key: 'm29:greeting',
    });
    expect(read.isError).toBe(false);
    expect(read.text).toContain('hello-m29-value');
  });
});

describe('mcp.server', () => {
  it('every tool offered runs and writes nothing: the data and the profiler level are the same after', async () => {
    const before = await snapshot();
    const level = await profileLevel();
    const sent = live.sent.length;
    for (const tool of builtTools) {
      const reply = await live.tool(tool.name, argumentsOf(tool));
      expect(reply.isError, `${tool.name}: ${reply.text}`).toBe(tool.name === 'datardo_write_details');
    }
    expect(await snapshot()).toBe(before);
    expect(await profileLevel()).toEqual(level);
    for (const asked of live.sent.slice(sent)) {
      expect(isReadingRequest(asked), JSON.stringify(asked.request)).toBe(true);
    }
  });

  it('no answer holds the password of a connection or the access token', async () => {
    const failed = await live.tool('list_databases', { connection: 'Locked' });
    expect(failed.isError).toBe(true);
    await live.tool('list_connections');
    await live.tool('server_status', { connection: 'Locked' });
    const everything = [...live.answered, JSON.stringify(live.state())].join('\n');
    expect(everything).not.toContain(lockedPassword);
    expect(everything).not.toContain(live.secrets.get(tokenKey) ?? 'no token');
  });
});

describe('mcp.tab-tools', () => {
  it('opens a query tab for the user, never a console, and says so to the AI', async () => {
    live.opened.length = 0;
    const reply = await live.tool('open_query', {
      connection: 'Local',
      database: shopDatabase,
      collection: 'orders',
      filter: '{ status: "active" }',
    });
    expect(reply.isError).toBe(false);
    expect(live.opened).toHaveLength(1);
    expect(JSON.stringify(live.opened[0])).toContain('orders');
  });
});

describe('mcp.performance-tools', () => {
  it('index_advice reads the indexes and the slow operations of a database through the advisor, and writes nothing', async () => {
    const sent = live.sent.length;
    const reply = await live.tool('index_advice', { connection: 'Local', database: shopDatabase });
    expect(reply.isError, reply.text).toBe(false);
    expect(reply.text).toContain(`Index advice for ${shopDatabase}: 1 collection, 2 indexes`);
    const asked = live.sent.slice(sent);
    expect(asked.length).toBeGreaterThan(0);
    for (const each of asked) {
      expect(isReadingRequest(each), JSON.stringify(each.request)).toBe(true);
    }
  });

  it('open_monitor opens the Monitor page of the connection on a section', async () => {
    live.opened.length = 0;
    const reply = await live.tool('open_monitor', { connection: 'Local', section: 'slow-queries' });
    expect(reply.isError, reply.text).toBe(false);
    expect(live.opened).toHaveLength(1);
    expect(live.opened[0]).toMatchObject({
      args: { shows: { kind: 'page', page: 'monitor' }, section: 'slow-queries' },
    });
  });
});

describe('mcp.redis-key-tools', () => {
  it('scans the keys of database 11 and gives the details of one, leaving the database of the tabs alone', async () => {
    const scanned = await live.tool('redis_scan_keys', {
      connection: 'Cache local',
      database: redisDatabase,
      pattern: 'm29:*',
    });
    expect(scanned.text).toContain('m29:greeting');
    expect(scanned.text).toContain('m29:orders:42');
    const details = await live.tool('redis_key_details', {
      connection: 'Cache local',
      database: redisDatabase,
      key: 'm29:orders:42',
    });
    expect(details.text).toMatch(/hash/iu);
  });
});
