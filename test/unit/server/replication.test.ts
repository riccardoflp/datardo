import { describe, expect, it } from 'vitest';
import { parse } from '../../../src/features/server/read-info';
import { view } from '../../../src/features/server/replication';
import { bytes, failed, recordedBytes } from './context';

function shown(...lines: readonly string[]): ReturnType<typeof view> {
  return view({ info: parse([bytes(['# Replication', ...lines].map((line) => `${line}\r\n`).join(''))]) });
}

describe('server.replication', () => {
  it('a master with one replica at offset 1234 of 1500 shows 10.0.0.6:6379, online, 1,234, 266 B behind, 1 s', () => {
    const replication = shown(
      'role:master',
      'connected_slaves:1',
      'slave0:ip=10.0.0.6,port=6379,state=online,offset=1234,lag=1',
      'master_repl_offset:1500',
    );
    expect(replication.replicas?.rows).toEqual([
      {
        name: 'slave0',
        address: '10.0.0.6:6379',
        state: 'online',
        offset: '1,234',
        behind: '266 B',
        lag: '1 s',
        lagTone: 'ordinary',
        selected: false,
      },
    ]);
    expect(replication.tiles.map((tile) => [tile.label, tile.value])).toEqual(
      expect.arrayContaining([
        ['Role', 'master'],
        ['Replicas', '1'],
        ['Offset', '1,500'],
      ]),
    );
  });

  it('a replica with lag=75 has its lag in red; with lag=12, in yellow; equal offsets are 0 B behind', () => {
    const replication = shown(
      'role:master',
      'connected_slaves:2',
      'slave0:ip=10.0.0.6,port=6379,state=online,offset=1500,lag=75',
      'slave1:ip=10.0.0.7,port=6379,state=online,offset=1500,lag=12',
      'master_repl_offset:1500',
    );
    expect(replication.replicas?.rows.map((row) => [row.lagTone, row.behind])).toEqual([
      ['error', '0 B'],
      ['warning', '0 B'],
    ]);
  });

  it('role:slave with the link down for 42 seconds shows Link down for 42 s in the error color', () => {
    const replication = shown(
      'role:slave',
      'master_host:10.0.0.5',
      'master_port:6379',
      'master_link_status:down',
      'master_link_down_since_seconds:42',
      'master_last_io_seconds_ago:-1',
    );
    expect(replication.tiles.find((tile) => tile.label === 'Link')).toEqual({
      label: 'Link',
      value: 'down for 42 s',
      tone: 'error',
    });
    expect(replication.tiles[0]?.value).toBe('replica of 10.0.0.5:6379');
  });

  it('a master with no replica shows No replica is connected to this server. and no table (recorded from Redis 7.4)', () => {
    const replication = view({ info: parse([recordedBytes('redis-7.4-server-info-replication.txt')]) });
    expect(replication.noReplica).toBe('No replica is connected to this server.');
    expect(replication.replicas).toBeUndefined();
  });

  it('a replica with slave_read_only:1 shows This server is a replica: it refuses writes.', () => {
    const replication = view({ info: parse([recordedBytes('redis-7.4-replica-info-replication.txt')]) });
    expect(replication.line).toBe('This server is a replica: it refuses writes.');
    expect(replication.tiles.map((tile) => tile.label)).toEqual(
      expect.arrayContaining(['Role', 'Link', 'Last contact', 'Offset', 'Priority']),
    );
  });

  it('a last contact of 12 seconds is yellow, and a sync in progress shows what is left', () => {
    const replication = shown(
      'role:slave',
      'master_host:10.0.0.5',
      'master_port:6379',
      'master_link_status:up',
      'master_last_io_seconds_ago:12',
      'master_sync_in_progress:1',
      'master_sync_left_bytes:12582912',
    );
    expect(replication.tiles.find((tile) => tile.label === 'Last contact')).toMatchObject({
      value: '12 s ago',
      tone: 'warning',
    });
    expect(replication.tiles.find((tile) => tile.label === 'Sync')?.value).toBe('in progress · 12.0 MB left');
  });

  it('a server whose INFO has no master_failover_state shows no Failover tile', () => {
    expect(shown('role:master', 'connected_slaves:0').tiles.map((tile) => tile.label)).not.toContain('Failover');
    expect(shown('role:master', 'master_failover_state:no-failover').tiles.map((tile) => tile.label)).not.toContain(
      'Failover',
    );
    expect(shown('role:master', 'master_failover_state:waiting-for-sync').tiles.at(-1)).toEqual({
      label: 'Failover',
      value: 'waiting-for-sync',
      tone: 'ordinary',
    });
  });

  it('the backlog shows on · 1.0 MB, and the offset has the replication ID as tooltip', () => {
    const replication = shown(
      'role:master',
      'master_replid:abc123',
      'master_repl_offset:7',
      'repl_backlog_active:1',
      'repl_backlog_size:1048576',
    );
    expect(replication.tiles.find((tile) => tile.label === 'Backlog')?.value).toBe('on · 1.0 MB');
    expect(replication.tiles.find((tile) => tile.label === 'Offset')?.tooltip).toBe('abc123');
  });

  it('a user whose ACL denies INFO sees INFO needs a user that may run it: …', () => {
    const replication = view({ info: parse([failed('NOPERM no')]) });
    expect(replication.error).toBe('INFO needs a user that may run it: NOPERM no');
  });
});
