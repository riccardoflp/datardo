import { describe, expect, it } from 'vitest';
import {
  callRequest,
  collectionNames,
  cursorMethodProblem,
  cursorRead,
  dottedCollection,
  isCollectionMethod,
  isDatabaseMethod,
  printedLine,
  resultDocuments,
  runtime,
  useDatabase,
  type CursorCall,
  type PlaygroundCall,
} from '../../../src/features/playground/runtime';
import { pipelineOf } from '../../../src/features/playground/runtime/calls';

function call(overrides: Partial<PlaygroundCall>): PlaygroundCall {
  return {
    on: 'collection',
    database: 'shop',
    collection: 'orders',
    method: 'find',
    arguments: [],
    scriptDatabase: 'shop',
    ...overrides,
  };
}

const findCursor: CursorCall = {
  id: 1,
  of: 'find',
  database: 'shop',
  collection: 'orders',
  arguments: [{ status: 'paid' }],
  shape: [
    { method: 'sort', arguments: [{ total: { $numberInt: '-1' } }] },
    { method: 'limit', arguments: [{ $numberInt: '3' }] },
  ],
};

describe('playground.runtime', () => {
  it('has db and the BSON types, and no require, process, timers or fetch', () => {
    const names = runtime({ database: 'shop' });
    expect(names.database).toBe('shop');
    expect(names.names).toEqual(expect.arrayContaining(['db', 'use', 'print', 'printjson', 'console', 'sleep']));
    expect(names.types).toEqual(expect.arrayContaining(['ObjectId', 'ISODate', 'NumberDecimal', 'Timestamp', 'EJSON']));
    for (const absent of ['setTimeout', 'require', 'process', 'fetch']) {
      expect(names.absent).toContain(absent);
      expect(names.names).not.toContain(absent);
    }
  });

  it('answers use("shop") with switched to db shop, and refuses a name that is not a string', () => {
    expect(useDatabase('shop')).toEqual({ kind: 'switched', database: 'shop', reply: 'switched to db shop' });
    expect(useDatabase(3)).toEqual({ kind: 'error', message: 'use(): the database name is a string' });
  });

  it('reads a shaped find cursor with one find', () => {
    const read = cursorRead(findCursor, 'toArray', 'shop');
    expect(read).toMatchObject({ on: 'cursor', database: 'shop', collection: 'orders', method: 'toArray' });
    expect(read.cursor?.shape.map((each) => each.method)).toEqual(['sort', 'limit']);
    expect(cursorRead(findCursor, 'size', 'shop').method).toBe('count');
  });

  it('refuses hint on an aggregation cursor, and knows the methods of a find cursor', () => {
    expect(cursorMethodProblem({ of: 'aggregate' }, 'hint')).toBe('cursor.hint() is not available on this cursor');
    expect(cursorMethodProblem({ of: 'find' }, 'hint')).toBeUndefined();
    expect(cursorMethodProblem({ of: 'find' }, 'itcount')).toBeUndefined();
    expect(cursorMethodProblem({ of: 'find' }, 'nope')).toBe('cursor.nope() is not available on this cursor');
  });

  it('takes the stages of aggregate as separate arguments', () => {
    const stages = [{ $match: { status: 'paid' } }, { $count: 'n' }];
    expect(pipelineOf(call({ method: 'aggregate', arguments: stages }))).toEqual(stages);
    expect(pipelineOf(call({ method: 'aggregate', arguments: [stages] }))).toEqual(stages);
  });

  it('counts with countDocuments, and inserts with one of the two inserts', () => {
    expect(callRequest(call({ method: 'count', arguments: [{}] })).method).toBe('countDocuments');
    expect(callRequest(call({ method: 'insert', arguments: [[{ a: 1 }]] })).method).toBe('insertMany');
    expect(callRequest(call({ method: 'insert', arguments: [{ a: 1 }] })).method).toBe('insertOne');
  });

  it('sends a command by its name, and adminCommand to admin', () => {
    expect(
      callRequest({
        on: 'database',
        database: 'shop',
        method: 'runCommand',
        arguments: ['ping'],
        scriptDatabase: 'shop',
      }),
    ).toEqual({
      engine: 'mongodb',
      database: 'shop',
      method: 'runCommand',
      arguments: [{ ping: { $numberInt: '1' } }],
    });
    expect(
      callRequest(call({ on: 'database', method: 'adminCommand', arguments: [{ listDatabases: 1 }] })).database,
    ).toBe('admin');
  });

  it('reads db.getSiblingDB("archive").orders in archive', () => {
    expect(callRequest(call({ database: 'archive', method: 'countDocuments' }))).toMatchObject({
      database: 'archive',
      collection: 'orders',
    });
  });

  it('takes any other name of db as a collection, dotted names too', () => {
    expect(isDatabaseMethod('getSiblingDB', false)).toBe(true);
    expect(isDatabaseMethod('orders', false)).toBe(false);
    expect(isDatabaseMethod('getSession', false)).toBe(false);
    expect(isDatabaseMethod('getSession', true)).toBe(true);
    expect(isCollectionMethod('findOneAndUpdate')).toBe(true);
    expect(isCollectionMethod('archive')).toBe(false);
    expect(dottedCollection('logs', 'archive')).toBe('logs.archive');
  });

  it('prints strings as they are and values in mongosh syntax', () => {
    const line = printedLine(
      [
        { kind: 'string', text: 'total' },
        { kind: 'value', value: { $numberLong: '5' } },
        { kind: 'value', value: { a: { $numberInt: '1' } } },
      ],
      'line',
    );
    expect(line).toBe('total NumberLong(5) { a: 1 }');
    expect(printedLine([{ kind: 'cursor' }, { kind: 'mongo' }], 'line')).toBe('[cursor] [Mongo]');
  });

  it('prints printjson on several lines', () => {
    const long = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`field${String(index)}`, 'value']));
    expect(printedLine([{ kind: 'value', value: long }], 'pretty').split('\n').length).toBeGreaterThan(1);
  });

  it('answers getCollectionNames sorted', () => {
    expect(collectionNames([{ name: 'stock' }, { name: 'orders' }, { type: 'view' }])).toEqual(['orders', 'stock']);
  });

  it('shows 200 documents of a cursor', () => {
    expect(resultDocuments).toBe(200);
  });
});
