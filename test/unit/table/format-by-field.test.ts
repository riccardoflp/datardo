/**
 * Formatting by a field's values (M42): a field rule added by **Color by this field** or **By field…**, and changed in
 * its open rule, with the table and the legend that follow.
 */
import { describe, expect, it } from 'vitest';
import { newFieldRule, plan as colorPlan } from '../../../src/features/table/color-by-field';
import {
  editedFieldRule,
  endOfText,
  isFieldRefusal,
  plan as editFieldPlan,
  type FieldChange,
} from '../../../src/features/table/edit-field-rule';
import { colorOfValue, fieldOnPage, legendOfRule, valueColors } from '../../../src/features/table/format-field';
import { withCollectionRules } from '../../../src/features/table/format-scopes';
import { tableFormat } from '../../../src/features/table/format-table';
import { view as formattingView, type FormattingState } from '../../../src/features/table/formatting';
import { fieldOpenView, pageEnds } from '../../../src/features/table/parts/field-rule-view';
import { noFormatting, writtenRules, type FieldRule, type FormatRule } from '../../../src/shared/formatting-rules';
import { initialState, type AppState } from '../../../src/shared/state';
import type { ConnectionView } from '../../../src/shared/connection';
import { contextOf, now } from '../query/context';
import { byField, condition, documents } from './formatting';

const where = { connection: 'c-local', database: 'shop', collection: 'orders' };
const local = { id: 'c-local', name: 'Local', engine: 'mongodb' } as unknown as ConnectionView;

function stateWith(rules: readonly FormatRule[]): AppState {
  return {
    ...initialState,
    connections: { ...initialState.connections, saved: [local] },
    table: { ...initialState.table, formatting: { hidden: false, ...withCollectionRules(noFormatting, where, rules) } },
  };
}

/** A field rule changed, failing the test when the change is refused. */
function edited(rule: FieldRule, change: FieldChange): FieldRule {
  const result = editedFieldRule(rule, change, now);
  if (isFieldRefusal(result)) {
    throw new Error(result.message);
  }
  return result;
}

const orders = documents(
  '{ _id: 1, status: "ok", amount: 12 }',
  '{ _id: 2, status: "failed", amount: 480 }',
  '{ _id: 3, status: "ok", amount: 50 }',
  '{ _id: 4, amount: 7 }',
);

describe('table.color-by-field', () => {
  it('Color by this field on status adds the row rule by status in Automatic (A color per value)', () => {
    const rule = newFieldRule('s', [], 'status', orders);
    expect(rule).toEqual({ id: 's', kind: 'field', field: 'status', target: 'row', mode: 'auto' });
    const open = fieldOpenView(rule, { field: 'status', pin: '' }, { documents: orders, now });
    expect(open.mode.options[0]?.label).toBe('Automatic (A color per value)');
    const rows = tableFormat([rule], orders, false, now).documents.map((each) => each.row?.color);
    expect(rows[0]).toBeDefined();
    expect(rows[1]).toBeDefined();
    expect(rows[0]).not.toBe(rows[1]);
    expect(rows[2]).toBe(rows[0]);
    expect(rows[3]).toBeUndefined();
    expect(valueColors).toContain(rows[0]);
    expect(valueColors).toContain(rows[1]);
    const [line] = formattingView(stateOf([rule])).lines;
    expect(line?.summary).toBe('by status');
    const saved = colorPlan(contextOf('table.color-by-field', stateWith([])), {
      args: { rule: writtenRules([rule])[0] ?? null },
    });
    expect(saved).toMatchObject({
      kind: 'run',
      plan: { steps: [{ text: 'save the formatting rules of Local / shop / orders' }] },
    });
  });

  it('Color by this field on amount next adds a cell rule: a scale of blue between the ends of the page', () => {
    const status = newFieldRule('s', [], 'status', orders);
    const amount = newFieldRule('a', [status], 'amount', orders);
    expect(amount).toMatchObject({ target: 'cell', mode: 'auto', min: 7, max: 480 });
    const [first, second] = tableFormat([status, amount], orders, false, now).documents;
    expect(first?.cells.get('amount')).toMatchObject({ color: 'blue', percent: 6 });
    expect(second?.cells.get('amount')).toMatchObject({ color: 'blue', percent: 45 });
  });

  it('a field rule wins over a later condition rule, and a condition rule before it wins over it', () => {
    const page = documents('{ status: "ok", n: 1 }', '{ n: 2 }', '{ status: "failed" }');
    const byStatus = byField('s', 'status', { target: 'row' });
    const rows = tableFormat([byStatus, condition('p', '{ n: 2 }', 'purple')], page, false, now).documents;
    const ok = colorOfValue(byStatus, fieldOnPage(byStatus, page), 'ok');
    expect(rows[0]?.row?.color).toBe(ok?.color);
    expect(rows[1]?.row?.color).toBe('purple');
    const cells = tableFormat(
      [condition('f', '{ status: "failed" }', 'red', 'status'), byField('c', 'status')],
      page,
      false,
      now,
    ).documents;
    expect(cells[2]?.cells.get('status')?.color).toBe('red');
  });

  it('by items.qty colors element 0 at the faint end of the scale and element 1 at the strong end', () => {
    const page = documents('{ items: [ { qty: 0 }, { qty: 10 } ] }');
    const rule = newFieldRule('q', [], 'items.qty', page);
    const [format] = tableFormat([{ ...rule, target: 'cell' as const }], page, false, now).documents;
    expect(format?.elements.get('items.qty')?.map((color) => color?.percent)).toEqual([6, 45]);
  });

  it('Color by this field on flag colors true green and false red', () => {
    const page = documents('{ flag: true }', '{ flag: false }');
    const rule = newFieldRule('f', [], 'flag', page);
    expect(tableFormat([rule], page, false, now).documents.map((each) => each.row?.color)).toEqual(['green', 'red']);
  });

  it('By field… with the Field left empty adds nothing: the rule is refused as /field', () => {
    const empty = newFieldRule('e', [], '', orders);
    const refused = colorPlan(contextOf('table.color-by-field', stateWith([])), {
      args: { rule: writtenRules([empty])[0] ?? null },
    });
    expect(refused).toMatchObject({ kind: 'refuse', code: 'table.color-by-field/field' });
  });

  it('the 101st rule of the collection is refused', () => {
    const rules = Array.from({ length: 100 }, (_each, index) => condition(`r${String(index)}`, '{}', 'red'));
    const refused = colorPlan(contextOf('table.color-by-field', stateWith(rules)), {
      args: { rule: writtenRules([byField('n', 'status')])[0] ?? null },
    });
    expect(refused).toMatchObject({ kind: 'refuse', code: 'table.color-by-field/too-many' });
  });
});

function stateOf(rules: readonly FormatRule[]): FormattingState {
  return {
    sections: { collection: rules, database: [], connection: [], global: [] },
    off: [],
    names: { database: 'shop', connection: 'Local' },
    problems: new Map(),
    hidden: false,
    documents: orders,
    now,
  };
}

describe('table.edit-field-rule', () => {
  const flags = documents('{ flag: true }', '{ flag: false }');

  it('Swap colors on a rule of flag makes true red and false green', () => {
    const swapped = edited(byField('f', 'flag', { target: 'row' }), { kind: 'swap' });
    expect(tableFormat([swapped], flags, false, now).documents.map((each) => each.row?.color)).toEqual([
      'red',
      'green',
    ]);
    expect(edited(swapped, { kind: 'swap' }).scale).toBeUndefined();
  });

  it('From this page sets the ends to those of the page, and they stay on the next page', () => {
    const rule = byField('a', 'amount', { mode: 'scale', min: 0, max: 200 });
    const page = documents('{ amount: 12 }', '{ amount: 480 }');
    const taken = edited(rule, { kind: 'from-page', ends: pageEnds(rule, page) });
    expect(taken).toMatchObject({ min: 12, max: 480 });
    expect(fieldOnPage(taken, documents('{ amount: 1 }', '{ amount: 3 }'))).toMatchObject({ min: 12, max: 480 });
  });

  it('the end abc is refused and leaves the ends; ISODate("2024-01-01T00:00:00Z") is taken on a scale of dates', () => {
    const rule = byField('d', 'at', { mode: 'scale', min: 0, max: 10 });
    const refused = editedFieldRule(rule, { kind: 'end', end: 'min', text: 'abc' }, now);
    expect(refused).toMatchObject({ code: 'table.edit-field-rule/end' });
    expect(endOfText('ISODate("2024-01-01T00:00:00Z")', now)).toBe(Date.UTC(2024, 0, 1));
    expect(edited(rule, { kind: 'end', end: 'min', text: 'ISODate("2024-01-01T00:00:00Z")' }).min).toBe(
      Date.UTC(2024, 0, 1),
    );
    const open = fieldOpenView(rule, { field: 'at', min: 'abc', pin: '' }, { documents: [], now });
    expect(open.scale?.min.problem).toBe('An end is a number or a date, such as 0 or ISODate("2024-01-01T00:00:00Z").');
    const refusedPlan = editFieldPlan(contextOf('table.edit-field-rule', stateWith([rule])), {
      args: { id: 'd', change: { kind: 'end', end: 'min', text: 'abc' } },
    });
    expect(refusedPlan).toMatchObject({ kind: 'refuse', code: 'table.edit-field-rule/end' });
  });

  it('pins "failed" to red: first in the legend with the pin mark, no other value red; Unpin gives it back', () => {
    const page = documents('{ s: "ok" }', '{ s: "ok" }', '{ s: "failed" }', '{ s: "late" }');
    const rule = byField('s', 's', { mode: 'values' });
    const pinned = edited(rule, { kind: 'pin', value: '"failed"', color: 'red' });
    const legend = legendOfRule(pinned, page);
    expect(legend.entries[0]).toMatchObject({ text: '"failed"', pinned: true, paint: { color: 'red' } });
    expect(legend.entries.slice(1).some((entry) => entry.paint.color === 'red')).toBe(false);
    const open = fieldOpenView(pinned, { field: 's', pin: '', pinning: '"failed"' }, { documents: page, now });
    expect(open.legend.lines[0]?.pinning?.unpin?.label).toBe('Unpin');
    expect(open.legend.lines[0]?.pinning?.swatches).toHaveLength(11);
    const unpinned = edited(pinned, { kind: 'unpin', value: '"failed"' });
    expect(unpinned.pinned).toBeUndefined();
    expect(legendOfRule(unpinned, page).entries.find((entry) => entry.text === '"failed"')?.pinned).toBe(false);
  });

  it('Pin a value… "gone" adds "gone" to the legend with the count 0; a value it cannot read is refused', () => {
    const page = documents('{ s: "ok" }');
    const pinned = edited(byField('s', 's', { mode: 'values' }), { kind: 'pin-value', text: '"gone"' });
    expect(legendOfRule(pinned, page).entries).toContainEqual(expect.objectContaining({ text: '"gone"', count: 0 }));
    expect(editedFieldRule(pinned, { kind: 'pin-value', text: '{ a: ' }, now)).toMatchObject({
      code: 'table.edit-field-rule/value',
    });
  });

  it('keeps 100 pinned values at most', () => {
    const pinned = Array.from({ length: 100 }, (_each, index) => ({ value: String(index), color: 'red' as const }));
    const rule = byField('s', 's', { mode: 'values', pinned });
    expect(editedFieldRule(rule, { kind: 'pin', value: '"x"', color: 'blue' }, now)).toEqual({
      code: 'table.edit-field-rule/too-many-pins',
      message: 'A rule keeps at most 100 pinned values.',
    });
  });

  it('Palette › Shades of blue colors the values that are not pinned in shades of blue', () => {
    const page = documents('{ s: "a" }', '{ s: "b" }', '{ s: "c" }');
    const rule = edited(byField('s', 's', { mode: 'values', pinned: [{ value: '"c"', color: 'red' }] }), {
      kind: 'palette',
      palette: 'blue',
    });
    const colors = legendOfRule(rule, page).entries.map((entry) => entry.paint.color);
    expect(colors).toEqual(['red', 'blue', 'blue']);
    expect(edited(rule, { kind: 'palette', palette: 'all' }).palette).toBeUndefined();
  });

  it('Color › The whole row colors the rows by the value instead of the cell', () => {
    const page = documents('{ flag: true }');
    const row = edited(byField('f', 'flag'), { kind: 'target', target: 'row' });
    const [format] = tableFormat([row], page, false, now).documents;
    expect(format?.row?.color).toBe('green');
    expect(format?.cells.get('flag')).toBeUndefined();
  });

  it('saves the section the rule is in, and refuses a field that is empty or starts with $', () => {
    const rule = byField('f', 'flag');
    const context = contextOf('table.edit-field-rule', stateWith([rule]));
    expect(editFieldPlan(context, { args: { id: 'f', change: { kind: 'swap' } } })).toMatchObject({
      kind: 'run',
      plan: {
        steps: [{ text: 'save the formatting rules of Local / shop / orders', action: 'table.save-formatting' }],
      },
    });
    expect(editFieldPlan(context, { args: { id: 'f', change: { kind: 'field', field: '$x' } } })).toMatchObject({
      kind: 'refuse',
      code: 'table.edit-field-rule/field',
    });
  });
});
