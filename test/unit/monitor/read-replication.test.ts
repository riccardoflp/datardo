import { describe, expect, it } from 'vitest';
import { spanText } from '../../../src/features/monitor/parts/units';
import {
  helloMembers,
  oplogWindowOf,
  parse,
  replicaSetArgs,
  replicaSetOf,
  request,
} from '../../../src/features/monitor/read-replication';
import type { Json } from '../../../src/shared/engine-request';
import { contextOn, date, failed, int, local, recorded, requestsOf, timestamp } from './context';

const context = contextOn('monitor.read-replication');
const hello = recorded('hello-replica-set');

function replicaSetReplies(): unknown[] {
  return [
    recorded('repl-set-get-status'),
    recorded('repl-set-get-config'),
    recorded('oplog-coll-stats'),
    recorded('oplog-first'),
    recorded('oplog-last'),
  ];
}

describe('monitor.read-replication', () => {
  it('sends only hello on a standalone server', () => {
    const sent = requestsOf(request(context, { connection: local.id, step: 'hello' }));
    expect(sent.map((each) => each.arguments[0])).toEqual([{ hello: { $numberInt: '1' } }]);
    const read = parse([recorded('hello-standalone')], { step: 'hello' });
    expect(read).toMatchObject({ step: 'hello', server: { kind: 'read', value: { kind: 'standalone' } } });
    expect(replicaSetArgs(local.id, read)).toBeUndefined();
  });

  it('says a mongos for msg isdbgrid', () => {
    const read = parse([{ msg: 'isdbgrid', ok: int(1) }], { step: 'hello' });
    expect(read).toMatchObject({ server: { kind: 'read', value: { kind: 'mongos' } } });
  });

  it('sends the five requests of a replica set, with the hello of the first step', () => {
    const first = parse([hello], { step: 'hello' });
    const args = replicaSetArgs(local.id, first);
    expect(args).toMatchObject({ step: 'replica-set' });
    const sent = requestsOf(request(context, args ?? null));
    expect(sent.map((each) => each.collection ?? each.arguments[0])).toEqual([
      { replSetGetStatus: { $numberInt: '1' } },
      { replSetGetConfig: { $numberInt: '1' } },
      'oplog.rs',
      'oplog.rs',
      'oplog.rs',
    ]);
    expect(sent[3]?.arguments[1]).toMatchObject({
      sort: { $natural: { $numberInt: '1' } },
      limit: { $numberInt: '1' },
    });
    expect(sent[4]?.arguments[1]).toMatchObject({ sort: { $natural: { $numberInt: '-1' } } });
  });

  it('reads the recorded replica set: its name, term, election settings, members and oplog', () => {
    const read = replicaSetOf(replicaSetReplies(), hello);
    expect(read).toMatchObject({ setName: 'testset', primary: 'localhost:27017', protocolVersion: 1 });
    expect(read.term).toBeGreaterThan(0);
    expect(read.election).toMatchObject({ heartbeatMillis: 2000, chainingAllowed: true });
    expect(read.election.timeoutMillis).toBeGreaterThan(0);
    expect(read.members).toHaveLength(1);
    expect(read.oplog.kind).toBe('read');
    expect(read.oplog.kind === 'read' ? read.oplog.value.count : 0).toBeGreaterThan(0);
  });

  it('gives a window of 86,400 seconds, 1d 0h, from Timestamp(1763366400, 1) to Timestamp(1763452800, 7)', () => {
    const window = oplogWindowOf(
      [{ storageStats: { size: int(100), maxSize: int(1000), count: int(5) } }],
      [{ ts: timestamp(1763366400, 1) }],
      [{ ts: timestamp(1763452800, 7), wall: date('2026-11-18T08:00:00Z') }],
    );
    expect(window.windowSeconds).toBe(86_400);
    expect(spanText(window.windowSeconds ?? 0)).toBe('1d 0h');
    expect(window.first).toBe(1763366400 * 1000);
    expect(window.last).toBe(Date.parse('2026-11-18T08:00:00Z'));
  });

  it('gives the members their state and lag and no priority when replSetGetConfig is refused', () => {
    const [status, , stats, first, last] = replicaSetReplies();
    const read = replicaSetOf([status, failed('not authorized'), stats, first, last], hello);
    expect(read.members[0]).toMatchObject({ state: 'PRIMARY', lagSeconds: 0 });
    expect(read.members[0]?.priority).toBeUndefined();
    expect(read.configFailure?.message).toBe('not authorized');
  });

  it('takes the members hello lists when replSetGetStatus is refused', () => {
    const named: Json = {
      setName: 'rs0',
      hosts: ['a:27017', 'b:27017'],
      arbiters: ['c:27017'],
      primary: 'a:27017',
      me: 'b:27017',
      secondary: true,
    };
    expect(helloMembers(named).map((each) => [each.name, each.state])).toEqual([
      ['a:27017', 'PRIMARY'],
      ['b:27017', 'SECONDARY'],
      ['c:27017', 'ARBITER'],
    ]);
    const [, config, stats, first, last] = replicaSetReplies();
    const read = replicaSetOf([failed('not authorized on admin', 13), config, stats, first, last], named);
    expect(read.statusFailure?.message).toBe('not authorized on admin');
    expect(read.members).toHaveLength(3);
  });

  it('keeps the members and fails the oplog alone for a user who cannot read local', () => {
    const [status, config] = replicaSetReplies();
    const refused = failed('not authorized on local', 13);
    const read = replicaSetOf([status, config, refused, refused, refused], hello);
    expect(read.members).toHaveLength(1);
    expect(read.oplog).toEqual({ kind: 'failed', failure: { message: 'not authorized on local', code: 13 } });
  });

  it('records the refusal of replSetGetStatus on a standalone server', () => {
    expect(recorded('repl-set-get-status-standalone')).toMatchObject({ kind: 'error', code: 76 });
  });
});
