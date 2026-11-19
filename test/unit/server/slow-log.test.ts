import { describe, expect, it } from 'vitest';
import { entryOf, parse, type SlowLogEntry } from '../../../src/features/server/read-slow-log';
import { cutCommand, durationText, plan, view, type SlowLogState } from '../../../src/features/server/slow-log';
import { at, bytes, cacheLocal, cacheProduction, contextOn, failed, planOf } from './context';

const now = at(14, 30, 0);

function entry(id: number, microseconds: number, name = 'worker', ...command: readonly string[]): SlowLogEntry {
  const words = (command.length === 0 ? ['GET', `key:${String(id)}`] : command).map((word) => bytes(word));
  const found = entryOf([
    id,
    Math.floor(at(14, 5, 9) / 1000),
    microseconds,
    words,
    bytes('10.0.0.7:52144'),
    bytes(name),
  ]);
  if (found === undefined) {
    throw new Error('No entry.');
  }
  return found;
}

/** 128 entries, the newest first: 3 of them over 100 ms, 2 from orders-api. */
function entries(): readonly SlowLogEntry[] {
  return Array.from({ length: 128 }, (_, index) => {
    const id = 128 - index;
    const microseconds =
      id === 100 ? 250_000 : id === 50 ? 1_240_000 : id === 10 ? 100_001 : id === 9 ? 100_000 : 12_345;
    return entry(id, microseconds, id === 7 || id === 8 ? 'orders-api' : 'worker');
  });
}

function state(change: Partial<SlowLogState> = {}): SlowLogState {
  return {
    connection: cacheLocal,
    entries: { kind: 'read', value: { entries: entries(), length: 128 } },
    threshold: { kind: 'read', value: { microseconds: 10000 } },
    readAt: at(14, 2, 11),
    now,
    filter: '',
    slowerThanMs: '0',
    order: 'server',
    clearing: false,
    ...change,
  };
}

describe('server.slow-log', () => {
  it('12,345 microseconds show 12.345 ms; 1,240,000 show 1.24 s', () => {
    expect(durationText(12_345)).toBe('12.345 ms');
    expect(durationText(1_240_000)).toBe('1.24 s');
  });

  it('with the threshold 10000 the line reads its sentence, then how to change it with Open console', () => {
    const shown = view(state());
    expect(shown.threshold.line).toBe(
      'The server logs the commands that take longer than 10 ms (slowlog-log-slower-than 10000).',
    );
    expect(shown.threshold.toChange).toBe('To change it, run CONFIG SET slowlog-log-slower-than in the console.');
    expect(shown.threshold.openConsole).toMatchObject({
      kind: 'start',
      label: 'Open console',
      feature: 'console.show',
    });
  });

  it('Slower than 100 shows only the entries of more than 100 ms, and the count reads 3 of 128 entries', () => {
    const shown = view(state({ slowerThanMs: '100' }));
    expect(shown.table?.rows.map((row) => row.id)).toEqual([100, 50, 10]);
    expect(shown.toolbar.count).toBe('3 of 128 entries · 14:02:11');
  });

  it('the filter orders-api shows the entries of the clients with that name', () => {
    expect(view(state({ filter: 'orders-API' })).table?.rows.map((row) => [row.id, row.name])).toEqual([
      [8, 'orders-api'],
      [7, 'orders-api'],
    ]);
  });

  it('the rows show the time, the day for another day, the duration, the command, the client and the name', () => {
    const [first] = view(state()).table?.rows ?? [];
    expect(first).toMatchObject({
      time: '14:05:09',
      duration: '12.345 ms',
      command: 'GET key:128',
      client: '10.0.0.7:52144',
      name: 'worker',
    });
    expect(view(state({ now: at(10, 0, 0, 22) })).table?.rows[0]?.time).toBe('11-19 14:05:09');
    expect(cutCommand('x'.repeat(301))).toBe(`${'x'.repeat(300)}…`);
  });

  it('an empty slow log shows No slow commands: none took longer than 10 ms …; off, the line and Nothing is logged.', () => {
    const empty = { kind: 'read', value: { entries: [], length: 0 } } as const;
    expect(view(state({ entries: empty })).empty).toBe(
      'No slow commands: none took longer than 10 ms since the log was last cleared.',
    );
    const off = view(state({ entries: empty, threshold: { kind: 'read', value: { microseconds: -1 } } }));
    expect(off.threshold.line).toBe('The slow log is off (slowlog-log-slower-than -1): no command is logged.');
    expect(off.empty).toBe('Nothing is logged.');
    expect(off.table).toBeUndefined();
  });

  it('a click on Duration puts the slowest first; an automatic refresh keeps that order', () => {
    const sorted = view(state({ order: 'duration' }));
    expect(sorted.table?.sortedByDuration).toBe(true);
    expect(sorted.table?.rows.slice(0, 2).map((row) => row.id)).toEqual([50, 100]);
    const refreshed = view(state({ order: 'duration', readAt: at(14, 2, 16) }));
    expect(refreshed.table?.rows[0]?.id).toBe(50);
  });

  it('more entries on the server than were read: 12 of 1,000 entries (the server has 4,096)', () => {
    const thousand = Array.from({ length: 1000 }, (_, index) => entry(4096 - index, index < 12 ? 200_000 : 1000));
    const shown = view(
      state({ entries: { kind: 'read', value: { entries: thousand, length: 4096 } }, slowerThanMs: '100' }),
    );
    expect(shown.toolbar.count).toBe('12 of 1,000 entries (the server has 4,096)');
  });

  it('a managed server that refuses CONFIG shows the entries and The threshold is not known: …', () => {
    const read = parse([[], 0, failed("ERR unknown command 'CONFIG'")], { part: 'entries-and-threshold' });
    const shown = view(state(read.threshold === undefined ? {} : { threshold: read.threshold }));
    expect(shown.threshold.line).toBe(
      "The threshold is not known: This server does not allow CONFIG GET: ERR unknown command 'CONFIG'",
    );
    expect(shown.table?.rows).toHaveLength(128);
  });

  it('a user whose ACL denies SLOWLOG sees its sentence, no table, and Clear… disabled with that sentence', () => {
    const read = parse([failed('NOPERM no'), failed('NOPERM no')]);
    const shown = view(state(read.entries === undefined ? {} : { entries: read.entries }));
    expect(shown.error).toBe('SLOWLOG GET needs a user that may run it: NOPERM no');
    expect(shown.table).toBeUndefined();
    expect(shown.toolbar.clear).toMatchObject({
      element: 'server.slow-log-reset@toolbar',
      enabled: false,
      disabledBecause: 'SLOWLOG GET needs a user that may run it: NOPERM no',
    });
  });

  it('Clear… is enabled on Cache local and disabled on Cache production', () => {
    expect(view(state()).toolbar.clear).toMatchObject({ feature: 'server.slow-log-reset', enabled: true });
    expect(view(state({ connection: cacheProduction })).toolbar.clear).toMatchObject({
      enabled: false,
      disabledBecause: 'The connection Cache production is read-only.',
    });
  });

  it('no command shown in the section or in the inspector island holds a password', () => {
    const secret = entry(200, 50_000, 'admin', 'CONFIG', 'SET', 'requirepass', 's3cret');
    const shown = view(state({ entries: { kind: 'read', value: { entries: [secret] } }, selected: 200 }));
    expect(shown.table?.rows[0]?.command).toBe('CONFIG SET requirepass ***');
    expect(shown.inspector?.lines).toEqual(['CONFIG', 'SET', 'requirepass', '***']);
    expect(shown.inspector?.copy).toEqual({ kind: 'copy', label: 'Copy command', text: 'CONFIG SET requirepass ***' });
    expect(JSON.stringify(shown)).not.toContain('s3cret');
  });

  it('the inspector island shows the id, the time with the date, the duration in microseconds and the client', () => {
    const shown = view(state({ selected: 128 }));
    expect(shown.inspector?.fields).toEqual([
      ['ID', '128'],
      ['Time', '11-19 14:05:09'],
      ['Duration', '12,345 µs'],
      ['Client', '10.0.0.7:52144'],
      ['Name', 'worker'],
    ]);
    expect(shown.note).toBe(
      'A duration is the time the server spent running the command. It leaves out the time the command waited for its turn and the time on the network.',
    );
  });

  it('Go to’s Server: Slow log opens the Server page on the Slow log section', () => {
    const opened = planOf(plan(contextOn('server.slow-log'), { args: null }));
    expect(JSON.stringify(opened)).toContain('slow-log');
  });
});
