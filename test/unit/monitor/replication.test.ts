import { describe, expect, it } from 'vitest';
import { oplogRow } from '../../../src/features/monitor/oplog-summary';
import type { ReplicaSetRead } from '../../../src/features/monitor/read-replication';
import { members } from '../../../src/features/monitor/replication-lag';
import { lagTone, memberRow, view, type ReplicationState } from '../../../src/features/monitor/replication';
import type { MonitorConnection } from '../../../src/features/monitor/types';
import type { Json } from '../../../src/shared/engine-request';
import { connectionId } from '../../../src/shared/ids';
import { date, int, now, timestamp } from './context';

const connection: MonitorConnection = { id: connectionId('c-local'), name: 'Local', readOnly: false, mongos: false };

function member(id: number, state: string, optime: string, extra: Record<string, Json> = {}): Json {
  return {
    _id: int(id),
    name: `db${String(id + 1)}.example.net:27017`,
    stateStr: state,
    health: int(1),
    optimeDate: date(optime),
    ...extra,
  };
}

function set(statusMembers: readonly Json[], configMembers: readonly Json[] = []): ReplicaSetRead {
  return {
    setName: 'rs0',
    primary: 'db1.example.net:27017',
    term: 12,
    protocolVersion: 1,
    election: { timeoutMillis: 10_000, heartbeatMillis: 2000, chainingAllowed: true },
    members: members(statusMembers, configMembers),
    oplog: {
      kind: 'read',
      value: { size: 100, maxSize: 1000, count: 5, first: now - 86_400_000, windowSeconds: 86_400 },
    },
  };
}

function state(replicaSet: ReplicaSetRead, extra: Partial<ReplicationState> = {}): ReplicationState {
  return {
    connection,
    server: { kind: 'read', value: { kind: 'replica-set', setName: 'rs0', primary: 'db1.example.net:27017' } },
    replicaSet,
    oplogText: '',
    oplogOperation: 'all-but-noops',
    oplogLast: 50,
    readAt: now,
    ...extra,
  };
}

const healthy = [
  member(0, 'PRIMARY', '2026-11-17T14:00:00Z', { self: true }),
  member(1, 'SECONDARY', '2026-11-17T14:00:00Z'),
  member(2, 'SECONDARY', '2026-11-17T14:00:00Z'),
];

describe('monitor.replication', () => {
  it('shows Members 3 / 3 healthy and 1 primary · 2 secondary for three healthy members', () => {
    const shown = view(state(set(healthy)));
    const tiles = shown.kind === 'replica-set' ? shown.tiles : [];
    expect(tiles.map((tile) => tile.label)).toEqual([
      'Replica set',
      'Primary',
      'Members',
      'Replication lag',
      'Oplog window',
      'Elections',
    ]);
    expect(tiles[0]).toMatchObject({ value: 'rs0', line: 'term 12 · protocol v1' });
    expect(tiles[2]).toMatchObject({ value: '3 / 3 healthy', line: '1 primary · 2 secondary', tone: 'ordinary' });
    expect(tiles[3]).toMatchObject({ value: '0 s', line: 'every member is up to date' });
    expect(tiles[5]).toMatchObject({ value: '10 s timeout', line: 'heartbeat every 2 s · chaining allowed' });
  });

  it('shows a secondary 12 seconds behind in the warning color, 75 seconds behind as 1m 15s in the danger color', () => {
    const behind = (seconds: number) =>
      view(
        state(
          set([
            member(0, 'PRIMARY', '2026-11-17T14:00:00Z'),
            member(1, 'SECONDARY', new Date(Date.parse('2026-11-17T14:00:00Z') - seconds * 1000).toISOString()),
          ]),
        ),
      );
    const twelve = behind(12);
    expect(twelve.kind === 'replica-set' ? twelve.members.rows[1] : undefined).toMatchObject({
      lag: '12 s',
      lagTone: 'warning',
    });
    const late = behind(75);
    expect(late.kind === 'replica-set' ? late.members.rows[1] : undefined).toMatchObject({
      lag: '1m 15s',
      lagTone: 'danger',
    });
    expect(lagTone(9)).toBe('ordinary');
  });

  it('leaves a member delayed by 3,600 seconds out of the lag tile, and notes delayed 1h 0m', () => {
    const shown = view(
      state(
        set(
          [member(0, 'PRIMARY', '2026-11-17T14:00:00Z'), member(1, 'SECONDARY', '2026-11-17T13:00:00Z')],
          [{ _id: int(1), priority: int(0), hidden: true, secondaryDelaySecs: int(3600) }],
        ),
      ),
    );
    const tiles = shown.kind === 'replica-set' ? shown.tiles : [];
    expect(tiles[3]).toMatchObject({ value: '0 s', line: 'every member is up to date · delayed members left out' });
    expect(shown.kind === 'replica-set' ? shown.members.rows[1]?.notes : '').toBe(
      'hidden · delayed 1h 0m · never primary',
    );
  });

  it('shows the sentence of a standalone server and neither tiles nor tables', () => {
    const shown = view({
      ...state(set(healthy)),
      server: { kind: 'read', value: { kind: 'standalone', me: 'db1.example.net:27017' } },
    });
    expect(shown).toEqual({
      kind: 'standalone',
      sentence:
        'db1.example.net:27017 is a standalone server: it is not part of a replica set, so there is no replication and no oplog.',
    });
    const unnamed = view({ ...state(set(healthy)), server: { kind: 'read', value: { kind: 'standalone' } } });
    expect(unnamed.kind === 'standalone' ? unnamed.sentence : '').toMatch(/^This server is a standalone server/u);
  });

  it('shows the sentence of a mongos', () => {
    const shown = view({ ...state(set(healthy)), server: { kind: 'read', value: { kind: 'mongos' } } });
    expect(shown.kind === 'mongos' ? shown.sentence : '').toMatch(/^Connected to a mongos \(sharded cluster\): /u);
  });

  it('says that member details need the clusterMonitor role, and an oplog that cannot be read', () => {
    const refused: ReplicaSetRead = {
      ...set(healthy),
      statusFailure: { message: 'not authorized on admin' },
      oplog: { kind: 'failed', failure: { message: 'not authorized on local' } },
    };
    const shown = view(state(refused, { oplog: { kind: 'failed', failure: { message: 'not authorized on local' } } }));
    expect(shown.kind === 'replica-set' ? shown.lines : []).toEqual([
      'Member details need the clusterMonitor role: not authorized on admin',
      'Oplog: not authorized on local',
    ]);
    expect(shown.kind === 'replica-set' ? shown.tiles.map((tile) => tile.label) : []).not.toContain('Oplog window');
    expect(shown.kind === 'replica-set' ? shown.oplog.error : '').toBe('not authorized on local');
  });

  it('counts the 50 most recent entries when there are more, and says when the oplog is empty', () => {
    const rows = Array.from({ length: 50 }, (_, index) =>
      oplogRow({ ts: timestamp(1763388000, index + 1), op: 'i', ns: 'shop.users', o: { _id: int(index) } }),
    );
    const many = view(state(set(healthy), { oplog: { kind: 'read', value: { rows, more: true } } }));
    expect(many.kind === 'replica-set' ? many.oplog.count : '').toBe('the 50 most recent entries, newest first');
    const few = view(state(set(healthy), { oplog: { kind: 'read', value: { rows: rows.slice(0, 12), more: false } } }));
    expect(few.kind === 'replica-set' ? few.oplog.count : '').toBe('all 12 most recent matching entries, newest first');
    const empty = view(state(set(healthy), { oplog: { kind: 'read', value: { rows: [], more: false } } }));
    expect(empty.kind === 'replica-set' ? empty.oplog.empty : '').toBe('The oplog is empty.');
    const none = view(
      state(set(healthy), { oplogText: 'shop', oplog: { kind: 'read', value: { rows: [], more: false } } }),
    );
    expect(none.kind === 'replica-set' ? none.oplog.empty : '').toBe('No entry matches.');
  });

  it('shows a heartbeat 4 seconds before the read as 4 s ago, and — for the member Datardo is connected to', () => {
    const [self, other] = members(
      [
        member(0, 'PRIMARY', '2026-11-17T14:00:00Z', { self: true }),
        member(1, 'SECONDARY', '2026-11-17T14:00:00Z', { lastHeartbeat: date('2026-11-17T13:59:56Z'), pingMs: int(2) }),
      ],
      [],
    );
    expect(self === undefined ? '' : memberRow(self, now).heartbeat).toBe('—');
    expect(other === undefined ? undefined : memberRow(other, now)).toMatchObject({
      heartbeat: '4 s ago',
      ping: '2 ms',
    });
  });

  it('disables Step down… without a primary and on a read-only connection', () => {
    const noPrimary = { ...set(healthy) };
    delete (noPrimary as { primary?: string }).primary;
    const shown = view(state(noPrimary));
    expect(shown.kind === 'replica-set' ? shown.members.stepDown : undefined).toMatchObject({
      element: 'monitor.step-down@toolbar',
      disabledBecause: 'There is no primary',
    });
    const readOnly = view({
      ...state(set(healthy)),
      connection: { ...connection, name: 'Production', readOnly: true },
    });
    expect(readOnly.kind === 'replica-set' ? readOnly.members.stepDown.disabledBecause : '').toBe(
      'The connection Production is read-only.',
    );
  });
});
