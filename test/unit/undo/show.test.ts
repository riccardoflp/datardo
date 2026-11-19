import { describe, expect, it } from 'vitest';
import { reduceUndo, type UndoState } from '../../../src/features/undo/state/history';
import { changesText, view, whenText } from '../../../src/features/undo/show';
import { megabyte, operationId, type UndoEntry } from '../../../src/features/undo/types';
import { appStateWith, at, cacheConnection, entry, keyEntry, localConnection, undoWith } from './harness';

const now = at(2026, 11, 19, 15);
const settings = appStateWith().settings;

function page(undo: UndoState): ReturnType<typeof view> {
  return view({ undo, connections: [localConnection, cacheConnection], settings, now });
}

function twelve(): UndoEntry[] {
  const size = Math.round((3.4 * megabyte) / 12);
  return Array.from({ length: 12 }, (_, index) =>
    index === 0
      ? keyEntry({ id: operationId('op-0'), size })
      : entry({
          id: operationId(`op-${String(index)}`),
          size,
          title: index === 1 ? 'Delete many in shop.orders' : 'Edit',
        }),
  );
}

describe('undo.show', () => {
  it('summarizes the operations and their space, with the shown ones when filtered, and the limits in its tooltip', () => {
    const shown = page(undoWith(twelve()));
    expect(shown.toolbar.summary.text).toBe('12 operations · 3.4 MB of 100 MB');
    expect(shown.toolbar.summary.tooltip).toBe(
      "Kept for 7 days, up to 200 operations and 100 MB; operations of more than 10,000 documents or keys aren't recorded.",
    );
    const filtered = page(undoWith(twelve(), { filter: 'db0' }));
    expect(filtered.toolbar.summary.text).toBe('1 shown · 12 operations · 3.4 MB of 100 MB');
  });

  it('opens the Settings page at the settings of the undo history', () => {
    expect(page(undoWith([])).toolbar.settings).toMatchObject({ feature: 'settings.page' });
  });

  it('shows the time of today, yesterday and older operations, with the whole date in the tooltip', () => {
    expect(whenText(at(2026, 11, 19, 14, 5, 9), now)).toEqual({ text: '14:05:09', tooltip: '2026-11-19 14:05:09' });
    expect(whenText(at(2026, 11, 18, 14, 5, 9), now).text).toBe('yesterday 14:05');
    expect(whenText(at(2026, 10, 8, 14, 5, 9), now).text).toBe('10-08 14:05');
  });

  it('shows the target with the connection, and the changes without the zeros', () => {
    const rows = page(undoWith([entry(), keyEntry()])).rows;
    expect(rows.map((row) => row.target)).toEqual(['Local › shop.orders', 'Cache local › db0']);
    expect(changesText(entry({ inserted: 1, updated: 2, deleted: 3 }))).toBe('1 inserted, 2 updated, 3 deleted');
    expect(changesText(keyEntry({ inserted: 1, updated: 2, deleted: 3 }))).toBe('1 created, 2 changed, 3 deleted');
    expect(changesText(entry({ inserted: 0, updated: 2, deleted: 0 }))).toBe('2 updated');
  });

  it('filters by the connection, the target without the connection and the title, ignoring case, and keeps the filter', () => {
    const entries = [
      entry(),
      keyEntry(),
      entry({ id: operationId('op-9'), title: 'Import people.csv', collection: 'people' }),
    ];
    const ids = (filter: string): readonly string[] => page(undoWith(entries, { filter })).rows.map((row) => row.id);
    expect(ids('cache')).toEqual(['op-k']);
    expect(ids('SHOP.ORDERS')).toEqual(['op-1']);
    expect(ids('db0')).toEqual(['op-k']);
    expect(ids('import')).toEqual(['op-9']);
    const kept = reduceUndo(undoWith(entries), { slice: 'undo', type: 'filtered', filter: 'cache' });
    expect(kept.filter).toBe('cache');
  });

  it('has Undo and ✕ on each row, and Undoing… disabled while its undo runs', () => {
    const [documents, keys] = page(undoWith([entry(), keyEntry()], { undoing: [operationId('op-1')] })).rows;
    expect(documents?.undo).toEqual({
      label: 'Undoing…',
      element: 'undo.revert@table',
      enabled: false,
      tooltip: 'Put the documents back as they were before this operation',
    });
    expect(keys?.undo).toMatchObject({
      label: 'Undo',
      enabled: true,
      tooltip: 'Put the keys back as they were before this operation',
    });
    expect(keys?.remove).toMatchObject({ label: '✕', element: 'undo.remove@table' });
  });

  it('shows an undone operation as undone, with when in its tooltip, no size, and no details', () => {
    const [row] = page(
      undoWith([entry({ undone: at(2026, 11, 19, 14, 30), size: 0 })], { expanded: operationId('op-1') }),
    ).rows;
    expect(row).toMatchObject({ changes: 'undone', changesTooltip: 'Undone 2026-11-19 14:30:00', expanded: false });
    expect(row?.size).toBeUndefined();
    expect(row?.expand).toBeUndefined();
  });

  it('expands a row that is not undone with what undoing does', () => {
    const [row] = page(undoWith([entry()])).rows;
    expect(row?.expand).toBe('undo.details@table');
    const opened = reduceUndo(undoWith([entry()]), { slice: 'undo', type: 'expanded', operation: operationId('op-1') });
    expect(page(opened).rows[0]?.expanded).toBe(true);
  });

  it('says there is no operation yet, or none matching the filter', () => {
    expect(page(undoWith([])).empty).toBe(
      'No operations yet: changes made from Datardo to documents and keys show up here, to undo them.',
    );
    expect(page(undoWith([entry()], { filter: 'nothing like it' })).empty).toBe('No operations match the filter.');
  });
});
