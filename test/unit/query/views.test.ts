import { describe, expect, it } from 'vitest';
import * as autocomplete from '../../../src/features/query/autocomplete';
import * as bar from '../../../src/features/query/bar';
import * as builder from '../../../src/features/query/builder';
import type { BuilderRow } from '../../../src/features/query/builder-filter';
import * as drag from '../../../src/features/query/drag';
import type { FieldHint } from '../../../src/features/query/field-hints';
import { suggestions } from '../../../src/features/query/suggestions';
import { emptyTexts, initialQuery, type QueryTexts } from '../../../src/features/query/types';

describe('query.bar', () => {
  const shownBar = (changes: Partial<bar.BarState> = {}) =>
    bar.view({ query: initialQuery, running: false, writable: true, ...changes });
  const labels = (buttons: readonly bar.BarButton[]) => buttons.map((button) => button.label);

  it('shows Find, the five fields empty with their placeholders, the builder closed and no error line', () => {
    const shown = shownBar();
    expect(shown.mode.label).toBe('Find');
    expect(shown.fields.map((field) => [field.label, field.text, field.placeholder])).toEqual([
      ['Filter', '', '{ field: "value" }  —  or drag a cell / column here'],
      ['Sort', '', '{ field: -1 }  —  or drag a column or a cell here'],
      ['Project', '', '{ field: 1 }  —  or drag a column or a cell here'],
      ['Skip', '', '0'],
      ['Limit', '', 'no limit'],
    ]);
    expect(shown.builderOpen).toBe(false);
    expect(shown.errorLine).toBeUndefined();
  });

  it('has Find and Reset with the toggle on the top row, the tools and the writes apart on the second', () => {
    const shown = shownBar();
    expect([...labels(shown.run), shown.toggle.element]).toEqual(['Find', 'Reset', 'query.position@query-bar']);
    expect(labels(shown.tools)).toEqual(['Builder', 'Queries', 'Explain', 'Code']);
    expect(labels(shown.writes)).toEqual(['Update many…', 'Delete many…']);
    expect(shown.fields.filter((field) => field.field !== 'filter').map((field) => field.label)).toEqual([
      'Sort',
      'Project',
      'Skip',
      'Limit',
    ]);
  });

  it('gives each button its icon, none to the mode switch, and the toggle its icon and no text', () => {
    const shown = shownBar();
    const icons = [...shown.run, ...shown.tools, ...shown.writes].map((button) => [button.label, button.icon]);
    expect(icons).toEqual([
      ['Find', 'play'],
      ['Reset', 'discard'],
      ['Builder', 'list-filter'],
      ['Queries', 'history'],
      ['Explain', 'telescope'],
      ['Code', 'code'],
      ['Update many…', 'edit'],
      ['Delete many…', 'trash'],
    ]);
    expect('icon' in shown.mode).toBe(false);
    expect([shown.toggle.icon, shown.toggle.label]).toEqual(['layout-sidebar-right', '']);
  });

  it('has Explain and Code that show their sections, and the writes, with their tooltips', () => {
    const shown = shownBar();
    expect([...shown.tools, ...shown.writes].map((button) => [button.element, button.tip])).toEqual([
      ['query.builder@query-bar', 'Build the filter from fields, operators and values'],
      ['saved-query.show@query-bar', 'Recent and saved queries'],
      ['explain.show@query-bar', 'Show how MongoDB runs this query: index used, documents examined'],
      ['codegen.show@query-bar', 'The query as code for mongosh, Node.js, Python, Java, C# or Go'],
      ['document.update-many@query-bar', 'Update every document matching the filter'],
      ['document.delete-many@query-bar', 'Delete every document matching the filter'],
    ]);
  });

  it('lets Queries show its icon alone in a narrow main island, keeping its name', () => {
    const queries = shownBar().tools.find((button) => button.element === 'saved-query.show@query-bar');
    expect(queries).toMatchObject({ name: 'Queries', tip: 'Recent and saved queries', iconAloneWhenNarrow: true });
  });

  it('makes Filter, Sort and Project editors and Skip and Limit digits only', () => {
    const shown = shownBar();
    expect(shown.fields.map((field) => field.digitsOnly)).toEqual([false, false, false, true, true]);
    expect(shown.fields.map((field) => field.multiline)).toEqual([true, false, false, false, false]);
    expect(bar.typedIn('skip', '1a2')).toBe('12');
    expect(bar.filterMostHeight).toBe(240);
  });

  it('runs on Enter in Sort, Project, Skip and Limit, adds a line in Filter, inserts a suggestion when the list is open', () => {
    expect(bar.enterIn('sort', false)).toBe('run');
    expect(bar.enterIn('limit', false)).toBe('run');
    expect(bar.enterIn('filter', false)).toBe('new-line');
    expect(bar.enterIn('sort', true)).toBe('insert-suggestion');
  });

  it('reads Cancel on the run button while a query runs, in its place, with the icon debug-stop', () => {
    const run = (running: boolean) => shownBar({ running }).run[0];
    expect(run(true)).toMatchObject({ label: 'Cancel', element: 'runner.cancel@list', icon: 'debug-stop' });
    expect(run(false)).toMatchObject({
      label: 'Find',
      name: 'Run query',
      element: 'query.run@query-bar',
      icon: 'play',
    });
  });

  it('outlines a field at fault until its text is edited', () => {
    const invalid = { ...initialQuery, invalid: ['filter', 'sort'] as const };
    expect(
      shownBar({ query: invalid })
        .fields.filter((field) => field.invalid)
        .map((field) => field.field),
    ).toEqual(['filter', 'sort']);
    expect(bar.edited(invalid, 'filter', '{ a: 1 }').invalid).toEqual(['sort']);
  });

  it('shows the last message of the error line, with Details and Run again for the server', () => {
    const error = { message: 'unknown operator: $foo', details: 'unknown operator: $foo', runAgain: true };
    expect(shownBar({ query: { ...initialQuery, error } }).errorLine).toEqual(error);
  });

  it('gives way to the pipeline editor in Aggregate, keeping Queries and the toggle', () => {
    const shown = shownBar({ query: { ...initialQuery, mode: 'aggregate', builderOpen: true } });
    expect([shown.fields, shown.run, shown.writes, shown.pipeline, shown.builderOpen]).toEqual([
      [],
      [],
      [],
      true,
      false,
    ]);
    expect(labels(shown.tools)).toEqual(['Queries']);
    expect(shown.toggle.element).toBe('query.position@query-bar');
  });

  it('has neither Update many… nor Delete many… on a read-only connection or a view, the rest the same', () => {
    const shown = shownBar({ writable: false });
    expect(shown.writes).toEqual([]);
    expect(labels(shown.tools)).toEqual(['Builder', 'Queries', 'Explain', 'Code']);
  });

  it('has neither Explain, Code nor the writes in the Schema and Chart sections', () => {
    for (const section of ['schema', 'chart'] as const) {
      const shown = shownBar({ section });
      expect([labels(shown.tools), shown.writes]).toEqual([['Builder', 'Queries'], []]);
    }
  });

  it('names every control in the order of Tab', () => {
    const shown = shownBar();
    const [filter, ...options] = shown.fields;
    expect([
      shown.mode.name,
      filter?.label,
      ...[...shown.run, shown.toggle, ...shown.tools, ...shown.writes].map((button) => button.name),
      ...options.map((field) => field.label),
    ]).toEqual([
      'Query mode',
      'Filter',
      'Run query',
      'Reset',
      'Query at the right of the results',
      'Builder',
      'Queries',
      'Explain',
      'Code',
      'Update many…',
      'Delete many…',
      'Sort',
      'Project',
      'Skip',
      'Limit',
    ]);
  });
});

describe('query.builder', () => {
  const hints: readonly FieldHint[] = [
    { path: 'status', types: ['string'], ratio: 1, values: [{ value: 'paid', count: 3 }] },
  ];
  const rowText = (rows: readonly BuilderRow[]) =>
    rows.map((row) => `${row.field} ${row.operator} ${row.value}`.trim());

  it('shows one empty row with = for an empty filter', () => {
    const rows = builder.rowsOfText('', []);
    expect(rows.rows).toEqual([{ field: '', operator: 'eq', value: '' }]);
    expect(builder.view({ rows, fields: hints }).rows[0]?.operator.value).toBe('eq');
  });

  it('writes the filter of a row as it is typed', () => {
    expect(builder.textOfRows([{ field: 'status', operator: 'eq', value: 'paid' }], 'all')).toEqual({
      text: '{ status: "paid" }',
    });
  });

  it('draws a row without a field, or without a value, dashed', () => {
    const rows = builder.rowsOfText('', [
      { field: '', operator: 'eq', value: '1' },
      { field: 'a', operator: 'gt', value: '' },
    ]);
    expect(builder.view({ rows, fields: [] }).rows.map((row) => row.dashed)).toEqual([true, true]);
  });

  it('shows the rows of a filter typed, and keeps the rows still being filled in after them', () => {
    const rows = builder.rowsOfText('{ age: { $gte: 20, $lte: 30 } }', [{ field: 'name', operator: 'eq', value: '' }]);
    expect(rowText(rows.rows)).toEqual(['age gte 20', 'age lte 30', 'name eq']);
  });

  it('shows no rows and a note for a syntax error, with Condition and the choice disabled', () => {
    const rows = builder.rowsOfText('{ status: ', []);
    const shown = builder.view({ rows, fields: [] });
    expect([shown.rows, shown.note, shown.head.add.disabled, shown.head.disabled]).toEqual([
      [],
      'The filter has a syntax error: fix it in the box above to edit it here.',
      true,
      true,
    ]);
  });

  it('shows no rows and a note for operators the rows cannot show', () => {
    const shown = builder.view({
      rows: builder.rowsOfText('{ items: { $elemMatch: { sku: "A1" } } }', []),
      fields: [],
    });
    expect(shown.rows).toEqual([]);
    expect(shown.note).toBe(
      "This filter uses operators the rows can't show ($elemMatch, $expr, nested $or…): edit it in the box above, or Clear to start over here.",
    );
  });

  it('clears to one empty row and an empty Filter', () => {
    expect(builder.cleared()).toEqual({ rows: [{ field: '', operator: 'eq', value: '' }], text: '' });
  });

  it('puts string for type, removes the value for exists and missing, empties it leaving type', () => {
    const row: BuilderRow = { field: 'a', operator: 'eq', value: '5' };
    const typed = builder.withOperator(row, 'type');
    expect(typed.value).toBe('string');
    expect(
      builder.view({ rows: { combine: 'all', rows: [typed], locked: false }, fields: [] }).rows[0]?.value,
    ).toMatchObject({ kind: 'types' });
    expect(builder.withOperator(row, 'exists').value).toBe('');
    expect(builder.withOperator(typed, 'eq').value).toBe('');
  });

  it('notes a size that is not a whole number and leaves Filter as it was', () => {
    expect(builder.textOfRows([{ field: 'tags', operator: 'size', value: 'x' }], 'all')).toEqual({
      note: 'tags: size needs a whole number',
    });
  });

  it('gives Condition the icon add and the name Add a condition, and Clear the icon clear-all', () => {
    const { head } = builder.view({ rows: builder.rowsOfText('', []), fields: [] });
    expect([head.add.label, head.add.icon, head.add.name]).toEqual(['Condition', 'add', 'Add a condition']);
    expect([head.clear.label, head.clear.icon]).toEqual(['Clear', 'clear-all']);
  });

  it('names every control of a row', () => {
    const shown = builder.view({ rows: builder.rowsOfText('', []), fields: hints });
    const [first] = shown.rows;
    expect([first?.field.name, first?.operator.name, first?.value.name]).toEqual([
      'Field of condition 1',
      'Operator of condition 1',
      'Value of condition 1',
    ]);
    expect(first?.field.suggestions).toEqual(['status']);
  });
});

describe('query.autocomplete', () => {
  const fields: readonly FieldHint[] = [
    {
      path: 'status',
      types: ['string'],
      ratio: 1,
      values: [
        { value: 'paid', count: 310 },
        { value: 'new', count: 120 },
      ],
    },
  ];

  it('opens on typing a word character, and with nothing typed only after { [ : or ,', () => {
    expect(autocomplete.opensOnTyping('s', '{', 's')).toBe(true);
    expect(autocomplete.opensOnTyping('{', '{', '')).toBe(true);
    expect(autocomplete.opensOnTyping(':', ':', '')).toBe(true);
    expect(autocomplete.opensOnTyping(' ', '1', '')).toBe(false);
    expect(autocomplete.opensOnTyping('}', '}', '')).toBe(false);
  });

  it('moves with the arrows round the ends, by 8 with the page keys, inserts with Enter or Tab, closes with Esc', () => {
    const items = Array.from({ length: 20 }, (_, index) => ({
      label: `f${String(index)}`,
      kind: 'field' as const,
      insert: `f${String(index)}`,
    }));
    const state = {
      open: true,
      selected: 0,
      suggestions: { from: 0, to: 0, prefix: '', position: 'key' as const, items },
    };
    expect(autocomplete.afterKey(state, 'ArrowUp').state.selected).toBe(19);
    expect(autocomplete.afterKey({ ...state, selected: 19 }, 'ArrowDown').state.selected).toBe(0);
    expect(autocomplete.afterKey(state, 'PageDown').state.selected).toBe(8);
    expect(autocomplete.afterKey({ ...state, selected: 3 }, 'Tab').insert?.label).toBe('f3');
    expect(autocomplete.afterKey(state, 'Escape')).toEqual({ state: autocomplete.closedList });
    expect(autocomplete.afterKey(state, 'Home').state.open).toBe(false);
  });

  it('writes { status:  and opens again with the values of status', () => {
    const found = suggestions('{ st', 4, 'filter', { fields });
    const item = found?.items[0];
    expect(found && item && autocomplete.inserted('{ st', found, item)).toEqual({ text: '{ status: ', cursor: 10 });
    expect(found && item && autocomplete.reopensAfter(found, item)).toBe(true);
    const values = autocomplete.view(autocomplete.opened(suggestions('{ status: ', 10, 'filter', { fields })));
    expect(values?.lines.map((line) => [line.label, line.detail])).toEqual([
      ['"paid"', '×310'],
      ['"new"', '×120'],
    ]);
  });

  it('puts the cursor inside the skeleton of an operator', () => {
    const found = suggestions('{ a: { $i', 9, 'filter', { fields: [] });
    const item = found?.items.find((each) => each.label === '$in');
    expect(found && item && autocomplete.inserted('{ a: { $i', found, item)).toEqual({
      text: '{ a: { $in: []',
      cursor: 13,
    });
  });

  it('is a list box of at most 50 lines with the typed part in bold and the selected line known', () => {
    const items = Array.from({ length: 60 }, (_, index) => ({
      label: `status${String(index)}`,
      kind: 'field' as const,
      insert: '',
    }));
    const shown = autocomplete.view({
      open: true,
      selected: 2,
      suggestions: { from: 0, to: 2, prefix: 'st', position: 'key', items },
    });
    expect(shown?.role).toBe('listbox');
    expect(shown?.lines).toHaveLength(50);
    expect(shown?.lines[0]?.typed).toEqual([0, 2]);
    expect(shown?.active).toBe('suggestion-2');
  });

  it('suggests the operators while no field is read, and the fields join when they arrive', () => {
    expect(suggestions('{ ', 2, 'filter', { fields: [] })?.items.every((item) => item.kind === 'operator')).toBe(true);
    expect(suggestions('{ ', 2, 'filter', { fields })?.items[0]?.label).toBe('status');
  });
});

describe('query.drag', () => {
  const texts: QueryTexts = emptyTexts;
  const labels = (zones: readonly drag.Zone[]) => zones.map((zone) => zone.label);

  it('offers = ≠ ≥ ≤ for the cell status and writes { status: "paid" } on = equals', () => {
    const dragged: drag.Dragged = { kind: 'cell', field: 'status', value: 'paid' };
    const zones = drag.view({ dragged, texts });
    expect(labels(zones.filter)).toEqual(['= equals', '≠ not equal', '≥ from', '≤ to']);
    expect(zones.filter.every((zone) => zone.field === 'status')).toBe(true);
    const [equals] = zones.filter;
    expect(equals && drag.dropped(equals, dragged, texts)).toEqual({ field: 'filter', text: '{ status: "paid" }' });
  });

  it('offers = and ≠ only for true, an ObjectId and a sub-document', () => {
    for (const value of [true, { $oid: '65f1c0de65f1c0de65f1c0de' }, { city: 'Milano' }]) {
      expect(labels(drag.view({ dragged: { kind: 'cell', field: 'a', value }, texts }).filter)).toEqual([
        '= equals',
        '≠ not equal',
      ]);
    }
  });

  it('makes a range of two drops on total', () => {
    const from = drag.view({ dragged: { kind: 'cell', field: 'total', value: 10 }, texts }).filter[2];
    const first = from && drag.dropped(from, { kind: 'cell', field: 'total', value: 10 }, texts);
    const after = { ...texts, filter: first && 'text' in first ? first.text : '' };
    const to = drag.view({ dragged: { kind: 'cell', field: 'total', value: 50 }, texts: after }).filter[3];
    expect(to && drag.dropped(to, { kind: 'cell', field: 'total', value: 50 }, after)).toEqual({
      field: 'filter',
      text: '{ total: { $gte: 10, $lte: 50 } }',
    });
  });

  it('writes items[].sku and the same element for a field of an expanded array', () => {
    const dragged: drag.Dragged = { kind: 'cell', field: 'items.sku', value: 'B2', within: 'items' };
    const [equals] = drag.view({ dragged, texts }).filter;
    expect(equals?.field).toBe('items[].sku');
    expect(equals?.tip.endsWith(' · same element of items ($elemMatch)')).toBe(true);
    expect(equals && drag.dropped(equals, dragged, texts)).toEqual({
      field: 'filter',
      text: '{ items: { $elemMatch: { sku: "B2" } } }',
    });
  });

  it('offers three zones over Filter, two over Sort and two over Project for a header, and remove when in the sort', () => {
    const header: drag.Dragged = { kind: 'header', field: 'createdAt' };
    const zones = drag.view({ dragged: header, texts });
    expect([zones.filter.length, zones.sort.length, zones.project.length]).toEqual([3, 2, 2]);
    expect(labels(drag.view({ dragged: header, texts: { ...texts, sort: '{ createdAt: -1 }' } }).sort)).toEqual([
      '▲ ascending',
      '▼ descending',
      '✕ remove',
    ]);
  });

  it('offers ascending and descending over Sort and include and exclude over Project for the cell total 42', () => {
    const dragged: drag.Dragged = { kind: 'cell', field: 'total', value: 42 };
    const zones = drag.view({ dragged, texts });
    expect([labels(zones.sort), labels(zones.project)]).toEqual([
      ['▲ ascending', '▼ descending'],
      ['include', 'exclude'],
    ]);
    expect([...zones.sort, ...zones.project].every((zone) => zone.field === 'total')).toBe(true);
    const sorted = { ...texts, sort: '{ status: 1 }' };
    const descending = drag.view({ dragged, texts: sorted }).sort[1];
    expect(descending && drag.dropped(descending, dragged, sorted)).toEqual({
      field: 'sort',
      text: '{ status: 1, total: -1 }',
    });
  });

  it('offers remove over Project for a cell of a field in the projection, and empties it', () => {
    const dragged: drag.Dragged = { kind: 'cell', field: 'total', value: 42 };
    const projected = { ...texts, project: '{ total: 1 }' };
    const zones = drag.view({ dragged, texts: projected }).project;
    expect(labels(zones)).toEqual(['include', 'exclude', '✕ remove']);
    const [, , remove] = zones;
    expect(remove && drag.dropped(remove, dragged, projected)).toEqual({ field: 'project', text: '' });
  });

  it('sorts a cell of an expanded array by its dotted path', () => {
    const dragged: drag.Dragged = { kind: 'cell', field: 'items.qty', value: 3, within: 'items' };
    const descending = drag.view({ dragged, texts }).sort[1];
    expect([descending?.field, descending?.tip]).toEqual([
      'items[].qty',
      'items.qty: -1 (after the fields already in the sort)',
    ]);
    expect(descending && drag.dropped(descending, dragged, texts)).toEqual({
      field: 'sort',
      text: '{ "items.qty": -1 }',
    });
  });

  it('changes nothing and says why when the text of the field cannot be read', () => {
    const dragged: drag.Dragged = { kind: 'cell', field: 'a', value: 1 };
    const [equals] = drag.view({ dragged, texts }).filter;
    const result = equals && drag.dropped(equals, dragged, { ...texts, filter: '{ status: ' });
    expect(
      result && 'error' in result && result.error.startsWith('Fix the filter before adding conditions by drag & drop:'),
    ).toBe(true);
    const header: drag.Dragged = { kind: 'header', field: 'a' };
    const [ascending] = drag.view({ dragged: header, texts }).sort;
    const sorted = ascending && drag.dropped(ascending, header, { ...texts, sort: '{ a: ' });
    expect(
      sorted && 'error' in sorted && sorted.error.startsWith('Fix the sort before adding fields by drag & drop:'),
    ).toBe(true);
  });
});
