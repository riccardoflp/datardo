import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { csvToDocuments, parseCsv } from '../../../src/features/transfer/csv-read';
import { csvTable, csvValue, plainColumns, toCsv, type CsvColumn } from '../../../src/features/transfer/csv-write';

const column = (key: string, more: Partial<CsvColumn> = {}): CsvColumn => ({
  path: key.split('.'),
  key,
  array: false,
  ...more,
});

const expanded: readonly CsvColumn[] = [
  column('_id'),
  column('name'),
  column('address', { children: [column('address.city')] }),
  column('items', { array: true, children: [column('items.sku'), column('items.qty')] }),
];

describe('transfer.csv-write', () => {
  it('writes each value of the table of examples as its cell', () => {
    expect(csvValue({ $date: { $numberLong: '0' } })).toBe('1970-01-01T00:00:00.000Z');
    expect(csvValue({ a: 1 })).toBe('{"a":1}');
    expect(csvValue([1, 'x'])).toBe('[1,"x"]');
    expect(csvValue({ $oid: '64b000000000000000000001' })).toBe('64b000000000000000000001');
    expect(csvValue({ $numberDecimal: '1.50' })).toBe('1.50');
    expect(csvValue(null)).toBe('');
    expect(csvValue(true)).toBe('true');
    expect(
      toCsv([
        ['a', 'b'],
        ['1', 'x,y'],
      ]),
    ).toBe('a,b\r\n1,"x,y"\r\n');
    expect(toCsv([[' padded']])).toBe('" padded"\r\n');
    expect(toCsv([['say "hi"']])).toBe('"say ""hi"""\r\n');
  });

  it('gives one row per element of an expanded array, the other values repeated', () => {
    const document = { _id: 1, name: 'a', address: { city: 'Rome' }, items: [{ sku: 'x', qty: 1 }, { sku: 'y' }] };
    expect(csvTable([document], expanded)).toEqual([
      ['_id', 'name', 'address.city', 'items.sku', 'items.qty'],
      ['1', 'a', 'Rome', 'x', '1'],
      ['1', 'a', 'Rome', 'y', ''],
    ]);
  });

  it('gives three documents four rows with nothing expanded', () => {
    const documents = [{ _id: 1 }, { _id: 2, b: 'x' }, { _id: 3 }];
    expect(csvTable(documents, plainColumns(documents))).toHaveLength(4);
  });

  it('gives a document whose expanded array is empty one row, its columns empty', () => {
    expect(csvTable([{ _id: 1, name: 'a', items: [] }], expanded)).toEqual([
      ['_id', 'name', 'address.city', 'items.sku', 'items.qty'],
      ['1', 'a', '', '', ''],
    ]);
  });

  it('leaves out a hidden column and follows the order chosen', () => {
    const chosen = [column('name'), column('_id')];
    expect(csvTable([{ _id: 1, name: 'a', secret: 's' }], chosen)).toEqual([
      ['name', '_id'],
      ['a', '1'],
    ]);
  });
});

describe('transfer.csv-read', () => {
  const value = (cell: string, header = 'v'): unknown => csvToDocuments([[header], [cell]])[0]?.[header];

  it('reads each cell of the table of examples as its value', () => {
    expect(value('00123')).toBe('00123');
    expect(value('12345678901234567890')).toEqual({ $numberLong: '12345678901234567890' });
    expect(value('1e3')).toBe(1000);
    expect(value('2024-01-02')).toBe('2024-01-02');
    expect(value('2024-01-02T03:04:05Z')).toEqual({ $date: '2024-01-02T03:04:05Z' });
    expect(value('{nope')).toBe('{nope');
    expect(
      csvToDocuments([
        ['a.b', 'a.c', 'd'],
        ['1', '', 'x'],
      ]),
    ).toEqual([{ a: { b: 1 }, d: 'x' }]);
    expect(csvToDocuments(parseCsv('a,b\r\n,\r\n'))).toEqual([{}]);
    expect(value('64b000000000000000000001', 'ref')).toBe('64b000000000000000000001');
    expect(value('64b000000000000000000001', '_id')).toEqual({ $oid: '64b000000000000000000001' });
    expect(() =>
      csvToDocuments([
        ['a', 'b'],
        ['1', '2', '3'],
      ]),
    ).toThrow('Row 2 has 3 fields, the header has 2');
    expect(csvToDocuments(parseCsv(''))).toEqual([]);
  });

  it('reads LF, CR and CRLF alike, and a last row without a new line', () => {
    const rows = [
      ['a', 'b'],
      ['1', '2'],
    ];
    expect(parseCsv('a,b\n1,2')).toEqual(rows);
    expect(parseCsv('a,b\r1,2\r')).toEqual(rows);
    expect(parseCsv('﻿a,b\r\n1,2\r\n\r\n')).toEqual(rows);
  });

  it('reads doubled quotes as one, and says an open quote at the end', () => {
    expect(parseCsv('"a ""quoted"" word"')).toEqual([['a "quoted" word']]);
    expect(parseCsv('a"b,c')).toEqual([['a"b', 'c']]);
    expect(() => parseCsv('"open')).toThrow('Unterminated quoted field');
  });

  it('reads the table written as CSV back with the same values', () => {
    const documents = [
      { _id: { $oid: '64b000000000000000000001' }, n: 42, at: { $date: '2024-01-02T03:04:05.000Z' }, tags: ['a', 'b'] },
      { _id: { $oid: '64b000000000000000000002' }, n: 1.5, ok: true, note: 'x, "y"' },
    ];
    const text = toCsv(csvTable(documents, plainColumns(documents)));
    expect(csvToDocuments(parseCsv(text))).toEqual(documents);
  });

  it('reads the recorded sample', () => {
    const text = readFileSync('test/fixtures/transfer/orders.csv', 'utf8');
    expect(csvToDocuments(parseCsv(text))).toEqual([
      { _id: { $oid: '64b000000000000000000001' }, customer: { name: 'Ada', city: 'Rome' }, total: 12.5, paid: true },
      { _id: { $oid: '64b000000000000000000002' }, customer: { name: 'Lin "Li"' }, total: 7, note: 'two\nlines' },
    ]);
  });
});
