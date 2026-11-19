import { describe, expect, it } from 'vitest';
import { view, type OverviewTile, type OverviewTileName } from '../../../src/features/server/overview';
import { parse } from '../../../src/features/server/read-info';
import { timeText } from '../../../src/features/server/types';
import { bytes, cacheLocal, failed, recordedBytes } from './context';

const now = 1_763_400_000_000;

function infoOf(...lines: readonly string[]): ReturnType<typeof parse> {
  return parse([bytes(lines.map((line) => `${line}\r\n`).join(''))]);
}

function tile(name: OverviewTileName, ...lines: readonly string[]): OverviewTile {
  const found = view({ connection: cacheLocal.id, info: infoOf(...lines), now }).tiles.find(
    (each) => each.name === name,
  );
  if (found === undefined) {
    throw new Error(`No tile ${name}.`);
  }
  return found;
}

describe('server.overview', () => {
  it('used_memory 1288490188 of maxmemory 4294967296 shows 1.2 GB of 4.0 GB (30%), the bytes as tooltip', () => {
    const memory = tile('memory', 'used_memory:1288490188', 'maxmemory:4294967296');
    expect(memory.value).toBe('1.2 GB of 4.0 GB (30%)');
    expect(memory.tooltip).toBe('1,288,490,188 bytes');
    expect(memory.bar).toEqual({ percent: 30, tone: 'ordinary' });
  });

  it('maxmemory 0 shows 1.2 GB · no limit, with neither share nor bar', () => {
    const memory = tile('memory', 'used_memory:1288490188', 'maxmemory:0');
    expect(memory.value).toBe('1.2 GB · no limit');
    expect(memory.bar).toBeUndefined();
  });

  it('used_memory 4187593113 of 4294967296 shows 3.9 GB of 4.0 GB (98%), the bar red', () => {
    const memory = tile('memory', 'used_memory:4187593113', 'maxmemory:4294967296');
    expect(memory.value).toBe('3.9 GB of 4.0 GB (98%)');
    expect(memory.bar).toEqual({ percent: 98, tone: 'error' });
  });

  it('the hit rate: 934 and 66 give 93.4%; 0 and 0 give —; 0 and 5 give 0.0%', () => {
    expect(tile('hitRate', 'keyspace_hits:934', 'keyspace_misses:66').value).toBe('93.4%');
    expect(tile('hitRate', 'keyspace_hits:934', 'keyspace_misses:66').lines[0]?.text).toBe(
      '934 hits · 66 misses since the server started or its statistics were reset',
    );
    expect(tile('hitRate', 'keyspace_hits:0', 'keyspace_misses:0').value).toBe('—');
    expect(tile('hitRate', 'keyspace_hits:0', 'keyspace_misses:5').value).toBe('0.0%');
  });

  it('uptime 277920 shows 3 d 5 h; 42 shows 42 s', () => {
    expect(tile('uptime', 'uptime_in_seconds:277920').value).toBe('3 d 5 h');
    expect(tile('uptime', 'uptime_in_seconds:42').value).toBe('42 s');
    expect(timeText(4 * 3600 + 12 * 60)).toBe('4 h 12 min');
    expect(timeText(12 * 60 + 5)).toBe('12 min 5 s');
  });

  it('role:slave of 10.0.0.5:6379 with the link down shows replica of 10.0.0.5:6379 and link down in the error color', () => {
    const role = tile('role', 'role:slave', 'master_host:10.0.0.5', 'master_port:6379', 'master_link_status:down');
    expect(role.value).toBe('replica of 10.0.0.5:6379');
    expect(role.lines).toEqual([{ text: 'link down', tone: 'error' }]);
    expect(tile('role', 'role:master', 'connected_slaves:2').lines[0]?.text).toBe('2 replicas');
  });

  it('db0 with 1,204 keys and db3 with 7 show 1,211 in 2 databases and two rows; a double click on db3 opens its keys tab', () => {
    const shown = view({
      connection: cacheLocal.id,
      info: infoOf('# Keyspace', 'db0:keys=1204,expires=310,avg_ttl=86400000', 'db3:keys=7,expires=0,avg_ttl=0'),
      now,
    });
    expect(shown.tiles.find((each) => each.name === 'keys')?.value).toBe('1,211 in 2 databases');
    expect(shown.databases?.rows.map((row) => [row.name, row.keys, row.expires, row.averageTtl])).toEqual([
      ['db0', '1,204', '310', '1 d'],
      ['db3', '7', '0', '—'],
    ]);
    expect(shown.databases?.rows[1]?.open).toMatchObject({
      kind: 'start',
      feature: 'key.show',
      target: { kind: 'redis-database', connection: cacheLocal.id, database: 3 },
    });
  });

  it('a server with no keys shows No keys. in place of the table', () => {
    const shown = view({ connection: cacheLocal.id, info: infoOf('# Keyspace'), now });
    expect(shown.noKeys).toBe('No keys.');
    expect(shown.databases).toBeUndefined();
  });

  it('a server whose INFO has no maxclients shows 340 connected and — for the limit', () => {
    const clients = tile('clients', 'connected_clients:340', 'blocked_clients:2');
    expect(clients.value).toBe('340 connected');
    expect(clients.lines[0]?.text).toBe('2 blocked · up to —');
    expect(tile('clients', 'connected_clients:340', 'blocked_clients:2', 'maxclients:10000').lines[0]?.text).toBe(
      '2 blocked · up to 10,000',
    );
    expect(tile('clients', 'rejected_connections:37').lines[1]).toEqual({
      text: '37 connections were refused: the limit of clients was reached.',
      tone: 'warning',
    });
  });

  it('rdb_last_bgsave_status:err shows The last snapshot failed. in the error color', () => {
    const persistence = tile('persistence', 'rdb_last_bgsave_status:err', 'aof_enabled:0');
    expect(persistence.lines).toContainEqual({ text: 'The last snapshot failed.', tone: 'error' });
  });

  it('aof_enabled:0 shows Append-only file off. and nothing about a rewrite', () => {
    const lines = tile('persistence', 'aof_enabled:0', 'aof_rewrite_in_progress:1', 'aof_last_bgrewrite_status:err');
    const texts = lines.lines.map((line) => line.text);
    expect(texts).toContain('Append-only file off.');
    expect(texts.filter((each) => each.includes('rewrit'))).toEqual([]);
  });

  it('the last snapshot 725 seconds ago with 1,204 changes since', () => {
    const saved = Math.floor(now / 1000) - 725;
    const lines = tile('persistence', `rdb_last_save_time:${String(saved)}`, 'rdb_changes_since_last_save:1204');
    expect(lines.lines.map((line) => line.text)).toContain('Last snapshot 12 min 5 s ago · 1,204 changes since.');
  });

  it('a server that names itself shows its name and version first', () => {
    const version = tile(
      'version',
      'redis_version:7.2.4',
      'server_name:valkey',
      'valkey_version:8.0.1',
      'tcp_port:6379',
    );
    expect(version.value).toBe('valkey 8.0.1 · answers as Redis 7.2.4');
    expect(tile('version', 'redis_version:7.2.4').value).toBe('7.2.4');
  });

  it('selecting the Memory tile shows every field of # Memory in the inspector island (recorded from Redis 7.4)', () => {
    const info = parse([recordedBytes('redis-7.4-server-info.txt')]);
    const shown = view({ connection: cacheLocal.id, info, now, selected: 'memory' });
    const memory = info.kind === 'read' ? info.value.sections.find((section) => section.name === 'Memory') : undefined;
    expect(shown.inspector?.title).toBe('Memory');
    expect(shown.inspector?.fields).toEqual(memory?.fields);
    expect(shown.inspector?.fields.map(([name]) => name)).toContain('used_memory');
    expect(shown.tiles.filter((each) => each.selected).map((each) => each.name)).toEqual(['memory']);
  });

  it('a user whose ACL denies INFO sees INFO needs a user that may run it: … in place of the tiles', () => {
    const info = parse([failed("NOPERM User app has no permissions to run the 'info' command")]);
    const shown = view({ connection: cacheLocal.id, info, now });
    expect(shown.error).toMatch(/^INFO needs a user that may run it: /u);
    expect(shown.tiles).toEqual([]);
  });
});
