/**
 * The pure helpers the grid of documents is drawn from (`table.layout`, `table.rows`, `table.navigate`,
 * `table.cell-text`): the header rows and their group headings, the place of each column for the keys, the widths and
 * the left of the pinned columns, the first sub-row of each document, and the color of each kind of value.
 */
import { describe, expect, it } from 'vitest';
import { columnsOfDocuments } from '../../../src/features/table/detect-columns';
import {
  automaticWidth,
  columnPlaces,
  drawnLeaves,
  headerRows,
  numberWidth,
  pinnedLefts,
  positionKey,
  rowOffsets,
  syntaxOf,
  withinOf,
} from '../../../src/ui/table/grid-model';
import { documentOf, people } from './people';

describe('table.layout header rows of the people with items expanded', () => {
  const columns = columnsOfDocuments(people, ['items']);

  it('has two header rows: items spans its leaves, the other columns span both rows', () => {
    const rows = headerRows(columns);
    expect(rows).toHaveLength(2);
    const first = rows[0] ?? [];
    expect(first.map((cell) => cell.node.key)).toEqual(['_id', 'name', 'address', 'items', 'tags', 'email']);
    const items = first.find((cell) => cell.node.key === 'items');
    expect(items).toMatchObject({ group: true, rowSpan: 1, column: 4 });
    expect(items?.colSpan).toBe((rows[1] ?? []).length);
    expect(first.find((cell) => cell.node.key === 'name')).toMatchObject({ group: false, rowSpan: 2, column: 2 });
    expect((rows[1] ?? []).map((cell) => cell.node.key)).toContain('items.sku');
  });

  it('places items at the place of its first leaf, and tags after the leaves of items', () => {
    const places = columnPlaces(drawnLeaves(columns));
    const leaves = drawnLeaves(columns);
    expect(places.get('items')).toBe(places.get(leaves[3]?.node.key ?? ''));
    expect(places.get('tags')).toBe(4 + (headerRows(columns)[1] ?? []).length);
  });

  it('gives items.sku the array it is within, and name none', () => {
    const leaves = drawnLeaves(columns);
    const sku = leaves.find((leaf) => leaf.node.key === 'items.sku');
    const name = leaves.find((leaf) => leaf.node.key === 'name');
    expect(sku && withinOf(sku.node)).toBe('items');
    expect(name && withinOf(name.node)).toBeUndefined();
  });

  it('has one header row when nothing is expanded', () => {
    expect(headerRows(columnsOfDocuments(people, []))).toHaveLength(1);
  });
});

describe('table.layout widths and pinned columns', () => {
  it('keeps an automatic width between 64 and 360 px', () => {
    const short = [documentOf({ _id: 1, a: 1 })];
    const [, a] = drawnLeaves(columnsOfDocuments(short, []));
    const long = [documentOf({ _id: 1, text: 'x'.repeat(500) })];
    const [, text] = drawnLeaves(columnsOfDocuments(long, []));
    expect(a && automaticWidth(a.node, short)).toBe(64);
    expect(text && automaticWidth(text.node, long)).toBe(360);
  });

  it('puts the pinned columns after the row number column, one after the other', () => {
    expect(pinnedLefts([100, 80, 120], 2, 48)).toEqual([48, 148, undefined]);
    expect(pinnedLefts([100, 80], 0, 48)).toEqual([undefined, undefined]);
  });

  it('makes the row number column wide enough for the last number of the page', () => {
    expect(numberWidth(50)).toBe(48);
    expect(numberWidth(100_000)).toBeGreaterThan(numberWidth(500));
  });
});

describe('table.rows first sub-row of each document', () => {
  it('adds the heights of the documents before it', () => {
    expect(rowOffsets([2, 1, 2])).toEqual({ offsets: [0, 2, 3], total: 5 });
    expect(rowOffsets([])).toEqual({ offsets: [], total: 0 });
  });
});

describe('table.navigate position keys', () => {
  it('writes h:2 for a heading and c:3:0:2 for a cell', () => {
    expect(positionKey({ at: 'header', column: 2 })).toBe('h:2');
    expect(positionKey({ at: 'cell', row: 3, subRow: 0, column: 2 })).toBe('c:3:0:2');
  });
});

describe('table.cell-text colors of the kinds of value', () => {
  it('colors a value as the editor does, and leaves arrays, sub-documents and nothing plain', () => {
    expect(syntaxOf('string')).toBe('string');
    expect(syntaxOf('number')).toBe('number');
    expect(syntaxOf('null')).toBe('bool');
    expect(syntaxOf('id')).toBe('oid');
    expect(syntaxOf('date')).toBe('date');
    expect(syntaxOf('array')).toBeUndefined();
    expect(syntaxOf('missing')).toBeUndefined();
  });
});
