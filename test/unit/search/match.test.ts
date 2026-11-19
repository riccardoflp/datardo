import { describe, expect, it } from 'vitest';
import type { JsonObject } from '../../../src/features/query/mongosh/ejson';
import { matches } from '../../../src/features/search/match';
import { wanted } from '../../../src/features/search/text';
import type { SearchMode, SearchResult } from '../../../src/features/search/types';
import { date, decimal, int, long, objectId, recorded, uuid } from './context';

interface Search {
  readonly mode?: SearchMode;
  readonly matchCase?: boolean;
  readonly fieldNames?: boolean;
}

function found(document: JsonObject, typed: string, search: Search = {}): SearchResult | undefined {
  return matches(
    document,
    wanted(typed, search.mode ?? 'contains', search.matchCase ?? false),
    search.fieldNames ?? false,
  );
}

/** Each match as `path kind: before[match]after`. */
function shown(document: JsonObject, typed: string, search: Search = {}): readonly string[] {
  return (found(document, typed, search)?.matches ?? []).map(
    (each) => `${each.path} ${each.kind}: ${each.before}[${each.match}]${each.after}`,
  );
}

const customer = objectId('65f1c0a2b3d4e5f6a7b8c9d0');

describe('search.match', () => {
  it('finds rossi in a name', () => {
    expect(shown({ _id: int(1), name: 'Mario Rossi' }, 'rossi')).toEqual(['name string: Mario [Rossi]']);
  });

  it('finds b-02 in the elements of an array, with their index in the path', () => {
    const document = { _id: int(1), items: [{ sku: 'A-17' }, { sku: 'B-02' }] };
    expect(shown(document, 'b-02')).toEqual(['items.1.sku string: [B-02]']);
  });

  it('finds 42 in a Long and not in 420', () => {
    expect(shown({ _id: int(1), qty: long('42'), total: int(420) }, '42')).toEqual(['qty number: [42]']);
  });

  it('finds 42 in a Decimal128 of 42.0', () => {
    expect(shown({ _id: int(1), price: decimal('42.0') }, '42')).toEqual(['price number: [42.0]']);
  });

  it('finds 42 inside the string A42', () => {
    expect(shown({ _id: int(1), code: 'A42' }, '42')).toEqual(['code string: A[42]']);
  });

  it('finds true as a boolean and inside a string', () => {
    expect(shown({ _id: int(1), active: true, note: 'true story' }, 'true')).toEqual([
      'active boolean: [true]',
      'note string: [true] story',
    ]);
  });

  it('finds a date by its ISO text', () => {
    expect(shown({ _id: int(1), at: date('2024-03-15T10:30:00Z') }, '2024-03-15')).toEqual([
      'at date: [2024-03-15]T10:30:00.000Z',
    ]);
  });

  it('finds an ObjectId in upper case, as the _id', () => {
    expect(shown({ _id: customer }, '65F1C0A2B3D4E5F6A7B8C9D0')).toEqual(['_id objectId: [65f1c0a2b3d4e5f6a7b8c9d0]']);
  });

  it('finds part of an ObjectId of 6 characters or more, and not of 5', () => {
    expect(shown({ _id: int(2), customerId: customer }, 'b3d4e5')).toEqual([
      'customerId objectId: 65f1c0a2[b3d4e5]f6a7b8c9d0',
    ]);
    expect(found({ _id: int(2), customerId: customer }, '65f1c')).toBeUndefined();
  });

  it('matches the text of a number with ^12 in Regex mode', () => {
    expect(shown({ _id: int(3), total: int(1250) }, '^12', { mode: 'regex' })).toEqual(['total number: [12]50']);
  });

  it('finds stat in a field name with Field names', () => {
    expect(shown({ _id: int(4), status: 'paid' }, 'stat', { fieldNames: true })).toEqual([
      'status field-name: [stat]us',
    ]);
  });

  it('never finds null', () => {
    expect(found({ _id: int(5), deletedAt: null }, 'null')).toBeUndefined();
  });

  it('finds the ObjectId of a customer as its _id and in the fields and arrays of other documents', () => {
    const typed = 'ObjectId("65f1c0a2b3d4e5f6a7b8c9d0")';
    expect(shown({ _id: customer }, typed)).toEqual(['_id objectId: [65f1c0a2b3d4e5f6a7b8c9d0]']);
    expect(shown({ _id: int(7), customerId: customer }, typed).map((line) => line.split(' ')[0])).toEqual([
      'customerId',
    ]);
    expect(shown({ _id: int(8), owners: [customer] }, typed).map((line) => line.split(' ')[0])).toEqual(['owners.0']);
  });

  it('finds a UUID by 5d4a-4e7b and by 3F2B8C1E, and not by 5d4a', () => {
    const document = { _id: int(1), token: uuid('3f2b8c1e-5d4a-4e7b-9c6f-1a2b3c4d5e6f') };
    expect(shown(document, '5d4a-4e7b')).toEqual(['token uuid: 3f2b8c1e-[5d4a-4e7b]-9c6f-1a2b3c4d5e6f']);
    expect(found(document, '3F2B8C1E')?.matches[0]?.kind).toBe('uuid');
    expect(found(document, '5d4a')).toBeUndefined();
  });

  it('shows 40 characters on each side of a match in the middle of 500, with … on both sides', () => {
    const value = `${'a'.repeat(240)}mario${'b'.repeat(255)}`;
    const [match] = found({ _id: int(1), value }, 'mario')?.matches ?? [];
    expect(match).toEqual({
      path: 'value',
      kind: 'string',
      before: `…${'a'.repeat(40)}`,
      match: 'mario',
      after: `${'b'.repeat(40)}…`,
    });
  });

  it('cuts a matched text longer than 120 characters', () => {
    const [match] = found({ _id: int(1), value: 'x'.repeat(200) }, '^x+', { mode: 'regex' })?.matches ?? [];
    expect(match?.match).toBe(`${'x'.repeat(120)}…`);
  });

  it('shows a match that spans a new line on one line', () => {
    expect(shown({ _id: int(1), value: 'Mario\nRossi' }, 'o\\sR', { mode: 'regex' })).toEqual([
      'value string: Mari[o R]ossi',
    ]);
  });

  it('keeps 5 matches of a document with 8 and counts 3 more', () => {
    const document: JsonObject = {
      _id: int(1),
      ...Object.fromEntries('abcdefgh'.split('').map((name) => [name, 'mario'] as const)),
    };
    const result = found(document, 'mario');
    expect(result?.matches.map((each) => each.path)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(result?.more).toBe(3);
  });

  it('respects Match case for strings and not for ObjectIds', () => {
    expect(found({ _id: int(1), name: 'mario' }, 'Mario', { matchCase: true })).toBeUndefined();
    expect(found({ _id: customer }, '65F1C0A2B3D4E5F6A7B8C9D0', { matchCase: true })).toBeDefined();
  });

  it('finds 100 with 1e2, and not the number 1 with true', () => {
    expect(shown({ _id: int(1), total: int(100) }, '1e2')).toEqual(['total number: [100]']);
    expect(found({ _id: int(2), flag: int(1) }, 'true')).toBeUndefined();
  });

  it('writes the _id in mongosh syntax', () => {
    expect(found({ _id: customer, name: 'mario' }, 'mario')?.idText).toBe('ObjectId("65f1c0a2b3d4e5f6a7b8c9d0")');
    expect(found({ _id: int(42), name: 'mario' }, 'mario')?.idText).toBe('42');
    expect(found({ _id: 'A-17', name: 'mario' }, 'mario')?.idText).toBe('"A-17"');
    expect(found({ _id: { a: int(1), b: int(2) }, name: 'mario' }, 'mario')?.idText).toBe('{ a: 1, b: 2 }');
  });

  it('matches every type of a document recorded from MongoDB 8.2', () => {
    const [documents] = recorded('find-orders') as readonly (readonly JsonObject[])[];
    const [first] = documents ?? [];
    if (first === undefined) {
      throw new Error('The recorded reply has no document.');
    }
    const kinds = (typed: string): readonly string[] =>
      (found(first, typed)?.matches ?? []).map((each) => `${each.path}:${each.kind}`);
    expect(kinds('42')).toEqual(['qty:number', 'price:number', 'code:code']);
    expect(kinds('^ma')).toEqual(['pattern:regex']);
    expect(kinds('return 42')).toEqual(['code:code']);
    expect(kinds('3f2b8c1e')).toEqual(['token:uuid']);
    expect(kinds('1.5')).toEqual(['ratio:number']);
    expect(kinds('2024-03-15T10:30')).toEqual(['at:date']);
  });
});
