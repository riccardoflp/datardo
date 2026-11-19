import { describe, expect, it } from 'vitest';
import { schemaSummary } from '../../../src/features/schema/analyze';
import type { SampleResult } from '../../../src/features/schema/sample';
import {
  plan,
  view,
  type SchemaRow,
  type SchemaSectionState,
  type ValuesContent,
} from '../../../src/features/schema/show';
import { dateText, valueText } from '../../../src/features/schema/view/cells';
import type { Json } from '../../../src/shared/engine-request';
import { contextInTab, contextOn, int, schemaDocuments } from './context';

function resultOf(documents: readonly Json[], outOf = documents.length, milliseconds = 12): SampleResult {
  return { summary: schemaSummary(documents), outOf, milliseconds };
}

const workedExample = resultOf(schemaDocuments('worked-example'));

function stateOf(overrides: Partial<SchemaSectionState> = {}): SchemaSectionState {
  return {
    size: 1000,
    expanded: [],
    running: false,
    invalidFilter: false,
    cancelled: false,
    view: false,
    result: workedExample,
    ...overrides,
  };
}

function rowOf(rows: readonly SchemaRow[], label: string): SchemaRow {
  const row = rows.find((each) => each.label === label);
  if (row === undefined) {
    throw new Error(`No row ${label}`);
  }
  return row;
}

function contentOf(row: SchemaRow): ValuesContent | undefined {
  return row.values[0]?.content;
}

describe('schema.show', () => {
  it('shows All 4 documents and a time, and one row per field of the worked example, in its order', () => {
    const shown = view(stateOf());
    expect(shown.toolbar.line).toBe('All 4 documents · 12 ms');
    expect(shown.columns).toEqual(['Field', 'Present', 'Types', 'Values']);
    expect(shown.rows.map((row) => row.name)).toEqual(['_id', 'status', 'total', 'qty', 'address', 'items', 'tags']);
    expect(shown.queryBarButton).toEqual({ label: 'Analyze', element: 'schema.sample@query-bar' });
  });

  it('reads Random sample of 1,000 out of 52,310 documents with Sample at 1,000', () => {
    const documents = Array.from({ length: 1000 }, (_, index) => ({ n: int(index) }));
    const shown = view(stateOf({ result: resultOf(documents, 52_310, 84) }));
    expect(shown.toolbar.line).toBe('Random sample of 1,000 out of 52,310 documents · 84 ms');
    expect(shown.toolbar.sample.sizes).toEqual([
      { size: 100, label: '100', chosen: false },
      { size: 1000, label: '1,000', chosen: true },
      { size: 10_000, label: '10,000', chosen: false },
    ]);
    expect(shown.toolbar.sample).toMatchObject({
      label: 'Sample',
      hint: 'Documents analyzed: a random sample when more match the filter',
      element: 'schema.sample@toolbar',
    });
  });

  it('shows qty at 50%, In 2 of 4, missing in 2, and status at 100%, In all 4', () => {
    const { rows } = view(stateOf());
    expect(rowOf(rows, 'qty').present).toEqual({ part: 0.5, share: '50%', hint: 'In 2 of 4, missing in 2' });
    expect(rowOf(rows, 'status').present).toEqual({ part: 1, share: '100%', hint: 'In all 4' });
  });

  it('shows total with a bar of three types and their shares, and status with string alone', () => {
    const { rows } = view(stateOf());
    const total = rowOf(rows, 'total').types;
    expect(total.bar).toBe(true);
    expect(total.chips.map((chip) => chip.label)).toEqual(['double 50%', 'int 25%', 'null 25%']);
    expect(total.chips[0]).toMatchObject({
      hint: 'Filter on total of type double',
      filter: { element: 'schema.filter-from-value@table', path: 'total', click: { kind: 'type', type: 'double' } },
    });
    expect(rowOf(rows, 'status').types).toMatchObject({ bar: false, chips: [{ label: 'string' }] });
  });

  it('shows the values of status with their shares, and _id as all distinct with three of them', () => {
    const { rows } = view(stateOf());
    const status = contentOf(rowOf(rows, 'status'));
    expect(status?.kind === 'values' && status.values.map((chip) => [chip.text, chip.share])).toEqual([
      ['"paid"', '75%'],
      ['"new"', '25%'],
    ]);
    expect(status?.kind === 'values' && status.values[0]?.hint).toBe('"paid": 3 of 4. Click to filter on it.');
    expect(status?.kind === 'values' && status.more).toBe(undefined);
    const id = contentOf(rowOf(rows, '_id'));
    expect(id?.kind).toBe('all-distinct');
    expect(id?.kind === 'all-distinct' && id.label).toBe('all distinct, e.g.');
    expect(id?.kind === 'all-distinct' && id.values.map((chip) => [chip.text, chip.share])).toEqual([
      ['ObjectId("65f1c0de9a1b2c3d4e5f6a01")', undefined],
      ['ObjectId("65f1c0de9a1b2c3d4e5f6a02")', undefined],
      ['ObjectId("65f1c0de9a1b2c3d4e5f6a03")', undefined],
    ]);
  });

  it('shows tags with 1–2 elements, avg 1.5, the type string and the values "a" 67% and "b" 33%', () => {
    const tags = contentOf(rowOf(view(stateOf()).rows, 'tags'));
    expect(tags?.kind === 'array' && tags.lengths).toBe('1–2 elements, avg 1.5');
    const elements = tags?.kind === 'array' ? tags.elements : undefined;
    expect(elements?.types).toMatchObject({ bar: false, chips: [{ label: 'string' }] });
    const values = elements?.values[0]?.content;
    expect(values?.kind === 'values' && values.values.map((chip) => [chip.text, chip.share])).toEqual([
      ['"a"', '67%'],
      ['"b"', '33%'],
    ]);
    expect(values?.kind === 'values' && values.values[0]?.filter).toEqual({
      element: 'schema.filter-from-value@table',
      path: 'tags',
      click: { kind: 'value', value: 'a' },
    });
  });

  it('shows the fields of address and of the items under them on a click, with their paths on hover', () => {
    const { rows } = view(stateOf());
    const address = rowOf(rows, 'address');
    expect(address.toggle).toEqual({ expanded: false, next: ['address'] });
    expect(contentOf(address)).toEqual({ kind: 'object', fields: '{ 2 fields }' });
    expect(address.values.map((each) => [each.type, each.content.kind])).toEqual([
      ['object', 'object'],
      ['string', 'values'],
    ]);
    const opened = view(stateOf({ expanded: address.toggle?.next ?? [] })).rows;
    expect(rowOf(opened, 'address').toggle?.expanded).toBe(true);
    expect(rowOf(opened, 'address.city')).toMatchObject({
      depth: 1,
      name: 'city',
      present: { share: '100%', hint: 'In all 2' },
    });
    expect(rowOf(opened, 'address.zip')).toMatchObject({
      name: 'zip',
      present: { share: '50%', hint: 'In 1 of 2, missing in 1' },
    });
    const items = view(stateOf({ expanded: ['items'] })).rows;
    const nested = items.filter((row) => row.depth === 1);
    expect(nested.map((row) => [row.name, row.label])).toEqual([
      ['sku', 'items[].sku'],
      ['qty', 'items[].qty'],
    ]);
    expect(rowOf(items, 'items[].sku').types.chips[0]?.filter.path).toBe('items.sku');
    expect(rowOf(rows, 'status').toggle).toBeUndefined();
  });

  it('expands every field with nested fields at every level, and collapses them all', () => {
    const deep = resultOf([{ a: { b: { c: int(1) } }, list: [{ x: { y: int(2) } }], flat: int(3) }]);
    const shown = view(stateOf({ result: deep }));
    expect(shown.toolbar.expandAll.next).toEqual(['a', 'a.b', 'list', 'list[].x']);
    const all = view(stateOf({ result: deep, expanded: shown.toolbar.expandAll.next }));
    expect(all.rows.map((row) => [row.depth, row.name])).toEqual([
      [0, 'a'],
      [1, 'b'],
      [2, 'c'],
      [0, 'list'],
      [1, 'x'],
      [2, 'y'],
      [0, 'flat'],
    ]);
    const none = view(stateOf({ result: deep, expanded: all.toolbar.collapseAll.next }));
    expect(none.rows.map((row) => row.name)).toEqual(['a', 'list', 'flat']);
  });

  it('shows 100 integers from 18 to 77 as a histogram of 13 bars with 18 and 77 under it', () => {
    const documents = Array.from({ length: 100 }, (_, index) => ({ age: int(18 + Math.round((59 * index) / 99)) }));
    const age = contentOf(rowOf(view(stateOf({ result: resultOf(documents) })).rows, 'age'));
    expect(age?.kind).toBe('histogram');
    if (age?.kind !== 'histogram') {
      return;
    }
    expect(age.bars).toHaveLength(13);
    expect([age.smallest, age.largest]).toEqual(['18', '77']);
    expect(Math.max(...age.bars.map((bar) => bar.height))).toBe(1);
    const first = age.bars[0];
    expect(first?.hint).toMatch(/^15 – 20: \d+\. Click to filter on this range\.$/u);
    expect(first?.filter?.click).toEqual({ kind: 'range', from: int(15), to: int(20) });
  });

  it('does not offer a bar of an empty range', () => {
    const documents = [int(0), int(1), int(2), int(3), int(4), int(5), int(6), int(7), int(8), int(9), int(100)];
    const n = contentOf(rowOf(view(stateOf({ result: resultOf(documents.map((each) => ({ n: each }))) })).rows, 'n'));
    const bars = n?.kind === 'histogram' ? n.bars : [];
    expect(bars.some((bar) => bar.count === 0)).toBe(true);
    expect(bars.every((bar) => (bar.count === 0) === (bar.filter === undefined))).toBe(true);
  });

  it('writes +12 more when other values were seen, and +990+ more beyond the thousandth', () => {
    const few = Array.from({ length: 22 }, (_, index) => ({ s: index < 2 ? 'same' : `v${String(index)}` }));
    const s = contentOf(rowOf(view(stateOf({ result: resultOf(few) })).rows, 's'));
    expect(s?.kind === 'values' && s.more).toBe('+11 more');
    const many = Array.from({ length: 1200 }, (_, index) => ({ s: index < 2 ? 'same' : `v${String(index)}` }));
    const t = contentOf(rowOf(view(stateOf({ result: resultOf(many) })).rows, 's'));
    expect(t?.kind === 'values' && t.more).toBe('+990+ more');
  });

  it('hides Validation rules… on a view, where the analysis works, and enables Generate… once a document is shown', () => {
    const onView = view(stateOf({ view: true }));
    expect(onView.toolbar.validationRules).toBeUndefined();
    expect(onView.rows).toHaveLength(7);
    expect(onView.toolbar.generate).toEqual({
      label: 'Generate…',
      enabled: true,
      element: 'transfer.generate@toolbar',
    });
    expect(view(stateOf()).toolbar.validationRules).toEqual({ label: 'Validation rules…' });
    const { result: _none, ...empty } = stateOf();
    expect(view(empty).toolbar.generate.enabled).toBe(false);
    expect(view(stateOf({ result: resultOf([]) })).toolbar.generate.enabled).toBe(false);
  });

  it('shows Analyzing… with the previous table dimmed while a sample is read', () => {
    const shown = view(stateOf({ running: true }));
    expect(shown.toolbar.line).toBe('Analyzing…');
    expect(shown.dimmed).toBe(true);
    expect(shown.rows).toHaveLength(7);
  });

  it('shows All 0 documents and No documents match the filter. when none matches', () => {
    const shown = view(stateOf({ result: resultOf([], 0, 3) }));
    expect(shown.toolbar.line).toBe('All 0 documents · 3 ms');
    expect(shown.message).toBe('No documents match the filter.');
    expect(shown.rows).toEqual([]);
  });

  it('marks a filter that is not valid and keeps the previous table', () => {
    const shown = view(stateOf({ invalidFilter: true }));
    expect(shown).toMatchObject({
      invalidFilter: true,
      message: 'Invalid query syntax — check the highlighted field.',
    });
    expect(shown.rows).toHaveLength(7);
  });

  it('shows the error of the server in place of the table, and Run again after a cancel', () => {
    const shown = view(stateOf({ error: 'not authorized on shop' }));
    expect(shown.message).toBe('not authorized on shop');
    expect(shown.rows).toEqual([]);
    expect(view(stateOf({ cancelled: true })).cancelled).toEqual({
      text: 'Cancelled',
      runAgain: 'Run again',
      element: 'schema.sample@toolbar',
    });
  });

  it('writes the mark of a field with more than 500 names, and the note of a sample with more', () => {
    const wide = Object.fromEntries(Array.from({ length: 600 }, (_, index) => [`f${String(index)}`, int(index)]));
    const nested = view(stateOf({ result: resultOf([{ inner: wide }]) }));
    expect(rowOf(nested.rows, 'inner').moreFields).toBe('(500+ fields)');
    expect(nested.note).toBeUndefined();
    expect(view(stateOf({ result: resultOf([wide]) })).note).toBe(
      'Too many different fields: only the first 500 were analyzed.',
    );
  });

  it('writes values in mongosh syntax, numbers as numbers and dates short', () => {
    expect(valueText({ $numberDouble: '7.0' }, 'double')).toBe('7');
    expect(valueText({ $numberLong: '9007199254740993' }, 'long')).toBe('9007199254740993');
    expect(valueText({ $numberDecimal: '12.50' }, 'decimal')).toBe('12.50');
    expect(dateText(Date.UTC(2024, 2, 1))).toBe('2024-03-01');
    expect(dateText(Date.UTC(2024, 2, 1, 10, 20))).toBe('2024-03-01 10:20');
    expect(dateText(Date.UTC(2024, 2, 1, 10, 20, 30))).toBe('2024-03-01 10:20:30');
    expect(valueText({ $date: { $numberLong: String(Date.UTC(2024, 2, 1)) } }, 'date')).toBe('2024-03-01');
  });

  it('shows the Schema section of the active collection tab', () => {
    const outcome = plan(contextInTab('schema.show'), {});
    expect(outcome.kind === 'run' && outcome.plan.steps).toEqual([
      {
        kind: 'app',
        text: 'show the Schema section of orders',
        action: 'tab.activate',
        args: { tab: 't1', section: 'schema' },
      },
    ]);
    const none = plan(contextOn('schema.show'), {});
    expect(none.kind === 'run' && none.plan.steps).toEqual([]);
  });
});
