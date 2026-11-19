import { BSON } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { parsedValue } from '../../../src/features/query/parse';
import { cellOfValue } from '../../../src/features/table/cell-text';
import { columnsOfDocuments } from '../../../src/features/table/detect-columns';
import { rowsOfDocuments, type Cell, type Row } from '../../../src/features/table/rows';
import { canonical, everyType } from '../query/values';

const newId = (): string => '000000000000000000000000';
import { documentOf, people } from './people';

const table: readonly (readonly [string, string, string])[] = [
  ['string', '"paid"', 'string'],
  ['int32', '5', 'number'],
  ['doubleFraction', '42.5', 'number'],
  ['double', '5.0', 'number'],
  ['doubleNaN', 'NaN', 'number'],
  ['int64', '5', 'number'],
  ['int64Big', '9007199254740993', 'number'],
  ['decimal', 'NumberDecimal("12.50")', 'number'],
  ['boolean', 'true', 'boolean'],
  ['null', 'null', 'null'],
  ['undefined', 'undefined', 'null'],
  ['objectId', 'ObjectId("65f1c0de65f1c0de65f1c0de")', 'id'],
  ['date', 'ISODate("2024-03-15T10:30:00.000Z")', 'date'],
  ['timestamp', 'Timestamp({ t: 1700000000, i: 1 })', 'date'],
  ['regex', '/^mario/i', 'regex'],
  ['uuid', 'UUID("0f8fad5b-d9cb-469f-a165-70867728950e")', 'special'],
  ['binary', 'BinData(0, "aGVsbG8=")', 'special'],
  ['minKey', 'MinKey()', 'special'],
  ['maxKey', 'MaxKey()', 'special'],
  ['symbol', 'BSONSymbol("x")', 'special'],
  ['emptyArray', '[0] []', 'array'],
  ['emptyDocument', '{0} {}', 'subdocument'],
];

describe('table.cell-text', () => {
  it('gives the text and the kind of each row of the table', () => {
    for (const [name, written, kind] of table) {
      expect(cellOfValue(everyType[name]), name).toMatchObject({ text: written, kind });
    }
    expect(cellOfValue(['a', 'b'])).toMatchObject({ text: '[2] ["a", "b"]', kind: 'array' });
    expect(cellOfValue(canonical({ color: 'red' }))).toMatchObject({
      text: '{1} { color: "red" }',
      kind: 'subdocument',
    });
  });

  it('cuts a string of 400 characters at 300 and keeps it whole in the tooltip', () => {
    const cell = cellOfValue('x'.repeat(400));
    expect(cell.text).toBe(`"${'x'.repeat(299)}…`);
    expect(cell.tooltip).toBe(`"${'x'.repeat(400)}"`);
  });

  it('draws a missing field apart from null and ""', () => {
    expect(cellOfValue(undefined)).toEqual({ text: '', kind: 'missing' });
    expect(cellOfValue(null).text).toBe('null');
    expect(cellOfValue('').text).toBe('""');
  });

  it('writes a date before 1970 as a date', () => {
    expect(cellOfValue(everyType['dateBefore1970']).text).toBe('ISODate("1969-12-31T23:59:59.000Z")');
  });

  it('shows the four numbers of 5 apart, with their typed forms and types in the tooltip', () => {
    const fives = [
      canonical(new BSON.Int32(5)),
      canonical(BSON.Long.fromNumber(5)),
      canonical(new BSON.Double(5)),
      canonical(BSON.Decimal128.fromString('5')),
    ];
    expect(fives.map((value) => cellOfValue(value))).toMatchObject([
      { text: '5', tooltip: '5', type: 'int' },
      { text: '5', tooltip: 'NumberLong(5)', type: 'long' },
      { text: '5.0', tooltip: 'Double(5)', type: 'double' },
      { text: 'NumberDecimal("5")', tooltip: 'NumberDecimal("5")', type: 'decimal' },
    ]);
  });

  it('writes the values inside an array with their types', () => {
    expect(cellOfValue(canonical([BSON.Long.fromNumber(1), new BSON.Double(2)])).text).toBe(
      '[2] [NumberLong(1), Double(2)]',
    );
  });

  it('gives a text that query.parse reads back as the value with its type', () => {
    const readable = table.filter(([name]) => !['int64', 'int64Big', 'emptyArray', 'emptyDocument'].includes(name));
    for (const [name] of readable) {
      const value = everyType[name]!;
      expect(parsedValue(cellOfValue(value).text, 0, newId), name).toEqual({ ok: true, value });
    }
  });
});

function cellsOf(row: Row, column: string): readonly Cell[] {
  return row.cells.filter((cell) => cell.column === column);
}

describe('table.rows', () => {
  const columns = columnsOfDocuments(people, ['items']);
  const [ada, bob, cy] = rowsOfDocuments(people, columns, 1);

  it('lays Ada out on two sub-rows, her other cells covering both', () => {
    expect(ada!.height).toBe(2);
    expect(cellsOf(ada!, 'items.sku').map((cell) => cell.content)).toEqual([
      { kind: 'value', value: 'A1' },
      { kind: 'value', value: 'B2' },
    ]);
    expect(cellsOf(ada!, 'items.options').map((cell) => cell.content.kind)).toEqual(['missing', 'value']);
    expect(cellsOf(ada!, 'name')).toMatchObject([{ subRow: 0, height: 2 }]);
    expect(cellsOf(ada!, 'items.sku')[1]).toMatchObject({ element: { array: 'items', index: 1 } });
  });

  it("shows Bob's empty items once across the group, with its note", () => {
    expect(bob!.height).toBe(1);
    expect(cellsOf(bob!, 'items')).toMatchObject([
      { span: 4, content: { kind: 'value', value: [] }, note: 'items is not an array of sub-documents here' },
    ]);
  });

  it("shows Cy's 7 across the group on his second sub-row", () => {
    expect(cy!.height).toBe(2);
    expect(cellsOf(cy!, 'items')).toMatchObject([
      { subRow: 1, span: 4, note: 'This element of items is not a sub-document' },
    ]);
  });

  it('shows "unknown" across the columns of address for Bob', () => {
    const rows = rowsOfDocuments(people, columnsOfDocuments(people, ['address']), 1);
    expect(cellsOf(rows[1]!, 'address')).toMatchObject([
      { span: 3, content: { kind: 'value', value: 'unknown' }, note: 'address is not a sub-document here' },
    ]);
  });

  it('gives 25 elements a height of 21, the last saying how many are left out', () => {
    const many = documentOf({ _id: 9, items: Array.from({ length: 25 }, (_, index) => ({ sku: String(index) })) });
    const [row] = rowsOfDocuments([many], columnsOfDocuments([many], ['items']), 1);
    expect(row!.height).toBe(21);
    expect(row!.cells.at(-1)).toMatchObject({ subRow: 20, content: { kind: 'more', count: 5 } });
  });

  it('numbers the rows from the first document of the query', () => {
    expect(rowsOfDocuments(people, columns, 101).map((row) => row.number)).toEqual([101, 102, 103]);
  });

  it('lays two expanded arrays side by side, filling under the shorter one', () => {
    const document = documentOf({
      _id: 1,
      items: [{ sku: 'A' }, { sku: 'B' }],
      payments: [{ n: 1 }, { n: 2 }, { n: 3 }],
    });
    const [row] = rowsOfDocuments([document], columnsOfDocuments([document], ['items', 'payments']), 1);
    expect(row!.height).toBe(3);
    expect(cellsOf(row!, 'payments.n')[2]).toMatchObject({ subRow: 2 });
    expect(row!.cells.find((cell) => cell.column.startsWith('items') && cell.subRow === 2)?.content).toEqual({
      kind: 'filler',
    });
  });
});
