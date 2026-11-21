import { describe, expect, it } from 'vitest';
import { isOffered } from '../../../src/features/advisor/commands';
import type { ScopeIndexes } from '../../../src/features/advisor/read-indexes';
import type { ScopeSlowOperations } from '../../../src/features/advisor/read-slow-operations';
import { advisorReply } from '../../../src/features/mcp/tool/advice-reply';
import { intentOf } from '../../../src/features/palette/run-command';
import { tabId } from '../../../src/shared/ids';
import type { AppState } from '../../../src/shared/state';
import { int, local, monitorState, production } from '../monitor/context';
import { collectionOf, day, idIndex, index, megabyte, operation } from './context';

const now = Date.UTC(2026, 10, 18, 12, 0, 0);

function withAdvisorTab(connection = local, database: string | null = 'shop'): AppState {
  const state = monitorState();
  const shows = {
    kind: 'page',
    connection: connection.id,
    page: 'advisor',
    title: 'Index advisor · shop',
    ...(database === null ? {} : { database }),
  } as const;
  const tab = { id: tabId('t-advisor'), shows, lastActive: 0, loaded: true };
  return { ...state, tabs: { ...state.tabs, tabs: [tab], active: tab.id } };
}

function slow(operations: ScopeSlowOperations['operations'], level = 1): ScopeSlowOperations {
  return {
    operations,
    profilers: [{ database: 'shop', level, operations: operations.length }],
    log: { kind: 'read', operations: 0 },
    threshold: 100,
    ...(operations.length === 0 ? {} : { oldest: now - day }),
  };
}

describe('advisor.turn-on-profiler', () => {
  it('Go to offers Turn on the profiler on an Index advisor tab of a database, not on a read-only connection', () => {
    expect(isOffered(withAdvisorTab(), 'advisor.turn-on-profiler')).toBe(true);
    expect(isOffered(withAdvisorTab(local, null), 'advisor.turn-on-profiler')).toBe(false);
    expect(isOffered(withAdvisorTab(production), 'advisor.turn-on-profiler')).toBe(false);
    expect(isOffered(monitorState(), 'advisor.turn-on-profiler')).toBe(false);
  });
});

describe('advisor.show', () => {
  it('Go to opens the Index advisor of the current connection', () => {
    const state = monitorState();
    expect(isOffered(state, 'advisor.show')).toBe(true);
    expect(intentOf(state, 'advisor.show')).toMatchObject({ target: { kind: 'connection', connection: local.id } });
  });
});

describe('advisor.analyze', () => {
  it('gives index_advice the advice, the counts and where the slow operations came from', () => {
    const indexes: ScopeIndexes = {
      databases: ['shop'],
      profiled: ['shop'],
      collections: [
        collectionOf('shop.orders', [
          idIndex,
          index('note_1', { note: 1 }, { size: megabyte, uses: 0, since: now - 12 * day }),
        ]),
      ],
      failed: [],
    };
    const reply = advisorReply(indexes, slow([operation({ filter: { customerId: int(42) } })]), now);
    expect(reply).toMatchObject({
      collections: 1,
      indexes: 2,
      operations: { count: 1, source: 'profiler', since: now - day },
      notes: [],
      tooRecent: 0,
    });
    expect(reply.advice.map((each) => each.kind)).toEqual(['create', 'unused']);
    expect(reply.advice[0]).toMatchObject({ database: 'shop', collection: 'orders', keys: { customerId: 1 } });
  });

  it('says that the profiler is off and that the server log could not be read', () => {
    const indexes: ScopeIndexes = { databases: ['shop'], profiled: [], collections: [], failed: [] };
    const reply = advisorReply(
      indexes,
      { ...slow([], 0), log: { kind: 'failed', message: 'not authorized on admin to execute command' } },
      now,
    );
    expect(reply.operations).toEqual({ error: 'not authorized on admin to execute command' });
    expect(reply.notes.join(' ')).toContain('The profiler of shop is off');
  });
});
