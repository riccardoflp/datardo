/**
 * The Replication section against a replica set of three members of its own (M31), never the shared one: `hello`, the
 * members with `replSetGetStatus` and `replSetGetConfig`, the oplog's window and its entries filtered, and **Step
 * down…**, which makes the members elect another primary.
 */
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PartRead } from '../../../src/features/monitor/parts/failure';
import type { OplogEntries } from '../../../src/features/monitor/read-oplog';
import { replicaSetArgs, type ReplicationRead } from '../../../src/features/monitor/read-replication';
import type { IntentResult } from '../../../src/shared/bridge';
import { ownReplicaSet } from './own-deployments';
import { ownServer, readOnlyId, type OwnServer } from './own-server';

const database = 'monitor_rs_it';
let server: OwnServer;
let client: MongoClient;
// Both are made in beforeAll, which fails the file when they cannot be.

function readOf(result: IntentResult): unknown {
  if (result.kind !== 'read') {
    throw new Error(`Expected a read, got ${JSON.stringify(result)}`);
  }
  return result.result;
}

async function hello(): Promise<Extract<ReplicationRead, { readonly step: 'hello' }>> {
  const read = readOf(
    await server.start('monitor.read-replication', { connection: 'c-monitor', step: 'hello' }),
  ) as ReplicationRead;
  if (read.step !== 'hello') {
    throw new Error('Expected the step hello.');
  }
  return read;
}

async function primaryNow(): Promise<string | undefined> {
  const said = await hello();
  return said.server.kind === 'read' && said.server.value.kind === 'replica-set'
    ? said.server.value.primary
    : undefined;
}

beforeAll(async () => {
  server = await ownServer(ownReplicaSet);
  client = await MongoClient.connect(server.uri);
  const orders = client.db(database).collection<{ _id: number; status: string }>('orders');
  await orders.insertMany(Array.from({ length: 20 }, (_, index) => ({ _id: index, status: 'new' })));
  await orders.updateOne({ _id: 3 }, { $set: { status: 'paid' } });
  await orders.deleteOne({ _id: 4 });
}, 180_000);

afterAll(async () => {
  await client.close();
  await server.close();
});

describe('monitor.read-replication', () => {
  it('reads the set, its three members, its primary and the window of its oplog', async () => {
    const said = await hello();
    expect(said.server).toMatchObject({ kind: 'read', value: { kind: 'replica-set', setName: 'monitor-rs' } });
    const args = replicaSetArgs('c-monitor', said);
    expect(args).toBeDefined();
    const read = readOf(await server.start('monitor.read-replication', args ?? null)) as ReplicationRead;
    if (read.step !== 'replica-set') {
      throw new Error('Expected the step replica-set.');
    }
    const set = read.replicaSet;
    expect(set.setName).toBe('monitor-rs');
    expect(set.members).toHaveLength(3);
    expect(set.members.filter((member) => member.state === 'PRIMARY')).toHaveLength(1);
    expect(set.members.filter((member) => member.state === 'SECONDARY')).toHaveLength(2);
    expect(set.members.every((member) => member.healthy && member.votes === 1)).toBe(true);
    expect(set.election.timeoutMillis).toBe(5000);
    expect(set.oplog.kind).toBe('read');
    const window = set.oplog.kind === 'read' ? set.oplog.value : undefined;
    expect(window?.count).toBeGreaterThan(0);
    expect(window?.last).toBeGreaterThanOrEqual(window?.first ?? Infinity);
  }, 30_000);
});

describe('monitor.read-oplog', () => {
  it('reads the entries of a database, newest first, and only the updates with Operation update', async () => {
    const on = { connection: 'c-monitor', text: database, last: 50 };
    const all = readOf(
      await server.start('monitor.read-oplog', { ...on, operation: 'all-but-noops' }),
    ) as PartRead<OplogEntries>;
    const rows = all.kind === 'read' ? all.value.rows : [];
    // The 20 inserts of insertMany may be one applyOps entry, which the filter finds by o.applyOps.ns.
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.slice(0, 2).map((row) => row.kind)).toEqual(['delete', 'update']);
    expect(rows.map((row) => row.time)).toEqual([...rows.map((row) => row.time)].sort((one, other) => other - one));
    const updates = readOf(
      await server.start('monitor.read-oplog', { ...on, operation: 'update' }),
    ) as PartRead<OplogEntries>;
    const updated = updates.kind === 'read' ? updates.value.rows : [];
    expect(updated.map((row) => [row.kind, row.namespace, row.id])).toEqual([['update', `${database}.orders`, '3']]);
  }, 30_000);
});

describe('monitor.step-down', () => {
  it('refuses a read-only connection and sends nothing when the confirmation is closed', async () => {
    const before = await primaryNow();
    expect(await server.start('monitor.step-down', { connection: readOnlyId }, readOnlyId)).toMatchObject({
      kind: 'refused',
      code: 'monitor.step-down/read-only',
    });
    server.dialogs.confirm = false;
    expect(await server.start('monitor.step-down', { connection: 'c-monitor' })).toEqual({ kind: 'cancelled' });
    server.dialogs.confirm = true;
    expect(server.dialogs.confirmed.at(-1)?.title).toContain(before ?? 'no primary');
    expect(await primaryNow()).toBe(before);
  }, 30_000);

  it('asks the primary to step down, and the members elect another one', async () => {
    const before = await primaryNow();
    expect(before).toBeDefined();
    expect(await server.start('monitor.step-down', { connection: 'c-monitor' })).toEqual({ kind: 'done' });
    const log = server.state().runner.log.map((line) => line.text);
    expect(log.some((line) => line.includes('replSetStepDown: 60, secondaryCatchUpPeriodSecs: 10'))).toBe(true);
    let after: string | undefined;
    for (let attempt = 0; attempt < 120 && (after === undefined || after === before); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      after = await primaryNow().catch(() => undefined);
    }
    expect(after).toBeDefined();
    expect(after).not.toBe(before);
  }, 60_000);
});
