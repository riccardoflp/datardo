import { describe, expect, it } from 'vitest';
import { arrangedLayout, plan as arrangePlan } from '../../../src/features/table/arrange-columns';
import { view as columnsView } from '../../../src/features/table/columns';
import { columnsOfDocuments, expandableBelow, columnByKey } from '../../../src/features/table/detect-columns';
import { arrangedColumns, columnWidth, movedLayout } from '../../../src/features/table/layout';
import type { ColumnLayout } from '../../../src/features/table/types';
import { contextOf } from '../query/context';
import { documentOf, leafKeys, leafNames, people } from './people';
import { BSON } from 'mongodb';

describe('table.detect-columns', () => {
  it('gives the columns of each worked example, in order', () => {
    expect(leafNames(columnsOfDocuments(people, []))).toEqual([
      '_id',
      'name',
      'address ▸',
      'items ▸[]',
      'tags',
      'email',
    ]);
    expect(leafNames(columnsOfDocuments(people, ['address']))).toEqual([
      '_id',
      'name',
      'address.city',
      'address.zip',
      'address.geo ▸',
      'items ▸[]',
      'tags',
      'email',
    ]);
    expect(leafNames(columnsOfDocuments(people, ['address', 'address.geo']))).toEqual([
      '_id',
      'name',
      'address.city',
      'address.zip',
      'address.geo.lat',
      'address.geo.lng',
      'items ▸[]',
      'tags',
      'email',
    ]);
    expect(leafNames(columnsOfDocuments(people, ['items']))).toEqual([
      '_id',
      'name',
      'address ▸',
      'items.sku',
      'items.qty',
      'items.options ▸',
      'items.parts',
      'tags',
      'email',
    ]);
    expect(leafNames(columnsOfDocuments(people, ['name', 'tags']))).toEqual([
      '_id',
      'name',
      'address ▸',
      'items ▸[]',
      'tags',
      'email',
    ]);
  });

  it('has no email column in a page without the second document', () => {
    expect(leafKeys(columnsOfDocuments([people[0]!, people[2]!], []))).not.toContain('email');
  });

  it('does not expand {}, [], an array of numbers, an ObjectId or a date; gives nothing for no documents', () => {
    const documents = [
      documentOf({ a: {}, b: [], c: [1, 2], d: new BSON.ObjectId('65f1c0de65f1c0de65f1c0de'), e: new Date(0) }),
    ];
    expect(leafNames(columnsOfDocuments(documents, ['a', 'b', 'c', 'd', 'e']))).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(columnsOfDocuments([], [])).toEqual([]);
  });

  it('expands all levels below a column of the page', () => {
    const address = columnByKey(columnsOfDocuments(people, []), 'address')!;
    expect(expandableBelow(people, address)).toEqual(['address', 'address.geo']);
    const items = columnByKey(columnsOfDocuments(people, []), 'items')!;
    expect(expandableBelow(people, items)).toEqual(['items', 'items.options']);
  });
});

const addressExpanded = columnsOfDocuments(people, ['address']);

describe('table.layout', () => {
  it('gives the natural leaves for an empty layout', () => {
    const arranged = arrangedColumns(addressExpanded, {});
    expect(leafKeys(arranged.columns)).toEqual([
      '_id',
      'name',
      'address.city',
      'address.zip',
      'address.geo',
      'items',
      'tags',
      'email',
    ]);
    expect(arranged.pinned).toBe(0);
  });

  it('hides, pins and orders as the worked example says', () => {
    const arranged = arrangedColumns(addressExpanded, {
      hidden: ['name', 'address.zip'],
      pinned: ['tags'],
      order: ['email', '_id'],
    });
    expect(leafKeys(arranged.columns)).toEqual(['tags', 'email', '_id', 'address.city', 'address.geo', 'items']);
    expect(arranged.pinned).toBe(1);
  });

  it('writes the order of the siblings on a move', () => {
    expect(movedLayout(addressExpanded, {}, { source: 'tags', target: 'name', after: false })?.order).toEqual([
      '_id',
      'tags',
      'name',
      'address',
      'items',
      'email',
    ]);
    const pinned = movedLayout(addressExpanded, { pinned: ['_id'] }, { source: 'tags', target: '_id', after: true });
    expect(pinned?.pinned).toEqual(['_id', 'tags']);
    expect(
      movedLayout(addressExpanded, {}, { source: 'address.zip', target: 'address.city', after: false })?.order,
    ).toEqual(['address.zip', 'address.city', 'address.geo']);
    expect(movedLayout(addressExpanded, {}, { source: 'address.zip', target: 'name', after: false })).toBeUndefined();
  });

  it('keeps a hidden key no column has; removes a group whose children are all hidden; widths are at least 40', () => {
    expect(leafKeys(arrangedColumns(addressExpanded, { hidden: ['phone'] }).columns)).toHaveLength(8);
    const hidden = arrangedColumns(addressExpanded, { hidden: ['address.city', 'address.zip', 'address.geo'] });
    expect(hidden.columns.map((node) => node.key)).not.toContain('address');
    expect(columnWidth({ widths: { name: 10 } }, 'name')).toBe(40);
    expect(columnWidth({}, 'name')).toBeUndefined();
  });
});

function arranged(args: Record<string, unknown>): unknown {
  return arrangePlan(contextOf('table.arrange-columns'), {
    args: { connection: 'c-local', database: 'shop', collection: 'people', ...args },
  });
}

describe('table.arrange-columns', () => {
  it('hides a column and remembers the layout in one app step', () => {
    const outcome = arranged({ change: { kind: 'hide', key: 'name' }, layout: {}, columns: addressExpanded });
    expect(outcome).toMatchObject({
      kind: 'run',
      plan: {
        steps: [
          {
            kind: 'app',
            action: 'table.save-columns',
            text: "save the columns' layout of c-local / shop / people",
            args: { layout: { hidden: ['name'] } },
          },
        ],
      },
    });
  });

  it('pins the top-level column of a child column, and unpins it', () => {
    const pinned = arrangedLayout({}, { kind: 'pin', key: 'address.city' }, addressExpanded) as ColumnLayout;
    expect(pinned.pinned).toEqual(['address']);
    expect(
      (arrangedLayout(pinned, { kind: 'unpin', key: 'address.city' }, addressExpanded) as ColumnLayout).pinned,
    ).toEqual([]);
  });

  it('refuses a move between levels', () => {
    const outcome = arranged({
      change: { kind: 'move', source: 'address.zip', target: 'name', after: false },
      layout: {},
      columns: addressExpanded,
    });
    expect(outcome).toEqual({
      kind: 'refuse',
      code: 'table.arrange-columns/level',
      message: 'address.zip can only be moved among the columns at its level.',
    });
  });

  it('moves name after the whole group address when dropped on address.zip', () => {
    const layout = arrangedLayout(
      {},
      { kind: 'move', source: 'name', target: 'address.zip', after: true },
      addressExpanded,
    ) as ColumnLayout;
    expect(leafKeys(arrangedColumns(addressExpanded, layout).columns).slice(0, 5)).toEqual([
      '_id',
      'address.city',
      'address.zip',
      'address.geo',
      'name',
    ]);
  });

  it('keeps widths of 40 px or more, forgets one on reset-width, and resets everything but the expanded columns', () => {
    expect(
      (arrangedLayout({}, { kind: 'resize', key: 'name', width: 12 }, addressExpanded) as ColumnLayout).widths,
    ).toEqual({ name: 40 });
    expect(
      (arrangedLayout({ widths: { name: 90 } }, { kind: 'reset-width', key: 'name' }, addressExpanded) as ColumnLayout)
        .widths,
    ).toEqual({});
    expect(
      arrangedLayout({ hidden: ['name'], pinned: ['tags'], widths: { name: 90 } }, { kind: 'reset' }, addressExpanded),
    ).toEqual({});
  });

  it('changes nothing for move-right on the last column of its level', () => {
    expect(arrangedLayout({}, { kind: 'move-right', key: 'address.geo' }, addressExpanded)).toBeUndefined();
    const outcome = arranged({ change: { kind: 'move-right', key: 'email' }, layout: {}, columns: addressExpanded });
    expect(outcome).toMatchObject({ kind: 'run', plan: { steps: [] } });
  });
});

describe('table.columns', () => {
  it('reads Columns (2 hidden) with two columns of the page hidden, and Columns with none', () => {
    const columns = columnsOfDocuments(people, []);
    expect(columnsView({ columns, layout: { hidden: ['email', 'tags'] }, search: '' }).button.label).toBe(
      'Columns (2 hidden)',
    );
    expect(columnsView({ columns, layout: {}, search: '' }).button.label).toBe('Columns');
  });

  it('leaves address and city for the search ci, and rows cannot be dragged while searching', () => {
    const shown = columnsView({ columns: addressExpanded, layout: {}, search: 'ci' });
    expect(shown.rows.map((row) => row.key)).toEqual(['address', 'address.city']);
    expect(shown.rows[1]).toMatchObject({ name: 'city', depth: 1 });
    expect(shown.draggable).toBe(false);
  });

  it('lists hidden columns of the page unticked, not those absent from it, and says No columns', () => {
    const shown = columnsView({ columns: addressExpanded, layout: { hidden: ['name', 'phone'] }, search: '' });
    expect(shown.rows.find((row) => row.key === 'name')?.shown).toBe(false);
    expect(shown.rows.some((row) => row.key === 'phone')).toBe(false);
    expect(columnsView({ columns: [], layout: {}, search: '' }).empty).toBe('No columns');
  });
});
