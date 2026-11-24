import { describe, expect, it } from 'vitest';
import type { FormatRule } from '../../../src/shared/formatting-rules';
import { columnsOfDocuments } from '../../../src/features/table/detect-columns';
import { colorOfCell, conditionOf, tableFormat, withElement } from '../../../src/features/table/format-table';
import { rowsOfDocuments } from '../../../src/features/table/rows';
import { byField, condition, documents } from './formatting';

const now = Date.UTC(2026, 10, 24);

/** The color of the row and of the cell of `amount` of one document, by the names of their presets. */
function colors(rules: readonly FormatRule[], written: string): readonly [string | undefined, string | undefined] {
  const [format] = tableFormat(rules, documents(written), false, now).documents;
  const row = format?.row?.color;
  return [row, format?.cells.get('amount')?.color ?? row];
}

describe('table.format-table', () => {
  it('gives the colors of each worked example', () => {
    const failedRed = condition('a', '{ status: "failed" }', 'red');
    const overYellow = condition('b', '{ amount: { $gt: 1000 } }', 'yellow');
    expect(colors([failedRed, overYellow], '{ status: "failed", amount: 5000 }')).toEqual(['red', 'red']);
    expect(colors([failedRed, overYellow], '{ status: "ok", amount: 5000 }')).toEqual(['yellow', 'yellow']);
    const overGreen = condition('c', '{ amount: { $gt: 1000 } }', 'green', 'amount');
    expect(colors([failedRed, overGreen], '{ status: "failed", amount: 5000 }')).toEqual(['red', 'green']);
    const off: FormatRule = { ...condition('d', '{}', 'red'), enabled: false };
    expect(colors([off, condition('e', '{}', 'blue')], '{ a: 1 }')).toEqual(['blue', 'blue']);
    expect(
      colors([condition('f', '{ status: "failed" }', 'red', 'amount')], '{ status: "failed", amount: 5 }'),
    ).toEqual([undefined, 'red']);
  });

  it('colors with the first row rule that matches, and nothing when none does', () => {
    const rules = [
      condition('a', '{ status: "failed" }', 'red'),
      condition('b', '{ amount: { $gt: 1000 } }', 'yellow'),
    ];
    expect(colors(rules, '{ status: "ok", amount: 5000 }')[0]).toBe('yellow');
    expect(colors(rules, '{ status: "ok", amount: 5 }')).toEqual([undefined, undefined]);
  });

  it('colors a cell with the first cell rule of its field that matches', () => {
    const rules = [
      condition('a', '{ amount: { $gt: 1000 } }', 'green', 'amount'),
      condition('b', '{ amount: { $gt: 0 } }', 'blue', 'amount'),
    ];
    expect(colors(rules, '{ amount: 5000 }')[1]).toBe('green');
    expect(colors(rules, '{ amount: 5 }')[1]).toBe('blue');
  });

  it('matches a rule of a field of the elements against each element of an expanded array', () => {
    const page = documents('{ items: [ { qty: 1 }, { qty: 7 } ] }');
    const rules = [condition('a', '{ "items.qty": { $gt: 5 } }', 'red', 'items.qty')];
    const [format] = tableFormat(rules, page, false, now).documents;
    const [row] = rowsOfDocuments(page, columnsOfDocuments(page, ['items']), 1);
    const qty = row!.cells.filter((cell) => cell.column === 'items.qty');
    expect(qty.map((cell) => colorOfCell(format!, cell)?.color)).toEqual([undefined, 'red']);
  });

  it('gives no cell color to the elements left out nor to the cells that fill a group', () => {
    const elements = Array.from({ length: 25 }, (_each, index) => `{ qty: ${String(index)} }`).join(', ');
    const page = documents(`{ items: [ ${elements} ], parts: [ { p: 1 }, { p: 2 } ] }`);
    const rules = [condition('a', '{}', 'red', 'items'), condition('b', '{}', 'red', 'parts')];
    const [format] = tableFormat(rules, page, false, now).documents;
    const [row] = rowsOfDocuments(page, columnsOfDocuments(page, ['items', 'parts']), 1);
    const kinds = row!.cells
      .filter((cell) => cell.content.kind === 'more' || cell.content.kind === 'filler')
      .map((cell) => [cell.column, cell.content.kind, colorOfCell(format!, cell)]);
    expect(kinds).toEqual([
      ['items', 'more', undefined],
      ['parts', 'filler', undefined],
    ]);
  });

  it('colors each element by its own value with a field rule of the elements', () => {
    const page = documents('{ items: [ { qty: 0 }, { qty: 10 } ] }');
    const [format] = tableFormat([byField('a', 'items.qty')], page, false, now).documents;
    expect(format?.elements.get('items.qty')?.map((color) => color?.percent)).toEqual([6, 45]);
  });

  it('says why a rule cannot be used, and still applies the others', () => {
    const rules = [
      condition('a', '{ status: ', 'red'),
      condition('b', '{ $expr: { $gt: ["$a", "$b"] } }', 'red'),
      condition('c', '', 'red'),
      condition('d', '{ status: "ok" }', 'green'),
    ];
    const format = tableFormat(rules, documents('{ status: "ok" }'), false, now);
    expect(format.problems.map((problem) => problem.rule)).toEqual(['a', 'b', 'c']);
    expect(format.problems[0]?.message).toMatch(/^Invalid syntax: /u);
    expect(format.problems[1]?.message).toBe('$expr is not supported in a formatting rule.');
    expect(format.problems[2]?.message).toBe('Type a condition, such as { status: "failed" }.');
    expect(format.documents[0]?.row).toMatchObject({ rule: 'd', color: 'green' });
  });

  it('mixes a row at 12 % and a cell at 28 %, and colors nothing while hidden', () => {
    const rules = [condition('a', '{}', 'red'), condition('b', '{}', 'blue', 'amount')];
    const page = documents('{ amount: 1 }');
    const [format] = tableFormat(rules, page, false, now).documents;
    expect(format?.row).toEqual({ rule: 'a', color: 'red', percent: 12 });
    expect(format?.cells.get('amount')).toEqual({ rule: 'b', color: 'blue', percent: 28 });
    const [hidden] = tableFormat(rules, page, true, now).documents;
    expect(hidden?.row).toBeUndefined();
    expect(hidden?.cells.size).toBe(0);
  });

  it('gives a strength its share between 4 % and 22 % of a row, and a scale its second color in percent', () => {
    const page = documents('{ n: 0 }', '{ n: 100 }', '{ n: 25 }');
    const strong = tableFormat([byField('a', 'n', { target: 'row' })], page, false, now).documents;
    expect(strong.map((format) => format.row?.percent)).toEqual([4, 22, 9]);
    const scale = byField('b', 'n', { target: 'row', scale: { from: 'red', to: 'green' } });
    const [, , quarter] = tableFormat([scale], page, false, now).documents;
    expect(quarter?.row).toEqual({ rule: 'b', color: 'red', percent: 15, toward: { color: 'yellow', percent: 50 } });
  });

  it('colors the output of a pipeline, and nothing by a rule about a field it does not have', () => {
    const output = documents('{ _id: "failed", total: 3 }', '{ _id: "ok", total: 9 }');
    const rules = [condition('a', '{ total: { $gt: 5 } }', 'green'), condition('b', '{ status: "failed" }', 'red')];
    const format = tableFormat(rules, output, false, now).documents;
    expect(format.map((each) => each.row?.color)).toEqual([undefined, 'green']);
  });

  it('reads ISODate() in a condition as the time given', () => {
    const matcher = conditionOf('{ at: { $lt: ISODate() } }', now);
    expect(matcher.ok && matcher.matches(documents('{ at: ISODate("2026-01-01") }')[0]!)).toBe(true);
    expect(matcher.ok && matcher.matches(documents('{ at: ISODate("2027-01-01") }')[0]!)).toBe(false);
  });

  it('replaces an array by one element, through sub-documents', () => {
    const [document] = documents('{ a: { items: [1, 2] }, b: 3 }');
    expect(withElement(document!, ['a', 'items'], 1)).toEqual(documents('{ a: { items: 2 }, b: 3 }')[0]);
    expect(withElement(document!, ['b', 'x'], 0)).toBe(document);
  });
});
