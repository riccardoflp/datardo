import { BSON } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { view as cellMenu } from '../../../src/features/table/cell-menu';
import { plan as collapsePlan } from '../../../src/features/table/collapse';
import { view as columnMenu } from '../../../src/features/table/column-menu';
import { columnByKey, columnsOfDocuments } from '../../../src/features/table/detect-columns';
import { plan as expandPlan } from '../../../src/features/table/expand';
import { request as refreshRequest, pageAfterRefresh } from '../../../src/features/table/refresh';
import { view as rowMenu } from '../../../src/features/table/row-menu';
import { view as show, type ShowState } from '../../../src/features/table/show';
import type { ColumnNode, MenuEntry, TableTarget } from '../../../src/features/table/types';
import { emptyTexts } from '../../../src/features/query/types';
import type { Json } from '../../../src/shared/engine-request';
import { contextOf } from '../query/context';
import { canonical } from '../query/values';
import { documentOf, people } from './people';

const collection: TableTarget = { mode: 'find', view: false, readOnly: false };
const view: TableTarget = { ...collection, view: true };
const readOnly: TableTarget = { ...collection, readOnly: true };
const aggregate: TableTarget = { ...collection, mode: 'aggregate' };

function labels(entries: readonly MenuEntry[]): string[] {
  return entries.map((entry) => (entry.kind === 'separator' ? '—' : entry.label));
}

function entry(entries: readonly MenuEntry[], label: string): Extract<MenuEntry, { kind: 'entry' }> | undefined {
  return entries.find(
    (each): each is Extract<MenuEntry, { kind: 'entry' }> => each.kind === 'entry' && each.label === label,
  );
}

const ada = people[0]!;
const three = people.slice(0, 3);

describe('table.row-menu', () => {
  it('lists the entries of a row alone, in order', () => {
    expect(labels(rowMenu({ document: ada, selected: [ada], target: collection }))).toEqual([
      'Inspect document',
      'Open in a tab',
      'History…',
      '—',
      'Copy as',
      '—',
      'Duplicate…',
      'Delete document',
    ]);
    expect(
      entry(rowMenu({ document: ada, selected: [ada], target: collection }), 'Copy as')?.submenu?.map((each) =>
        each.kind === 'entry' ? each.label : '',
      ),
    ).toEqual(['mongosh', 'Extended JSON', 'JSON', 'YAML', 'insertOne command']);
  });

  it('lists the entries of a selection of three, with the number', () => {
    const menu = rowMenu({ document: ada, selected: three, target: collection });
    expect(labels(menu)).toEqual([
      'Copy 3 documents as',
      'Export 3 documents…',
      '—',
      'Update 3 documents…',
      'Delete 3 documents…',
      '—',
      'Clear selection',
    ]);
    expect(entry(menu, 'Copy 3 documents as')?.submenu).toHaveLength(7);
  });

  it('leaves out what writes on a view, a read-only connection and in Aggregate; History on a view; Open in Aggregate', () => {
    expect(labels(rowMenu({ document: ada, selected: [ada], target: view }))).toEqual([
      'Inspect document',
      'Open in a tab',
      '—',
      'Copy as',
    ]);
    expect(labels(rowMenu({ document: ada, selected: [ada], target: readOnly }))).toEqual([
      'Inspect document',
      'Open in a tab',
      'History…',
      '—',
      'Copy as',
    ]);
    expect(labels(rowMenu({ document: ada, selected: [ada], target: aggregate }))).toEqual([
      'Inspect document',
      '—',
      'Copy as',
    ]);
    expect(labels(rowMenu({ document: ada, selected: three, target: aggregate }))).not.toContain('Delete 3 documents…');
  });

  it('disables what needs an _id on a document without one', () => {
    const noId = documentOf({ name: 'Ada' });
    const menu = rowMenu({ document: noId, selected: [noId], target: collection });
    expect(entry(menu, 'Delete document')).toMatchObject({
      disabled: true,
      tip: 'Not available: the document has no _id (excluded by the projection?)',
    });
    expect(entry(menu, 'Inspect document')?.disabled).toBeUndefined();
  });
});

function column(key: string, expanded: readonly string[] = []): ColumnNode {
  return columnByKey(columnsOfDocuments(people, expanded), key)!;
}

describe('table.cell-menu', () => {
  const base = { document: ada, selected: [ada], target: collection };

  it('offers four conditions on a number, two on true, three on an array', () => {
    const filter = (value: Json): number | undefined =>
      entry(cellMenu({ ...base, column: column('name'), value }), 'Add to filter')?.submenu?.length;
    expect(filter(canonical(new BSON.Int32(5)))).toBe(4);
    expect(filter(true)).toBe(2);
    expect(filter(['a', 'b'])).toBe(3);
  });

  it('writes status: "paid" for = equals', () => {
    const equals = entry(cellMenu({ ...base, column: column('name'), value: 'paid' }), 'Add to filter')?.submenu?.[0];
    expect(equals).toMatchObject({
      label: '= equals',
      element: 'query.add-condition@cell-menu',
      args: { field: 'name', condition: 'paid' },
    });
  });

  it('has Edit value, Copy field path and the row on an empty cell', () => {
    const menu = cellMenu({ ...base, column: column('email') });
    expect(labels(menu).slice(0, 3)).toEqual(['Edit value', 'Copy field path', '—']);
    expect(labels(menu)).not.toContain('Copy value');
  });

  it('has no Edit value on a view, a read-only connection, in Aggregate, on _id and without _id', () => {
    for (const target of [view, readOnly, aggregate]) {
      expect(labels(cellMenu({ ...base, target, column: column('name'), value: 'Ada' }))).not.toContain('Edit value');
    }
    expect(labels(cellMenu({ ...base, column: column('_id'), value: 1 }))).not.toContain('Edit value');
    const noId = documentOf({ name: 'Ada' });
    expect(
      labels(cellMenu({ ...base, document: noId, selected: [noId], column: column('name'), value: 'Ada' })),
    ).not.toContain('Edit value');
  });

  it('offers the reference entries only in Find, where a reference was found', () => {
    const references = { referenced: 'one' } as const;
    expect(labels(cellMenu({ ...base, column: column('name'), value: 'x', references }))).toContain(
      'Open referenced document',
    );
    expect(
      labels(cellMenu({ ...base, target: aggregate, column: column('name'), value: 'x', references })),
    ).not.toContain('Open referenced document');
    expect(labels(cellMenu({ ...base, column: column('_id'), value: 1, references: { referencing: true } }))).toContain(
      'Find referencing documents',
    );
  });

  it('offers to expand an expandable column and to collapse the group a column is under', () => {
    expect(labels(cellMenu({ ...base, column: column('address'), value: canonical({ city: 'Milano' }) }))).toEqual(
      expect.arrayContaining(['Expand address', 'Expand all levels of address']),
    );
    expect(labels(cellMenu({ ...base, column: column('address.city', ['address']), value: 'Milano' }))).toContain(
      'Collapse address',
    );
  });
});

describe('table.column-menu', () => {
  const base = { layout: {}, texts: emptyTexts, target: collection };

  it('reads Hide address.city and Pin address to the left, or Unpin address', () => {
    const city = column('address.city', ['address']);
    expect(labels(columnMenu({ ...base, column: city }))).toEqual(
      expect.arrayContaining(['Hide address.city', 'Pin address to the left']),
    );
    expect(labels(columnMenu({ ...base, layout: { pinned: ['address'] }, column: city }))).toContain('Unpin address');
  });

  it('has Reset width only for a width set by hand', () => {
    expect(labels(columnMenu({ ...base, column: column('name') }))).not.toContain('Reset width');
    expect(labels(columnMenu({ ...base, layout: { widths: { name: 120 } }, column: column('name') }))).toContain(
      'Reset width',
    );
  });

  it('sorts descending on total, after the sort typed', () => {
    const sort = entry(
      columnMenu({
        ...base,
        texts: { ...emptyTexts, sort: '{ status: 1 }' },
        column: { path: ['total'], key: 'total', expandable: false, array: false },
      }),
      'Sort',
    );
    expect(sort?.submenu?.[1]).toMatchObject({
      label: '▼ descending',
      element: 'query.add-sort@column-menu',
      args: { to: 'sort', direction: -1 },
    });
  });

  it('has the field entries only in Find on a collection that can be changed, not on _id', () => {
    expect(labels(columnMenu({ ...base, column: column('name') })).slice(-3)).toEqual([
      'Rename field…',
      'Remove field…',
      'Convert type…',
    ]);
    for (const target of [view, readOnly, aggregate]) {
      expect(labels(columnMenu({ ...base, target, column: column('name') }))).not.toContain('Rename field…');
    }
    expect(labels(columnMenu({ ...base, column: column('_id') }))).not.toContain('Rename field…');
  });

  it('has no Sort and no Project in Aggregate', () => {
    const menu = labels(columnMenu({ ...base, target: aggregate, column: column('name') }));
    expect(menu).not.toContain('Sort');
    expect(menu).not.toContain('Project');
    expect(menu).toContain('Add to filter');
  });

  it('has Columns… and Reset all columns only on the row number column', () => {
    expect(labels(columnMenu({ ...base, column: '#' }))).toEqual(['Columns…', 'Reset all columns']);
  });
});

function shown(changes: Partial<ShowState>): ReturnType<typeof show> {
  return show({
    target: collection,
    phase: { kind: 'shown' },
    hasRows: true,
    emptyQuery: true,
    columns: columnsOfDocuments(people, []),
    layout: {},
    paging: { page: 1, pageSize: 50, skip: 0, received: 50, count: { kind: 'counted', count: 1204, estimated: false } },
    milliseconds: 38,
    selected: 0,
    ...changes,
  });
}

describe('table.show', () => {
  it('shows the status line of the page', () => {
    expect(shown({}).statusLine).toBe('50 of 1,204 documents · 38 ms');
  });

  it('says an empty collection is empty, with Insert only where it can be changed', () => {
    const empty = {
      paging: { page: 1, pageSize: 50, skip: 0, received: 0, count: { kind: 'counted', count: 0, estimated: false } },
    } as const;
    expect(shown(empty).body).toEqual({
      kind: 'message',
      text: 'This collection is empty.',
      buttons: [expect.objectContaining({ label: 'Insert' })],
    });
    expect(shown({ ...empty, target: readOnly }).body).toEqual({
      kind: 'message',
      text: 'This collection is empty.',
      buttons: [],
    });
    expect(shown({ ...empty, emptyQuery: false }).body).toMatchObject({
      text: 'No documents match this query.',
      buttons: [{ label: 'Reset' }],
    });
    expect(shown({ ...empty, emptyQuery: false }).paging).toBe(false);
  });

  it('shows view and no Insert, Update many… or Delete many… on a view', () => {
    const toolbar = shown({ target: view }).toolbar;
    expect(toolbar.marks.map((mark) => mark.label)).toEqual(['view']);
    expect(toolbar.buttons.map((button) => button.label)).toEqual(['Refresh', 'Columns', 'Export', 'Explain', 'Code']);
  });

  it('shows time series', () => {
    expect(shown({ target: { ...collection, timeSeries: true } }).toolbar.marks.map((mark) => mark.label)).toEqual([
      'time series',
    ]);
  });

  it('keeps the rows on a failure, and says a first read failed with Run again', () => {
    expect(shown({ phase: { kind: 'failed', notConnected: false } }).body).toEqual({ kind: 'table', dimmed: false });
    expect(shown({ phase: { kind: 'failed', notConnected: true }, hasRows: false }).body).toMatchObject({
      text: 'The documents could not be read.',
      buttons: [{ label: 'Run again' }, { label: 'Reconnect' }],
    });
  });

  it('dims the rows while the query runs again', () => {
    expect(shown({ phase: { kind: 'running' } }).body).toEqual({ kind: 'table', dimmed: true });
  });
});

describe('table.refresh', () => {
  it('reads the query as last run, on the page shown', () => {
    const asked = refreshRequest(contextOf('table.refresh'), {
      texts: { ...emptyTexts, filter: '{ status: "paid" }' },
      page: 3,
      pageSize: 50,
    });
    expect(asked).toMatchObject({
      kind: 'engine',
      requests: [{ request: { method: 'find', arguments: [{ status: 'paid' }, { skip: 100 }] } }],
    });
  });

  it('shows the last page that has documents when the result now ends before', () => {
    expect(pageAfterRefresh(3, 2)).toBe(2);
    expect(pageAfterRefresh(3, undefined)).toBe(3);
  });
});

describe('table.expand', () => {
  it('remembers address expanded for Local / shop / people in one app step', () => {
    const outcome = expandPlan(contextOf('table.expand'), {
      args: { database: 'shop', collection: 'people', key: 'address', expanded: [] },
    });
    expect(outcome).toMatchObject({
      kind: 'run',
      plan: {
        steps: [
          {
            kind: 'app',
            action: 'table.save-columns',
            text: 'expand the column address of c-local / shop / people',
            args: { expanded: ['address'] },
          },
        ],
      },
    });
  });

  it('expands all levels', () => {
    const outcome = expandPlan(contextOf('table.expand'), {
      args: {
        database: 'shop',
        collection: 'people',
        key: 'address',
        below: ['address.geo'],
        allLevels: true,
        expanded: [],
      },
    });
    expect(outcome).toMatchObject({
      plan: {
        steps: [
          {
            text: 'expand the column address and all its levels of c-local / shop / people',
            args: { expanded: ['address', 'address.geo'] },
          },
        ],
      },
    });
  });
});

describe('table.collapse', () => {
  it('forgets the column collapsed and keeps those under it', () => {
    const outcome = collapsePlan(contextOf('table.collapse'), {
      args: { database: 'shop', collection: 'people', key: 'address', expanded: ['address', 'address.geo'] },
    });
    expect(outcome).toMatchObject({
      plan: {
        steps: [
          { text: 'collapse the column address of c-local / shop / people', args: { expanded: ['address.geo'] } },
        ],
      },
    });
  });
});
