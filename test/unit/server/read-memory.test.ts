import { describe, expect, it } from 'vitest';
import { overheadRows } from '../../../src/features/server/memory';
import { memoryStats, parse, request, statNumber, tablesBytes } from '../../../src/features/server/read-memory';
import { bytes, cacheLocal, commandsOf, contextOn, failed, recordedRedis } from './context';

/** The kind of each value: a number, a text, or pairs. */
function kinds(reply: unknown): readonly (readonly [string, string])[] {
  return memoryStats(reply).values.map(([name, value]) => [
    name,
    typeof value === 'number' ? 'number' : typeof value === 'string' ? 'text' : 'pairs',
  ]);
}

describe('server.read-memory', () => {
  it('sends MEMORY STATS at every refresh, and MEMORY DOCTOR too when the section is chosen or refreshed', () => {
    const context = contextOn('server.read-memory');
    expect(commandsOf(request(context, { connection: cacheLocal.id }))).toEqual(['MEMORY STATS']);
    expect(commandsOf(request(context, { connection: cacheLocal.id, doctor: true }))).toEqual([
      'MEMORY STATS',
      'MEMORY DOCTOR',
    ]);
  });

  it('the statistics recorded on RESP3 and on RESP2 give the same names, each of the same kind (recorded from Redis 7.4)', () => {
    const resp3 = recordedRedis('redis-7.4-server-memory-stats-resp3.json');
    const resp2 = recordedRedis('redis-7.4-server-memory-stats-resp2.json');
    expect(kinds(resp2)).toEqual(kinds(resp3));
    const stats = memoryStats(resp3);
    expect(statNumber(stats, 'total.allocated')).toBeGreaterThan(0);
    expect(statNumber(stats, 'fragmentation')).toBeGreaterThan(0);
    expect(stats.databases.map((each) => each.database)).toContain(15);
    expect(stats.databases.find((each) => each.database === 15)?.main).toBeGreaterThan(0);
  });

  it('the same statistics read on RESP3 and on RESP2 give the same values', () => {
    const resp3 = {
      kind: 'map',
      entries: [
        [bytes('total.allocated'), 1288490188],
        [bytes('fragmentation'), 1.08],
        [
          bytes('db.0'),
          {
            kind: 'map',
            entries: [
              [bytes('overhead.hashtable.main'), 72000],
              [bytes('overhead.hashtable.expires'), 4000],
            ],
          },
        ],
        [bytes('allocator.name'), bytes('jemalloc')],
      ],
    };
    const resp2 = [
      bytes('total.allocated'),
      1288490188,
      bytes('fragmentation'),
      bytes('1.08'),
      bytes('db.0'),
      [bytes('overhead.hashtable.main'), 72000, bytes('overhead.hashtable.expires'), 4000],
      bytes('allocator.name'),
      bytes('jemalloc'),
    ];
    expect(memoryStats(resp2)).toEqual(memoryStats(resp3));
    expect(statNumber(memoryStats(resp2), 'fragmentation')).toBe(1.08);
  });

  it('db.0 with 72,000 and 4,000 gives 76,000 bytes of tables for db0', () => {
    const stats = memoryStats([
      bytes('db.0'),
      [bytes('overhead.hashtable.main'), 72000, bytes('overhead.hashtable.expires'), 4000],
    ]);
    expect(stats.databases).toEqual([{ database: 0, main: 72000, expires: 4000 }]);
    expect(tablesBytes(stats.databases[0] ?? { database: 0 })).toBe(76000);
    expect(overheadRows(stats).at(-1)).toEqual({ part: 'Tables of db0', size: '74.2 KB', tooltip: '76,000 bytes' });
  });

  it('on a Redis 6.2 server there is no value for the functions, and its row shows —', () => {
    const stats = memoryStats([bytes('lua.caches'), 0]);
    expect(statNumber(stats, 'functions.caches')).toBeUndefined();
    expect(overheadRows(stats).find((row) => row.part === 'Functions')).toEqual({ part: 'Functions', size: '—' });
  });

  it('MEMORY DOCTOR answers text, kept as it is', () => {
    const doctor = 'Hi Sam, this instance is empty.\n\nI am fine.';
    expect(parse([[], bytes(doctor)], { doctor: true }).doctor).toEqual({ kind: 'read', value: doctor });
  });

  it('a server that has MEMORY STATS and not MEMORY DOCTOR shows the numbers, and the sentence in place of the advice', () => {
    const read = parse([[bytes('total.allocated'), 100], failed("ERR unknown subcommand 'DOCTOR'. Try MEMORY HELP.")], {
      doctor: true,
    });
    expect(read.stats.kind).toBe('read');
    expect(read.doctor).toMatchObject({
      kind: 'unavailable',
      unavailable: {
        sentence: "This server does not allow MEMORY DOCTOR: ERR unknown subcommand 'DOCTOR'. Try MEMORY HELP.",
      },
    });
  });
});
