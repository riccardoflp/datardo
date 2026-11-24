import { describe, expect, it } from 'vitest';
import type { MongoRequest } from '../../../src/shared/engine-request';
import type { ShardingReply } from '../../../src/features/mcp/tool/sharding';
import { shardingReply } from '../../../src/features/mcp/tool/sharding-reply';
import { clusterOf } from '../../../src/features/monitor/read-sharding';
import { parse as eventsOf } from '../../../src/features/monitor/read-sharding-events';
import { now } from '../monitor/context';
import { changelog, clusterReplies } from '../monitor/sharding-replies';
import { answerOf, drive, failed, failureOf, hello, mcpState, nameOf } from './harness';

type Kind = 'primary' | 'standalone' | 'mongos';

function server(kind: Kind, rest: (request: MongoRequest) => unknown = () => undefined) {
  return (request: MongoRequest): unknown => {
    const name = nameOf(request);
    if (name === 'runCommand:hello') {
      return hello(kind);
    }
    if (name === 'runCommand:buildInfo') {
      return { version: '8.0.4', ok: 1 };
    }
    return rest(request) ?? failed(`unexpected ${name}`);
  };
}

const writes = [
  'insert',
  'update',
  'delete',
  'findAndModify',
  'replSetStepDown',
  'balancerStart',
  'balancerStop',
  'setParameter',
];

function wroteNothing(sent: readonly { request: unknown }[]): void {
  for (const each of sent) {
    const request = each.request as MongoRequest;
    expect(writes.some((word) => nameOf(request).endsWith(word))).toBe(false);
    expect(request.method).not.toMatch(/^(insert|update|delete|replace|drop|create)/u);
  }
}

describe('mcp.deployment-tools', () => {
  it('says the topology of a standalone server and of a primary', () => {
    const standalone = drive(
      'server_status',
      { connection: 'Local' },
      { mongo: server('standalone', () => ({ ok: 1 })) },
    );
    expect(answerOf(standalone)).toContain('Topology: standalone server.');
    wroteNothing(standalone.sent);
    const primary = drive('server_status', { connection: 'Local' }, { mongo: server('primary', () => ({ ok: 1 })) });
    expect(answerOf(primary)).toContain(
      'Topology: member of the replica set rs0, state PRIMARY; primary host:27017, 1 electable member.',
    );
    expect(answerOf(primary)).not.toContain('mongodb://');
  });

  it('shows what hello and buildInfo tell without the clusterMonitor role', () => {
    const text = answerOf(
      drive(
        'server_status',
        { connection: 'Local' },
        {
          mongo: server('primary', () => failed('not authorized on admin to execute command { serverStatus: 1 }', 13)),
        },
      ),
    );
    expect(text).toContain(
      'serverStatus could not be read: not authorized on admin (needs the clusterMonitor role). Only what hello and buildInfo tell is shown.',
    );
  });

  it('says a standalone server has no replica set, and points a mongos to sharding_status', () => {
    expect(answerOf(drive('replica_set_status', { connection: 'Local' }, { mongo: server('standalone') }))).toBe(
      'host:27017 is a standalone server, not a replica set member: there are no members, no replication and no oplog.',
    );
    expect(answerOf(drive('replica_set_status', { connection: 'Local' }, { mongo: server('mongos') }))).toContain(
      'use sharding_status',
    );
  });

  it('says what a server that is not a mongos is', () => {
    expect(answerOf(drive('sharding_status', { connection: 'Local' }, { mongo: server('standalone') }))).toBe(
      'host:27017 is a standalone server: it is not a sharded cluster.',
    );
    expect(answerOf(drive('sharding_status', { connection: 'Local' }, { mongo: server('primary') }))).toBe(
      'host:27017 is a replica set member, not a mongos: it is not a sharded cluster (use replica_set_status).',
    );
  });

  it('asks the monitor for the shards of a mongos, never moving the balancer', () => {
    const driven = drive(
      'sharding_status',
      { connection: 'Local' },
      {
        mongo: server('mongos'),
        app: () => {
          const reply: ShardingReply = {
            shards: [{ name: 'shard0', replSet: 'rs-a', members: ['a:27018'], zones: [], primaryOf: ['shop'] }],
            zones: [],
            collections: [],
            balancer: { enabled: true, running: false },
            errors: [],
          };
          return reply;
        },
      },
    );
    expect(driven.apps).toEqual([{ action: 'monitor.sharding', args: { connection: 'c-local', events: 20 } }]);
    expect(answerOf(driven)).toContain('Shards (1)');
    wroteNothing(driven.sent);
  });

  it("leaves out the events' details and the server's texts with datardo.mcp.readData off", () => {
    const reply: ShardingReply = {
      shards: [{ name: 'shard0', replSet: 'rs-a', members: ['a:27018'], zones: [], primaryOf: ['shop'] }],
      zones: [],
      collections: [],
      balancer: { enabled: true, running: false },
      events: [
        {
          time: '2026-01-01T00:00:00Z',
          what: 'moveChunk.commit',
          ns: 'shop.orders',
          shard: 'shard0',
          summary: 'min { customerId: "ada@example.com" }',
          failed: false,
        },
      ],
      errors: ['config.settings: not authorized on config to execute command { find: "settings" }'],
    };
    const sharding = (readData: boolean, answer: unknown) =>
      drive(
        'sharding_status',
        { connection: 'Local' },
        { mongo: server('mongos'), app: () => answer },
        mcpState({ settings: { 'datardo.mcp.readData': readData } }),
      );
    const off = answerOf(sharding(false, reply));
    expect(off).not.toContain('ada@example.com');
    expect(off).not.toContain('not authorized');
    expect(off).toContain(
      "(the events' details are left out: they quote shard key values and datardo.mcp.readData is off)",
    );
    expect(off).toContain('- config.settings');
    const on = answerOf(sharding(true, reply));
    expect(on).toContain('ada@example.com');
    expect(on).toContain('not authorized on config');
    expect(answerOf(sharding(false, { ...reply, events: undefined, eventsError: 'refused at ada' }))).not.toContain(
      'ada',
    );
    expect(
      failureOf(sharding(false, { kind: 'error', message: 'secret text', code: 13, codeName: 'Unauthorized' })),
    ).toBe('The sharded cluster could not be read: its text is left out because datardo.mcp.readData is off.');
  });

  it('answers monitor.sharding with the shards, the collections and the newest events of the cluster', () => {
    const events = eventsOf([changelog, []]);
    const reply = shardingReply(clusterOf(clusterReplies(), now), events, 2);
    expect(reply.shards.map((shard) => shard.name)).toEqual(['shard01', 'shard02']);
    expect(reply.shards[0]).toMatchObject({ replSet: 'shard01', members: ['s1a:27018', 's1b:27018'], zones: ['east'] });
    expect(reply.balancer).toMatchObject({ enabled: true, mode: 'full', running: false });
    const orders = reply.collections.find((each) => each.ns === 'shop.orders');
    expect(orders).toMatchObject({ key: '{ customerId: 1, _id: "hashed" }', balancing: true });
    expect(reply.collections.find((each) => each.ns === 'shop.users')).toMatchObject({
      unique: true,
      balancing: false,
    });
    expect(reply.events).toHaveLength(2);
    expect(reply.events?.[0]?.time).toMatch(/^\d{4}-\d\d-\d\dT/u);
    expect(shardingReply(clusterOf(clusterReplies(), now), events, 0).events).toBeUndefined();
    expect(
      shardingReply(clusterOf(clusterReplies(), now), { kind: 'failed', failure: { message: 'refused' } }, 20),
    ).toMatchObject({ eventsError: 'refused' });
  });

  it('lists the two largest of five databases with limit 2, and says three more are not listed', () => {
    const sizes: Readonly<Record<string, number>> = { a: 10, b: 50, c: 30, d: 20, e: 40 };
    const driven = drive(
      'database_stats',
      { connection: 'Local', limit: 2 },
      {
        mongo: (request) => {
          const name = nameOf(request);
          if (name === 'runCommand:listDatabases') {
            return { databases: Object.keys(sizes).map((each) => ({ name: each })), ok: 1 };
          }
          const size = sizes[request.database];
          return name === 'runCommand:dbStats' && size !== undefined
            ? { collections: 1, objects: 1, dataSize: size, storageSize: size, indexSize: 0, indexes: 1, ok: 1 }
            : failed(`unexpected ${name}`);
        },
      },
    );
    const text = answerOf(driven);
    expect(text.split('\n')[0]).toBe(
      '5 databases on Local, largest on disk (storage + indexes) first; the first 2, 3 more are not listed:',
    );
    expect(text).toContain('- b: ');
    expect(text).toContain('- e: ');
    expect(text).not.toContain('- a: ');
    wroteNothing(driven.sent);
  });

  it('refuses a database that does not exist', () => {
    const driven = drive(
      'database_stats',
      { connection: 'Local', database: 'nope' },
      {
        mongo: () => ({ databases: [{ name: 'shop' }], ok: 1 }),
      },
    );
    expect(driven.end).toMatchObject({
      kind: 'fail',
      message: "The database nope doesn't exist on Local: use list_databases.",
    });
  });
});
