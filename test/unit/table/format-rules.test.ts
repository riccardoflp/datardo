/**
 * The Formatting view and its operations (M41): adding a condition rule, editing, reordering and removing rules,
 * hiding formatting, and how the table, its toolbar and its column menu show them.
 */
import { describe, expect, it } from 'vitest';
import {
  isFull,
  newConditionRule,
  plan as addPlan,
  proposedCondition,
  unusedColor,
} from '../../../src/features/table/add-format-rule';
import { view as columnMenu } from '../../../src/features/table/column-menu';
import { columnByKey, columnsOfDocuments } from '../../../src/features/table/detect-columns';
import { editedRules, fieldProblem, plan as editPlan } from '../../../src/features/table/edit-format-rule';
import { withCollectionRules } from '../../../src/features/table/format-scopes';
import { tableFormat } from '../../../src/features/table/format-table';
import { view as formattingView, type FormattingState } from '../../../src/features/table/formatting';
import { rowsOfDocuments } from '../../../src/features/table/rows';
import { view as show, type ShowState } from '../../../src/features/table/show';
import { plan as togglePlan, toggleTitle } from '../../../src/features/table/toggle-formatting';
import { emptyTexts } from '../../../src/features/query/types';
import type { MenuEntry } from '../../../src/features/table/types';
import type { ConnectionView } from '../../../src/shared/connection';
import { noFormatting, writtenRules, type FormatRule } from '../../../src/shared/formatting-rules';
import { initialState, type AppState } from '../../../src/shared/state';
import { connectionId } from '../../../src/shared/ids';
import { contextOf } from '../query/context';
import { condition, documents, value } from './formatting';
import { documentOf, people } from './people';

const where = { connection: 'c-local', database: 'shop', collection: 'orders' };
const local = { id: 'c-local', name: 'Local', engine: 'mongodb' } as unknown as ConnectionView;

/** The app's state with the rules of `shop.orders` given. */
function stateWith(rules: readonly FormatRule[], hidden = false): AppState {
  return {
    ...initialState,
    connections: { ...initialState.connections, saved: [local] },
    table: { ...initialState.table, formatting: { hidden, ...withCollectionRules(noFormatting, where, rules) } },
  };
}

const failed = condition('r1', '{ status: "failed" }', 'red');
const big = condition('r2', '{ amount: { $gt: 1000 } }', 'orange', 'amount');

function entryOf(entries: readonly MenuEntry[], label: string): Extract<MenuEntry, { kind: 'entry' }> | undefined {
  return entries.find(
    (each): each is Extract<MenuEntry, { kind: 'entry' }> => each.kind === 'entry' && each.label === label,
  );
}

describe('table.add-format-rule', () => {
  it('Format cells… on status, with "failed" selected, proposes the cell of status, { status: "failed" }, red', () => {
    expect(newConditionRule('n', [], { field: 'status', value: 'failed' })).toEqual({
      id: 'n',
      field: 'status',
      condition: '{ status: "failed" }',
      color: 'red',
    });
  });

  it('Format cells… on amount with a cell of another column selected proposes { amount: { $exists: true } }', () => {
    expect(proposedCondition('amount', undefined)).toBe('{ amount: { $exists: true } }');
  });

  it('proposes { "address.city": "Milano" } and { n: NumberLong(1204) }', () => {
    expect(proposedCondition('address.city', 'Milano')).toBe('{ "address.city": "Milano" }');
    expect(proposedCondition('n', value('NumberLong(1204)'))).toBe('{ n: NumberLong(1204) }');
  });

  it('Add rule… › Condition… with red and orange there opens a row rule in yellow with an empty condition', () => {
    const rule = newConditionRule('n', [failed, big]);
    expect(rule).toEqual({ id: 'n', condition: '', color: 'yellow' });
    expect(unusedColor([])).toBe('red');
  });

  it('saves a rule only once its condition can be used, last in the collection rules', () => {
    const context = contextOf('table.add-format-rule', stateWith([failed]));
    const empty = writtenRules([{ id: 'n', condition: '', color: 'yellow' }])[0] ?? null;
    expect(addPlan(context, { args: { ...where, rule: empty } })).toMatchObject({
      kind: 'refuse',
      code: 'table.add-format-rule/condition',
      message: 'Type a condition, such as { status: "failed" }.',
    });
    const typed = writtenRules([{ id: 'n', condition: '{ a: 1 }', color: 'yellow' }])[0] ?? null;
    expect(addPlan(context, { args: { ...where, rule: typed } })).toMatchObject({
      kind: 'run',
      plan: {
        steps: [
          {
            text: 'save the formatting rules of Local / shop / orders',
            action: 'table.save-formatting',
            args: { ...where, rules: [{ id: 'r1' }, { id: 'n', condition: '{ a: 1 }' }] },
          },
        ],
      },
    });
  });

  it('with 100 rules in shop.orders adds none: A collection keeps at most 100 formatting rules.', () => {
    const hundred = Array.from({ length: 100 }, (_each, index) => condition(`r${String(index)}`, '{ a: 1 }', 'red'));
    expect(isFull(hundred)).toBe(true);
    const rule = writtenRules([condition('n', '{ a: 2 }', 'red')])[0] ?? null;
    expect(addPlan(contextOf('table.add-format-rule', stateWith(hundred)), { args: { rule } })).toMatchObject({
      kind: 'refuse',
      code: 'table.add-format-rule/too-many',
      message: 'A collection keeps at most 100 formatting rules.',
    });
  });

  it('works through a read-only connection: its plan writes nothing to the deployment', () => {
    const rule = writtenRules([condition('n', '{ a: 1 }', 'red')])[0] ?? null;
    const outcome = addPlan(contextOf('table.add-format-rule', stateWith([])), { args: { rule } });
    expect(outcome).toMatchObject({ kind: 'run', plan: { steps: [{ kind: 'app' }] } });
  });
});

describe('table.edit-format-rule', () => {
  const third = condition('r3', '{ a: 1 }', 'teal');

  it('dragging the third rule above the first makes it the first; Alt+Up on the first changes nothing', () => {
    expect(editedRules([failed, big, third], { kind: 'move', id: 'r3', to: 0 })?.map((rule) => rule.id)).toEqual([
      'r3',
      'r1',
      'r2',
    ]);
    expect(editedRules([failed, big], { kind: 'step', id: 'r1', by: -1 })).toBeUndefined();
  });

  it('unticking a rule keeps it in the list, turned off', () => {
    expect(editedRules([failed], { kind: 'enable', id: 'r1', enabled: false })).toEqual([
      { ...failed, enabled: false },
    ]);
  });

  it('Remove rule removes the rule at once without asking', () => {
    const outcome = editPlan(contextOf('table.edit-format-rule', stateWith([failed, big])), {
      args: { change: { kind: 'remove', id: 'r1' } },
    });
    expect(outcome).toMatchObject({ kind: 'run', plan: { steps: [{ args: { rules: [{ id: 'r2' }] } }] } });
  });

  it('the condition { a: { $where: 1 } } reads $where is not supported in a formatting rule.', () => {
    const rule = writtenRules([{ ...failed, condition: '{ a: { $where: 1 } }' }])[0] ?? null;
    expect(
      editPlan(contextOf('table.edit-format-rule', stateWith([failed])), { args: { change: { kind: 'set', rule } } }),
    ).toMatchObject({
      kind: 'refuse',
      code: 'table.edit-format-rule/condition',
      message: '$where is not supported in a formatting rule.',
    });
  });

  it('Color the cell of $a is refused and the rule left as it was', () => {
    expect(fieldProblem('$a')).toBe('A field can not start with $.');
    const rule = writtenRules([{ ...failed, field: '$a' }])[0] ?? null;
    expect(
      editPlan(contextOf('table.edit-format-rule', stateWith([failed])), { args: { change: { kind: 'set', rule } } }),
    ).toMatchObject({ kind: 'refuse', code: 'table.edit-format-rule/field' });
  });

  it('changing the color to Teal saves it', () => {
    const rule = writtenRules([{ ...failed, color: 'teal' }])[0] ?? null;
    expect(
      editPlan(contextOf('table.edit-format-rule', stateWith([failed])), { args: { change: { kind: 'set', rule } } }),
    ).toMatchObject({ plan: { steps: [{ args: { rules: [{ id: 'r1', color: 'teal' }] } }] } });
  });

  it('the rules of shop.orders on Local are not those of shop.orders on another connection', () => {
    const other = contextOf('table.edit-format-rule', stateWith([failed]), {
      kind: 'collection',
      connection: connectionId('c-other'),
      database: 'shop',
      collection: 'orders',
    });
    expect(editPlan(other, { args: { change: { kind: 'remove', id: 'r1' } } })).toMatchObject({
      kind: 'run',
      plan: { steps: [] },
    });
  });
});

describe('table.toggle-formatting', () => {
  it('Hide formatting takes every color off the table; the head then reads Show formatting', () => {
    expect(togglePlan(contextOf('table.toggle-formatting', stateWith([failed])), {})).toMatchObject({
      plan: { steps: [{ text: 'hide formatting', action: 'table.set-formatting-hidden', args: { hidden: true } }] },
    });
    expect(toggleTitle(true)).toBe('Show formatting');
    const page = documents('{ status: "failed" }');
    expect(tableFormat([failed], page, true, 0).documents[0]?.row).toBeUndefined();
  });

  it('a rule added while formatting is hidden colors nothing until Show formatting', () => {
    const page = documents('{ status: "failed" }');
    expect(tableFormat([failed], page, true, 0).documents[0]?.row).toBeUndefined();
    expect(tableFormat([failed], page, false, 0).documents[0]?.row).toBeDefined();
  });
});

describe('table.formatting', () => {
  const state = (rules: readonly FormatRule[], more: Partial<FormattingState> = {}): FormattingState => ({
    sections: { collection: rules, database: [], connection: [], global: [] },
    off: [],
    names: { database: 'shop', connection: 'Local' },
    problems: new Map(),
    hidden: false,
    documents: [],
    now: 0,
    ...more,
  });

  it('with no rule, the view reads No formatting rules.', () => {
    expect(formattingView(state([])).empty).toBe(
      "No formatting rules. Add one, or use Color by this field or Format cells… in a column header's menu.",
    );
  });

  it('the row rule { status: "failed" } red reads a swatch named Red, Row and its condition, with its tooltip', () => {
    const [line] = formattingView(state([failed])).lines;
    expect(line).toMatchObject({
      swatch: { color: 'red', name: 'Red' },
      target: 'Row',
      summary: '{ status: "failed" }',
    });
    expect(line?.tooltip.split('\n')[0]).toBe('The row when the document matches { status: "failed" }');
  });

  it('a rule that cannot be used shows ⚠ with the reason; the head reads Show formatting while hidden', () => {
    const shown = formattingView(
      state([failed], { hidden: true, problems: new Map([['r1', 'Unknown operator $foo.']]) }),
    );
    expect(shown.lines[0]?.problem).toBe('Unknown operator $foo.');
    expect(shown.head.toggle.label).toBe('Show formatting');
  });

  it('a named rule shows its name, and its tooltip has both', () => {
    const [line] = formattingView(state([{ ...failed, name: 'Failed payments' }])).lines;
    expect(line?.summary).toBe('Failed payments');
    expect(line?.tooltip).toContain('Failed payments\nThe row when the document matches { status: "failed" }');
  });

  it('the open rule has its name, its field, its condition and the eleven colors, its own marked', () => {
    const open = { id: 'r1', name: '', field: '', condition: '{ status: ' };
    const shown = formattingView(state([failed], { open, typedProblem: 'Invalid syntax: …' }));
    expect(shown.open?.condition).toMatchObject({ value: '{ status: ', problem: 'Invalid syntax: …' });
    expect(shown.open?.colors.swatches).toHaveLength(11);
    expect(shown.open?.colors.swatches.filter((swatch) => swatch.chosen).map((swatch) => swatch.name)).toEqual(['Red']);
  });
});

describe('table.rows', () => {
  const page = [
    documentOf({ _id: 1, status: 'failed', amount: 1500 }),
    documentOf({ _id: 2, status: 'ok', amount: 5 }),
  ];
  const columns = columnsOfDocuments(page, []);

  it('colors the row of a failed order and the cell of a big amount, with the line of the tooltip', () => {
    const rules = [failed, big];
    const rows = rowsOfDocuments(page, columns, 1, { format: tableFormat(rules, page, false, 0), rules });
    expect(rows[0]?.color).toMatchObject({
      drawn: { color: 'red', percent: 12 },
      line: 'Formatting: { status: "failed" } (red)',
    });
    expect(rows[0]?.cells.find((cell) => cell.column === 'amount')?.color).toMatchObject({
      drawn: { color: 'orange', percent: 28 },
    });
    expect(rows[1]?.color).toBeUndefined();
  });
});

describe('table.column-menu', () => {
  const column = columnByKey(columnsOfDocuments(people, []), 'name')!;
  const base = {
    layout: {},
    texts: emptyTexts,
    target: { mode: 'find', view: false, readOnly: true } as const,
  };

  it('has Format cells… with its tooltip, through a read-only connection and in Aggregate too', () => {
    const entry = entryOf(columnMenu({ ...base, column, selectedValue: 'Ada' }), 'Format cells…');
    expect(entry).toMatchObject({
      element: 'table.add-format-rule@column-menu',
      tip: 'Color the cells of name when the document matches a condition',
      args: { field: 'name', value: 'Ada' },
    });
    const aggregate = columnMenu({ ...base, column, target: { ...base.target, mode: 'aggregate' } });
    expect(entryOf(aggregate, 'Format cells…')).toBeDefined();
    expect(
      columnMenu({ ...base, column: '#' }).some((each) => each.kind === 'entry' && each.label === 'Format cells…'),
    ).toBe(false);
  });
});

describe('table.show', () => {
  const base: ShowState = {
    target: { mode: 'find', view: false, readOnly: false },
    phase: { kind: 'shown' },
    hasRows: true,
    emptyQuery: true,
    columns: [],
    layout: {},
    paging: { page: 1, pageSize: 50, skip: 0, received: 2, count: { kind: 'counted', count: 2, estimated: false } },
    selected: 0,
  };

  it('the toolbar reads Formatting (2) while 2 rules are on, Formatting (off) while hidden, pressed while shown', () => {
    const button = (on: number, hidden: boolean, shown: boolean) =>
      show({ ...base, formatting: { on, hidden, shown } }).toolbar.buttons.find(
        (each) => each.element === 'nav.toggle-inspector@toolbar',
      );
    expect(button(2, false, true)).toMatchObject({ label: 'Formatting (2)', pressed: true });
    expect(button(0, false, false)).toMatchObject({ label: 'Formatting', pressed: false });
    expect(button(2, true, false)?.label).toBe('Formatting (off)');
  });
});
