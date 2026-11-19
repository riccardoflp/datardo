import { describe, expect, it } from 'vitest';
import { view, type MemoryState } from '../../../src/features/server/memory';
import { memoryStats, parse } from '../../../src/features/server/read-memory';
import { bytes, cacheLocal, failed, recordedBytes, recordedRedis } from './context';

function stats(...pairs: readonly (readonly [string, number])[]): NonNullable<MemoryState['stats']> {
  return { kind: 'read', value: memoryStats(pairs.flatMap(([name, value]) => [bytes(name), value])) };
}

function state(change: Partial<MemoryState> = {}): MemoryState {
  return { largest: { connection: cacheLocal, databases: [] }, ...change };
}

describe('server.memory', () => {
  it('total.allocated 1,288,490,188 shows 1.2 GB in Allocated, with 1,288,490,188 bytes as tooltip', () => {
    const [allocated] = view(state({ stats: stats(['total.allocated', 1288490188]) })).tiles;
    expect(allocated).toMatchObject({ label: 'Allocated', value: '1.2 GB', tooltip: '1,288,490,188 bytes' });
  });

  it('the tiles show the peak, the data, the overhead and the keys with their lines', () => {
    const tiles = view(
      state({
        stats: stats(
          ['peak.allocated', 2040109465],
          ['peak.percentage', 63.2],
          ['dataset.bytes', 1181116006],
          ['dataset.percentage', 92.1],
          ['overhead.total', 101082316],
          ['keys.count', 1204311],
          ['keys.bytes-per-key', 1070],
          ['fragmentation', 1.08],
          ['fragmentation.bytes', 100663296],
        ),
      }),
    ).tiles;
    expect(tiles.map((tile) => [tile.label, tile.value, tile.lines.map((line) => line.text)])).toEqual([
      ['Allocated', '—', []],
      ['Peak', '1.9 GB', ['now at 63% of the peak']],
      ['Data', '1.1 GB', ['92% of what is allocated beyond the start']],
      ['Overhead', '96.4 MB', []],
      ['Keys', '1,204,311', ['about 1.0 KB each']],
      ['Fragmentation', '1.08', ['96.0 MB more in the system than allocated']],
    ]);
  });

  it('fragmentation 1.62 is shown 1.62 in yellow; 1.08 in the ordinary color', () => {
    const tone = (ratio: number) => view(state({ stats: stats(['fragmentation', ratio]) })).tiles.at(-1);
    expect(tone(1.62)).toMatchObject({ value: '1.62', tone: 'warning' });
    expect(tone(1.08)).toMatchObject({ value: '1.08', tone: 'ordinary' });
  });

  it('the advice of a healthy server is shown word for word, with no line added (recorded from Redis 7.4)', () => {
    const doctor = recordedBytes('redis-7.4-server-memory-doctor.txt');
    const read = parse([recordedRedis('redis-7.4-server-memory-stats-resp3.json'), doctor], { doctor: true });
    const shown = view(state({ stats: read.stats, ...(read.doctor === undefined ? {} : { doctor: read.doctor }) }));
    const written = new TextDecoder().decode(doctor);
    expect(shown.advice).toEqual({ title: 'Advice of the server', text: written });
  });

  it('until Find largest keys is pressed, the part says what it does and no command of it is sent', () => {
    const shown = view(state());
    expect(shown.largestKeys.before).toBe(
      'Find the keys that take the most memory in a database. Datardo examines up to 100,000 keys at a time.',
    );
    expect(shown.largestKeys.table).toBeUndefined();
    expect(shown.largestKeys.line).toBeUndefined();
  });

  it('selecting a tile shows every name of MEMORY STATS with its value in the inspector island', () => {
    const read = parse([recordedRedis('redis-7.4-server-memory-stats-resp3.json')]);
    const shown = view(state({ stats: read.stats, selected: 'fragmentation' }));
    const names = read.stats.kind === 'read' ? read.stats.value.values.map(([name]) => name) : [];
    expect(shown.inspector?.title).toBe('Fragmentation');
    expect(shown.inspector?.fields.map(([name]) => name)).toEqual(names);
    expect(shown.inspector?.fields.find(([name]) => name === 'db.15')?.[1]).toMatch(/^overhead\.hashtable\.main=\d+/u);
    expect(shown.tiles.filter((tile) => tile.selected).map((tile) => tile.name)).toEqual(['fragmentation']);
  });

  it('a user whose ACL denies MEMORY sees the sentence in place of the tiles and the table, and for the advice', () => {
    const denied = failed("NOPERM User app has no permissions to run the 'memory|stats' command");
    const read = parse([denied, failed("NOPERM User app has no permissions to run the 'memory|doctor' command")], {
      doctor: true,
    });
    const shown = view(state({ stats: read.stats, ...(read.doctor === undefined ? {} : { doctor: read.doctor }) }));
    expect(shown.error).toMatch(/^MEMORY STATS needs a user that may run it: NOPERM/u);
    expect(shown.tiles).toEqual([]);
    expect(shown.overhead).toBeUndefined();
    expect(shown.advice.error).toMatch(/^MEMORY DOCTOR needs a user that may run it: NOPERM/u);
  });
});
