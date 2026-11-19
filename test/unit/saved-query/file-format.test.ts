import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { queryFileText } from '../../../src/features/saved-query/file-format';
import { parsedQueryFile } from '../../../src/features/saved-query/parse-file';
import type { QueryFile } from '../../../src/features/saved-query/types';
import { find, pipeline } from './harness';

/** The files Mongoster 0.8.0 wrote with its own `serializeProjectQuery`, kept byte for byte. */
const recorded = join(import.meta.dirname, '..', '..', 'fixtures', 'saved-query', 'mongoster-0.8.0');

function recordedFile(path: string): string {
  return readFileSync(join(recorded, ...path.split('/')), 'utf8');
}

const paidThisMonth: QueryFile = {
  name: 'Paid this month',
  description: 'Orders paid since the first of the month',
  database: 'shop',
  collection: 'orders',
  query: find('{\n  status: "paid",\n  createdAt: { $gte: ISODate("2024-03-01") }\n}', '{ createdAt: -1 }'),
};

const totalsByCustomer: QueryFile = {
  name: 'Totals by customer',
  connection: 'Production',
  database: 'shop',
  collection: 'orders',
  query: pipeline(
    ['$match', '{ status: "paid" }'],
    ['$group', '{\n  _id: "$customer",\n  total: { $sum: "$total" }\n}'],
    ['$sort', '{ total: -1 }', false],
  ),
};

const all: QueryFile = { name: 'All', database: 'shop', collection: 'orders', query: find('') };

describe('saved-query.file-format', () => {
  it('gives the three worked examples exactly their files, byte for byte, with \\n line ends and one at the end', () => {
    expect(queryFileText(paidThisMonth)).toBe(
      [
        '{',
        '  "name": "Paid this month",',
        '  "description": "Orders paid since the first of the month",',
        '  "database": "shop",',
        '  "collection": "orders",',
        '  "filter": [',
        '    "{",',
        '    "  status: \\"paid\\",",',
        '    "  createdAt: { $gte: ISODate(\\"2024-03-01\\") }",',
        '    "}"',
        '  ],',
        '  "sort": "{ createdAt: -1 }"',
        '}',
        '',
      ].join('\n'),
    );
    expect(queryFileText(totalsByCustomer)).toBe(recordedFile('shop/orders/totals-by-customer.json'));
    expect(queryFileText(all)).toBe(
      '{\n  "name": "All",\n  "database": "shop",\n  "collection": "orders",\n  "filter": "{}"\n}\n',
    );
  });

  it('gives back the same query from a file it wrote, and the same bytes when written again', () => {
    for (const query of [paidThisMonth, totalsByCustomer, all]) {
      const text = queryFileText(query);
      const read = parsedQueryFile(text);
      expect(read.ok).toBe(true);
      if (read.ok) {
        expect(queryFileText(read.query)).toBe(text);
      }
    }
    const read = parsedQueryFile(queryFileText(totalsByCustomer));
    expect(read).toEqual({ ok: true, query: totalsByCustomer });
  });

  it('writes the bytes Mongoster 0.8.0 writes for the same query', () => {
    expect(queryFileText(paidThisMonth)).toBe(recordedFile('shop/orders/paid-this-month.json'));
    expect(queryFileText(all)).toBe(recordedFile('shop/orders/all.json'));
    const mine = parsedQueryFile(recordedFile('misc/mine.json'));
    expect(mine.ok && queryFileText(mine.query)).toBe(recordedFile('misc/mine.json'));
  });

  it('writes a filter as typed, with its single quotes and its comment', () => {
    const filter = "{ _id: ObjectId('65f1c0de9a1b2c3d4e5f6a7b') } // mine";
    const text = queryFileText({ ...all, query: find(filter) });
    expect(JSON.parse(text)).toMatchObject({ filter });
  });

  it('writes a filter typed with \\r\\n line ends as an array of lines with no \\r in them', () => {
    const text = queryFileText({ ...all, query: find('{\r\n  a: 1\r\n}') });
    expect(JSON.parse(text)).toMatchObject({ filter: ['{', '  a: 1', '}'] });
    expect(text).not.toContain('\\r');
    expect(text).not.toContain('\r');
  });

  it('holds no connection string, password or identifier of a connection, and no time', () => {
    const text = queryFileText(paidThisMonth);
    expect(Object.keys(JSON.parse(text) as object)).toEqual([
      'name',
      'description',
      'database',
      'collection',
      'filter',
      'sort',
    ]);
    expect(text).not.toMatch(/mongodb:\/\/|c-local|version|"at"/u);
  });

  it('writes a sort or a projection alone, without an empty filter', () => {
    expect(JSON.parse(queryFileText({ ...all, query: find('', '', '{ total: 1 }') }))).toEqual({
      name: 'All',
      database: 'shop',
      collection: 'orders',
      projection: '{ total: 1 }',
    });
  });
});
