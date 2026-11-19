import { describe, expect, it } from 'vitest';
import {
  buildPollMs,
  nextSort,
  plan,
  searchPollMs,
  usageRate,
  view,
  type IndexSectionState,
} from '../../../src/features/index/show';
import type { IndexInfo, IndexList } from '../../../src/features/index/types';
import { tabId, connectionId } from '../../../src/shared/ids';
import { contextOn, planOf } from './harness';

const now = Date.parse('2026-11-19T12:00:00Z');
const hour = 3_600_000;
const day = 24 * hour;

function index(name: string, more: Partial<IndexInfo> = {}): IndexInfo {
  return { name, key: { [name.split('_')[0] ?? name]: 1 }, options: { v: 2 }, building: false, ...more };
}

const three: IndexList = {
  indexes: [
    index('_id_', { key: { _id: 1 }, uses: 0, since: now - 12 * hour, size: 4096 }),
    index('status_1', { uses: 0, since: now - 12 * hour, size: 8192 }),
    index('email_1', { options: { v: 2, unique: true }, uses: 86, since: now - 12 * hour, size: 2048 }),
  ],
  totals: { documents: 1204, indexSize: 14_336 },
};

function section(more: Partial<IndexSectionState> = {}): IndexSectionState {
  return {
    collection: 'orders',
    readOnly: false,
    now,
    shown: true,
    loading: false,
    changing: false,
    indexes: { kind: 'list', list: three },
    searchIndexes: { kind: 'indexes', indexes: [] },
    ...more,
  };
}

describe('index.show', () => {
  it('shows 3 indexes, 1 never used, unique on email_1 and 86 uses ≈ 86/day', () => {
    const shown = view(section());
    expect(shown.summary).toBe(
      '3 indexes · 14 KB on disk · 1,204 documents · 1 never used · usage counted since 12h ago',
    );
    const email = shown.rows.find((row) => row.name === 'email_1');
    expect(email?.badges.map((badge) => badge.label)).toEqual(['unique']);
    expect(email?.usage?.text).toBe('86 uses ≈ 86/day');
    expect(shown.rows.find((row) => row.name === 'status_1')?.neverUsed).toBe(true);
  });

  it('writes the rate per day, and none under an hour', () => {
    expect(usageRate(500, now - 10 * day, now)).toBe('≈ 50/day');
    expect(usageRate(3, now - 10 * day, now)).toBe('< 1/day');
    expect(usageRate(3, now - 20 * 60_000, now)).toBeUndefined();
  });

  it('does not count _id_ in never used, and gives it no actions', () => {
    const id = view(section()).rows.find((row) => row.name === '_id_');
    expect(id?.neverUsed).toBe(false);
    expect(id?.menu).toEqual([]);
    expect(id?.enter).toBeUndefined();
  });

  it('sorts by Size largest first, smallest first, then in the server order', () => {
    const first = nextSort(undefined, 'size');
    const second = nextSort(first, 'size');
    const third = nextSort(second, 'size');
    const names = (sort: typeof first): readonly string[] =>
      view(section({ ...(sort === undefined ? {} : { sort }) })).rows.map((row) => row.name);
    expect(names(first)).toEqual(['status_1', '_id_', 'email_1']);
    expect(names(second)).toEqual(['email_1', '_id_', 'status_1']);
    expect(third).toBeUndefined();
    expect(names(third)).toEqual(['_id_', 'status_1', 'email_1']);
    expect(nextSort(undefined, 'name')).toEqual({ column: 'name', descending: false });
  });

  it('reads the list every second while an index is built, showing building 42%, and nothing when not shown', () => {
    const building = index('total_-1', { building: true, progress: { done: 42, total: 100 } });
    const list = { ...three, indexes: [...three.indexes, building] };
    const shown = view(section({ indexes: { kind: 'list', list } }));
    expect(shown.polling.indexes).toBe(buildPollMs);
    expect(shown.rows.at(-1)?.badges.map((badge) => badge.label)).toContain('building 42%');
    expect(view(section({ indexes: { kind: 'list', list }, shown: false })).polling).toEqual({});
  });

  it('replaces the search table by the explanation on a server without search, and does not ask again', () => {
    const shown = view(
      section({ searchIndexes: { kind: 'unsupported', message: 'requires additional configuration' } }),
    );
    expect(shown.search.explanation?.text).toMatch(/^Search indexes need MongoDB Atlas/u);
    expect(shown.search.explanation?.message).toBe('requires additional configuration');
    expect(shown.search.create).toMatchObject({ enabled: false, element: 'index.create-search@toolbar' });
    expect(shown.polling.search).toBeUndefined();
  });

  it('shows READY and new definition BUILDING, read again every 5 seconds until it settles', () => {
    const shown = view(
      section({
        searchIndexes: {
          kind: 'indexes',
          indexes: [
            {
              name: 'titles',
              type: 'search',
              status: 'READY',
              queryable: true,
              definition: { mappings: { dynamic: true } },
              hosts: [{ host: 'mongot1:27028', status: 'READY', staged: 'BUILDING' }],
            },
          ],
        },
      }),
    );
    expect(shown.search.rows[0]?.status.map((badge) => badge.label)).toEqual(['READY', 'new definition BUILDING']);
    expect(shown.polling.search).toBe(searchPollMs);
    expect(shown.search.summary).toBe('1 search index');
  });

  it('shows every index and no control that writes on a read-only connection', () => {
    const shown = view(section({ readOnly: true }));
    expect(shown.rows).toHaveLength(3);
    expect(shown.create).toBeUndefined();
    expect(shown.search.create).toBeUndefined();
    expect(shown.rows.every((row) => row.menu.length === 0)).toBe(true);
    expect(shown.statusLine).toBe('Read-only');
  });

  it('lists the indexes with empty Usage and no error without the privilege for $indexStats', () => {
    const bare: IndexList = { indexes: three.indexes.map(({ uses: _u, since: _s, ...rest }) => rest), totals: {} };
    const shown = view(section({ indexes: { kind: 'list', list: bare } }));
    expect(shown.rows.every((row) => row.usage === undefined)).toBe(true);
    expect(shown.error).toBeUndefined();
    expect(shown.summary).toBe('3 indexes');
  });

  it('shows the Indexes section of the active collection tab from Go to', () => {
    const context = contextOn(false, 'index.show');
    const tab = {
      id: tabId('t1'),
      shows: {
        kind: 'collection' as const,
        connection: connectionId('c-local'),
        database: 'shop',
        collection: 'orders',
      },
      lastActive: 0,
      loaded: true,
    };
    const withTab = {
      ...context,
      state: { ...context.state, tabs: { ...context.state.tabs, tabs: [tab], active: tab.id } },
    };
    const shown = planOf(plan(withTab, {}));
    expect(shown.steps).toEqual([
      {
        kind: 'app',
        text: 'Show the Indexes section of orders',
        action: 'tab.activate',
        args: { tab: 't1', section: 'indexes' },
      },
    ]);
  });
});
