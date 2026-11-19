import { describe, expect, it } from 'vitest';
import { syntaxTokens, type SyntaxRole } from '../../../src/features/query/highlight';

function parts(source: string): [string, SyntaxRole][] {
  return syntaxTokens(source).map((token) => [source.slice(token.from, token.to), token.role]);
}

describe('query.highlight', () => {
  it('gives the 14 tokens of the worked example, in order', () => {
    const source =
      '{ name: /mario/i, age: { $gte: 18 }, _id: ObjectId("65f1c0de65f1c0de65f1c0de"),\n  "address.city": "Milano", ref: "$total", ok: true } // adults';
    expect(parts(source)).toEqual([
      ['name', 'key'],
      ['/mario/i', 'regex'],
      ['age', 'key'],
      ['$gte', 'op'],
      ['18', 'number'],
      ['_id', 'key'],
      ['ObjectId("65f1c0de65f1c0de65f1c0de")', 'oid'],
      ['"address.city"', 'key'],
      ['"Milano"', 'string'],
      ['ref', 'key'],
      ['"$total"', 'ref'],
      ['ok', 'key'],
      ['true', 'bool'],
      ['// adults', 'comment'],
    ]);
  });

  it('reads a slash after a value as a division and where a value starts as a regex', () => {
    expect(parts('{ ratio: 10 / 2 }')).toEqual([
      ['ratio', 'key'],
      ['10', 'number'],
      ['2', 'number'],
    ]);
    expect(parts('{ name: /2/ }')).toEqual([
      ['name', 'key'],
      ['/2/', 'regex'],
    ]);
  });

  it('finds no comment inside a string', () => {
    expect(parts('{ note: "// not a comment" }')).toEqual([
      ['note', 'key'],
      ['"// not a comment"', 'string'],
    ]);
  });

  it('colors a text query.parse refuses up to its end', () => {
    expect(parts('{ status: "pai')).toEqual([
      ['status', 'key'],
      ['"pai', 'string'],
    ]);
  });

  it('takes the argument of a helper with it, and colors every helper', () => {
    expect(parts('NumberLong(5)')).toEqual([['NumberLong(5)', 'number']]);
    expect(parts('ISODate()')).toEqual([['ISODate()', 'date']]);
    expect(parts('[Code("x"), BSONSymbol("y"), new Date(5)]')).toEqual([
      ['Code("x")', 'oid'],
      ['BSONSymbol("y")', 'oid'],
      ['new', 'op'],
      ['Date(5)', 'date'],
    ]);
    expect(parts('/* open')).toEqual([['/* open', 'comment']]);
  });

  it('colors a long filter quickly', () => {
    const source = `{ ${Array.from({ length: 1000 }, (_, index) => `f${String(index)}: ${String(index)}`).join(', ')} }`;
    expect(source.length).toBeGreaterThan(10_000);
    expect(syntaxTokens(source)).toHaveLength(2000);
  });
});
