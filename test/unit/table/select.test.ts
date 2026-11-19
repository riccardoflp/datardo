import { describe, expect, it } from 'vitest';
import { columnsOfDocuments } from '../../../src/features/table/detect-columns';
import { cellAfterKey, firstCell, type Position } from '../../../src/features/table/navigate';
import { rowsOfDocuments } from '../../../src/features/table/rows';
import { view as selectionBar } from '../../../src/features/table/selection-bar';
import { selectedDocuments, selectionAfter } from '../../../src/features/table/selection';
import { emptySelection, type Document, type Selection, type TableTarget } from '../../../src/features/table/types';
import { documentOf, leafKeys, people } from './people';

const columns = columnsOfDocuments(people, ['items']);
const rows = rowsOfDocuments(people, columns, 1);
const keys = leafKeys(columns);

function cell(row: number, subRow: number, key: string): Position {
  return { at: 'cell', row, subRow, column: keys.indexOf(key) + 1 };
}

describe('table.navigate', () => {
  it('goes down inside an expanded array, then to the next document', () => {
    const b2 = cellAfterKey(rows, columns, cell(0, 0, 'items.sku'), 'ArrowDown');
    expect(b2).toEqual(cell(0, 1, 'items.sku'));
    expect(cellAfterKey(rows, columns, b2, 'ArrowDown')).toMatchObject({ at: 'cell', row: 1, subRow: 0 });
    expect(cellAfterKey(rows, columns, cell(0, 0, 'name'), 'ArrowDown')).toEqual(cell(1, 0, 'name'));
  });

  it('changes nothing with → from the last column and ← from the row number', () => {
    const last = cell(0, 0, 'email');
    expect(cellAfterKey(rows, columns, last, 'ArrowRight')).toEqual(last);
    const number: Position = { at: 'cell', row: 0, subRow: 0, column: 0 };
    expect(cellAfterKey(rows, columns, number, 'ArrowLeft')).toEqual(number);
  });

  it('goes from the first row to its header and back', () => {
    const header = cellAfterKey(rows, columns, cell(0, 0, 'name'), 'ArrowUp');
    expect(header).toEqual({ at: 'header', column: keys.indexOf('name') + 1 });
    expect(cellAfterKey(rows, columns, header, 'ArrowDown')).toEqual(cell(0, 0, 'name'));
  });

  it('selects the last cell of the last row with Ctrl+End and the first with Ctrl+Home', () => {
    expect(cellAfterKey(rows, columns, firstCell, 'Ctrl+End')).toMatchObject({
      at: 'cell',
      row: 2,
      column: keys.length,
    });
    expect(cellAfterKey(rows, columns, cell(2, 0, 'email'), 'Ctrl+Home')).toEqual(firstCell);
  });
});

const page: readonly Document[] = Array.from({ length: 8 }, (_, index) => documentOf({ _id: index + 1 }));

function after(selection: Selection, ...actions: Parameters<typeof selectionAfter>[1][]): readonly number[] {
  const result = actions.reduce((current, action) => selectionAfter(current, action, page), selection);
  return selectedDocuments(result, page).map((document) => page.indexOf(document) + 1);
}

describe('table.selection', () => {
  it('adds and takes out rows with Ctrl and a click', () => {
    expect(after(emptySelection, { kind: 'only', index: 1 }, { kind: 'toggle', index: 4 })).toEqual([2, 5]);
    expect(
      after(emptySelection, { kind: 'only', index: 1 }, { kind: 'toggle', index: 4 }, { kind: 'toggle', index: 1 }),
    ).toEqual([5]);
  });

  it('selects from the anchor with Shift and a click, the anchor staying', () => {
    expect(after(emptySelection, { kind: 'only', index: 1 }, { kind: 'range', index: 5 })).toEqual([2, 3, 4, 5, 6]);
    expect(
      after(emptySelection, { kind: 'only', index: 1 }, { kind: 'range', index: 5 }, { kind: 'range', index: 3 }),
    ).toEqual([2, 3, 4]);
  });

  it('selects the page with Ctrl+A and nothing with Esc', () => {
    expect(after(emptySelection, { kind: 'all' })).toHaveLength(8);
    expect(after(emptySelection, { kind: 'all' }, { kind: 'clear' })).toEqual([]);
  });

  it('keeps after a refresh the documents still in the page', () => {
    const selected = selectionAfter(
      selectionAfter(emptySelection, { kind: 'only', index: 1 }, page),
      { kind: 'toggle', index: 4 },
      page,
    );
    const refreshed = selectionAfter(
      selected,
      { kind: 'refresh' },
      page.filter((_, index) => index !== 4),
    );
    expect(refreshed.keys).toHaveLength(1);
  });

  it('knows documents without _id by their place', () => {
    const noIds = [documentOf({ a: 1 }), documentOf({ a: 2 }), documentOf({ a: 3 })];
    const selected = selectionAfter(
      selectionAfter(emptySelection, { kind: 'only', index: 0 }, noIds),
      { kind: 'toggle', index: 2 },
      noIds,
    );
    expect(selectedDocuments(selected, noIds)).toEqual([noIds[0], noIds[2]]);
  });
});

const collection: TableTarget = { mode: 'find', view: false, readOnly: false };

describe('table.selection-bar', () => {
  it('appears with a second row and reads 2 selected', () => {
    expect(selectionBar({ selected: page.slice(0, 1), target: collection })).toBeUndefined();
    expect(selectionBar({ selected: page.slice(0, 2), target: collection })?.count).toBe('2 selected');
  });

  it('shows Export, Update and Delete only when each document has an _id', () => {
    const bar = selectionBar({ selected: page.slice(0, 3), target: collection });
    expect([bar?.export?.label, bar?.update?.label, bar?.delete?.label]).toEqual([
      'Export 3 documents…',
      'Update 3 documents…',
      'Delete 3 documents…',
    ]);
    const noIds = selectionBar({ selected: [documentOf({ a: 1 }), documentOf({ a: 2 })], target: collection });
    expect(noIds?.export).toBeUndefined();
    expect(noIds?.update).toBeUndefined();
  });

  it('leaves out Update and Delete on a view, a read-only connection and in Aggregate; Copy as and Clear always', () => {
    for (const target of [
      { ...collection, view: true },
      { ...collection, readOnly: true },
      { ...collection, mode: 'aggregate' as const },
    ]) {
      const bar = selectionBar({ selected: page.slice(0, 3), target });
      expect(bar?.update).toBeUndefined();
      expect(bar?.delete).toBeUndefined();
      expect(bar?.copyAs.formats).toHaveLength(7);
      expect(bar?.clear.label).toBe('Clear');
    }
  });
});
