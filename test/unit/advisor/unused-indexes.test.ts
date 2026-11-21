import { describe, expect, it } from 'vitest';
import { advice } from '../../../src/features/advisor/analyze';
import { unusedItem } from '../../../src/features/advisor/parts/advice-items';
import { redundantIndexes } from '../../../src/features/advisor/redundant-indexes';
import { readIndexesOf } from '../../../src/features/advisor/parts/index-replies';
import type { AdvisorIndex, UnusedAdvice } from '../../../src/features/advisor/types';
import { unusedIndexes } from '../../../src/features/advisor/unused-indexes';
import { view } from '../../../src/features/advisor/show';
import { failed, local } from '../monitor/context';
import { collectionOf, day, hour, idIndex, index, recorded } from './context';

/** 2026-11-18 12:00, UTC: the time of the worked examples. */
const now = Date.UTC(2026, 10, 18, 12, 0, 0);
const october = Date.UTC(2026, 9, 1);

function resultOf(one: AdvisorIndex): { readonly kinds: readonly string[]; readonly tooRecent: number } {
  const collection = collectionOf('shop.orders', [idIndex, one]);
  const result = unusedIndexes(collection, redundantIndexes(collection), now);
  return { kinds: result.advices.map((each) => each.kind), tooRecent: result.tooRecent };
}

describe('advisor.unused-indexes', () => {
  it.each<[string, AdvisorIndex, readonly string[], number]>([
    [
      'note_1, 0 uses since 12 days ago',
      index('note_1', { note: 1 }, { uses: 0, since: now - 12 * day }),
      ['unused'],
      0,
    ],
    ['note_1, 0 uses for exactly 24 hours', index('note_1', { note: 1 }, { uses: 0, since: now - day }), ['unused'], 0],
    ['note_1, 0 uses since 09:00', index('note_1', { note: 1 }, { uses: 0, since: now - 3 * hour }), [], 1],
    ['note_1, 3 uses', index('note_1', { note: 1 }, { uses: 3, since: october }), [], 0],
    ['email_1 unique', index('email_1', { email: 1 }, { unique: true, uses: 0, since: october }), [], 0],
    ['at_1 TTL', index('at_1', { at: 1 }, { expireAfterSeconds: 60, uses: 0, since: october }), [], 0],
    ['old_1 hidden, 40 uses', index('old_1', { old: 1 }, { hidden: true, uses: 40, since: october }), ['hidden'], 0],
    ['note_1, uses not known', index('note_1', { note: 1 }), [], 0],
    ['_id_, 0 uses', { ...idIndex, uses: 0, since: october }, [], 0],
  ])('%s', (_, one, kinds, tooRecent) => {
    expect(resultOf(one)).toEqual({ kinds, tooRecent });
  });

  it('a redundant index is not listed here: it is in the redundant list', () => {
    const collection = collectionOf('shop.orders', [
      index('status_1', { status: 1 }, { uses: 0, since: october }),
      index('status_1_createdAt_-1', { status: 1, createdAt: -1 }, { uses: 9, since: october }),
    ]);
    expect(unusedIndexes(collection, redundantIndexes(collection), now).advices).toEqual([]);
  });

  it('note_1 unused since 12 days ago says so on the page', () => {
    const collection = collectionOf('shop.orders', [index('note_1', { note: 1 }, { uses: 0, since: now - 12 * day })]);
    const [unused] = unusedIndexes(collection, [], now).advices;
    const item = unusedItem(
      { connection: local.id, readOnly: false, scope: { kind: 'database', database: 'shop' }, now, expanded: [] },
      unused as UnusedAdvice,
    );
    expect(item.lines[0]).toMatch(/^Not used by any query since 12 days ago \(.+\)\.$/u);
  });

  it('two candidates of 3 hours and 5 hours give no advice, the count 2, and the page says so', () => {
    const collection = collectionOf('shop.orders', [
      idIndex,
      index('a_1', { a: 1 }, { uses: 0, since: now - 3 * hour }),
      index('b_1', { b: 1 }, { uses: 0, since: now - 5 * hour }),
    ]);
    expect(unusedIndexes(collection, [], now)).toEqual({ advices: [], tooRecent: 2 });
    const shown = view({
      connection: { id: local.id, name: local.name, readOnly: false },
      scope: { kind: 'database', database: 'shop' },
      now,
      analyzing: false,
      read: {
        kind: 'read',
        indexes: { databases: ['shop'], profiled: [], collections: [collection], failed: [] },
        slow: { operations: [], profilers: [], log: { kind: 'read', operations: 0 } },
      },
      expanded: [],
    });
    expect(shown.lists?.unused.note).toContain(
      '2 more indexes weren’t used yet, but their statistics started less than a day ago: check again later.',
    );
    expect(shown.lists?.unused.empty).toBe('No index has been unused for a day or more.');
  });

  it('without the privilege for $indexStats no index is listed as unused, and hidden indexes still are', () => {
    const replies = [
      recorded('list-indexes'),
      failed('not authorized on shop to execute command', 13),
      recorded('coll-stats'),
      recorded('estimated-document-count'),
    ];
    const collection = readIndexesOf({ database: 'shop', collection: 'orders' }, replies);
    const result = advice([collection], [], now + 365 * day);
    expect(result.advices.filter((each) => each.kind === 'unused')).toEqual([]);
    expect(result.advices.filter((each) => each.kind === 'hidden').map((each) => each.id)).toEqual([
      'hidden:shop.orders:total_1',
    ]);
    expect(result.tooRecent).toBe(0);
  });

  it('an index hidden from the page is listed as hidden at the next analysis, with Unhide', () => {
    const collection = collectionOf('shop.orders', [
      index('note_1', { note: 1 }, { hidden: true, uses: 0, since: october }),
    ]);
    const [hidden] = unusedIndexes(collection, [], now).advices;
    expect(hidden?.id).toBe('hidden:shop.orders:note_1');
    const item = unusedItem(
      { connection: local.id, readOnly: false, scope: { kind: 'connection' }, now, expanded: [] },
      hidden as UnusedAdvice,
    );
    expect(item.buttons.map((each) => each.label)).toEqual(['Unhide', 'Drop…']);
    expect(item.buttons[0]).toMatchObject({ feature: 'index.hide', args: { index: 'note_1', hidden: false } });
  });
});
