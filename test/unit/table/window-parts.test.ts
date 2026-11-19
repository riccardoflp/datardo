/**
 * The pure helpers of the parts around the table in the window: the entries of a menu that are drawn
 * (`table.row-menu`, `table.cell-menu`, `table.column-menu`) and the selected cell the commands of Go to act on
 * (`table.copy-value`, `table.copy-path`, `table.arrange-columns`).
 */
import { describe, expect, it } from 'vitest';
import { columnsOfDocuments } from '../../../src/features/table/detect-columns';
import type { MenuEntry } from '../../../src/features/table/types';
import { selectedCell } from '../../../src/ui/table/selected-cell';
import { shownEntries } from '../../../src/ui/table/shown-entries';
import { people } from './people';

const entry = (element: string, submenu?: readonly MenuEntry[]): MenuEntry => ({
  kind: 'entry',
  label: element,
  element,
  ...(submenu === undefined ? {} : { submenu }),
});
const separator: MenuEntry = { kind: 'separator' };
const built = (element: string): boolean => element.startsWith('table.');

describe('table.row-menu shows only the entries whose feature is built', () => {
  it('leaves out an entry not built, and a separator left at an end or after another', () => {
    const entries = [
      entry('document.inspect@row-menu'),
      separator,
      entry('table.copy-as@row-menu'),
      separator,
      entry('document.delete@row-menu'),
    ];
    expect(shownEntries(entries, built).map((each) => (each.kind === 'entry' ? each.element : '-'))).toEqual([
      'table.copy-as@row-menu',
    ]);
  });

  it('keeps a separator between two entries, and leaves out a submenu whose entries are all left out', () => {
    const entries = [
      entry('table.copy-value@cell-menu'),
      separator,
      entry('table.copy-as@row-menu', [entry('table.copy-as@row-menu')]),
      entry('relation.follow@cell-menu', [entry('relation.follow@cell-menu')]),
    ];
    expect(shownEntries(entries, built).map((each) => (each.kind === 'entry' ? each.element : '-'))).toEqual([
      'table.copy-value@cell-menu',
      '-',
      'table.copy-as@row-menu',
    ]);
  });
});

describe('table.copy-value acts on the selected cell', () => {
  const columns = columnsOfDocuments(people, ['address']);

  it('finds the value and the column of a cell in an expanded column, by its place in the drawn columns', () => {
    const keys = ['_id', 'name', 'address.city'];
    const at = { at: 'cell', row: 0, subRow: 0, column: keys.indexOf('address.city') + 1 } as const;
    const cell = selectedCell(people, { columns, layout: {} }, at);
    expect(cell?.column?.key).toBe('address.city');
    expect(cell?.value).toBe('Milano');
    expect(cell?.document).toBe(people[0]);
  });

  it('follows the layout: a hidden column is not counted; a cell across a group holds the value; # has no column', () => {
    const cell = selectedCell(
      people,
      { columns, layout: { hidden: ['name'] } },
      { at: 'cell', row: 1, subRow: 0, column: 2 },
    );
    expect(cell?.column?.key).toBe('address.city');
    expect(cell?.value).toBe('unknown');
    expect(
      selectedCell(people, { columns, layout: {} }, { at: 'cell', row: 1, subRow: 0, column: 0 })?.column,
    ).toBeUndefined();
  });

  it('gives the column of a header and no document; nothing for a row outside the page', () => {
    expect(selectedCell(people, { columns, layout: {} }, { at: 'header', column: 2 })).toEqual({ column: columns[1] });
    expect(selectedCell(people, { columns, layout: {} }, { at: 'cell', row: 9, subRow: 0, column: 1 })).toBeUndefined();
  });
});
