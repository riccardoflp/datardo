/**
 * The consoles in the app's state, as the main process changes them (`console.output`, `console.clear`,
 * `console.session`): entries added and replaced, the 500 kept, a clear that keeps the command waiting.
 */
import { describe, expect, it } from 'vitest';
import { consoleClient, consoleOwner } from '../../../src/features/console/types';
import { connectionId } from '../../../src/shared/ids';
import { reduceConsoles, type ConsoleState, type OutputEntry } from '../../../src/shared/state/consoles';

const cache = connectionId('c-cache');

const fresh: ConsoleState = {
  connection: cache,
  status: 'ready',
  session: { database: 0, watching: false, protocol: 3 },
  opened: 1,
  entries: [],
  history: [],
};

function entry(id: number, done = true): OutputEntry {
  return {
    id,
    prompt: 'db0>',
    line: `GET k${String(id)}`,
    sentAt: 0,
    protocol: 3,
    notes: [],
    ...(done ? { reply: { kind: 'null' } as const, tookMs: 1 } : {}),
  };
}

function withEntries(entries: readonly OutputEntry[]) {
  return entries.reduce(
    (state, each) => reduceConsoles(state, { slice: 'consoles', type: 'entry', connection: cache, entry: each }),
    reduceConsoles({}, { slice: 'consoles', type: 'opened', console: fresh }),
  );
}

describe('console.output', () => {
  it('drops the first command from the output with the 501st', () => {
    const state = withEntries(Array.from({ length: 501 }, (_, index) => entry(index + 1)));
    const entries = state[cache]?.entries ?? [];
    expect(entries).toHaveLength(500);
    expect(entries[0]?.id).toBe(2);
  });

  it('puts the reply under the command it answers, in its place', () => {
    const state = withEntries([entry(1, false), entry(2), entry(1)]);
    expect(state[cache]?.entries.map((each) => [each.id, each.reply?.kind])).toEqual([
      [1, 'null'],
      [2, 'null'],
    ]);
  });
});

describe('console.clear', () => {
  it('keeps the command still running, with its reply when it arrives', () => {
    const cleared = reduceConsoles(withEntries([entry(1), entry(2, false)]), {
      slice: 'consoles',
      type: 'cleared',
      connection: cache,
    });
    expect(cleared[cache]?.entries.map((each) => each.id)).toEqual([2]);
    const answered = reduceConsoles(cleared, { slice: 'consoles', type: 'entry', connection: cache, entry: entry(2) });
    expect(answered[cache]?.entries[0]?.reply).toEqual({ kind: 'null' });
  });

  it('leaves the history and the session as they are', () => {
    const state = reduceConsoles(
      { [cache]: { ...fresh, history: ['GET a'], session: { ...fresh.session, database: 3 } } },
      { slice: 'consoles', type: 'cleared', connection: cache },
    );
    expect(state[cache]?.history).toEqual(['GET a']);
    expect(state[cache]?.session.database).toBe(3);
  });
});

describe('console.connect', () => {
  it('names the console client apart from the ordinary client, and finds its connection back', () => {
    expect(consoleClient(cache)).not.toBe(cache);
    expect(consoleOwner(consoleClient(cache))).toBe(cache);
    expect(consoleOwner(cache)).toBeUndefined();
  });

  it('forgets the console when its tab is closed, and says nothing runs once a reply arrived', () => {
    const running = reduceConsoles(withEntries([]), {
      slice: 'consoles',
      type: 'changed',
      connection: cache,
      change: { status: 'running', running: 'BLPOP' },
    });
    expect(running[cache]?.running).toBe('BLPOP');
    const done = reduceConsoles(running, {
      slice: 'consoles',
      type: 'changed',
      connection: cache,
      change: { status: 'ready', running: null },
    });
    expect(done[cache]?.running).toBeUndefined();
    expect(reduceConsoles(done, { slice: 'consoles', type: 'forgotten', connection: cache })[cache]).toBeUndefined();
  });
});
