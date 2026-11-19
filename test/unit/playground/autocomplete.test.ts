import { describe, expect, it } from 'vitest';
import {
  collectionsRequest,
  completions,
  sampleRequest,
  type CompletionHints,
} from '../../../src/features/playground/autocomplete';

const hints: CompletionHints = {
  defaultDatabase: 'shop',
  collections: { shop: ['order-items', 'orders', 'users'], archive: ['old-orders'] },
  fields: {
    'shop.orders': [
      { path: 'status', types: ['string'], ratio: 1, values: [{ value: 'paid', count: 3 }] },
      { path: 'total', types: ['double'], ratio: 1, values: [] },
    ],
  },
  connected: true,
};

function at(textWithCaret: string, given: CompletionHints = hints): ReturnType<typeof completions> {
  const offset = textWithCaret.indexOf('|');
  return completions(textWithCaret.replace('|', ''), offset, given);
}

function labels(textWithCaret: string, given: CompletionHints = hints): readonly string[] {
  return at(textWithCaret, given).items.map((each) => each.label);
}

const databaseMethods = [
  'getCollection',
  'getCollectionNames',
  'getCollectionInfos',
  'getName',
  'getSiblingDB',
  'getMongo',
  'aggregate',
  'runCommand',
  'adminCommand',
  'stats',
  'serverStatus',
  'version',
  'currentOp',
  'createCollection',
  'createView',
  'dropDatabase',
];

describe('playground.autocomplete', () => {
  it('lists the collections then the methods of db after db.', () => {
    const found = at('db.|');
    expect(found.items.map((each) => each.label)).toEqual(['order-items', 'orders', 'users', ...databaseMethods]);
    expect(found.items[0]?.insert).toBe('getCollection("order-items")');
    expect(found.needs).toEqual([]);
  });

  it('lists the methods of a collection that match what was typed', () => {
    expect(labels('db.orders.fi|')).toEqual([
      'find',
      'findOne',
      'findOneAndUpdate',
      'findOneAndReplace',
      'findOneAndDelete',
    ]);
  });

  it('inserts a method with its brackets and the caret inside', () => {
    const find = at('db.orders.fi|').items[0];
    expect(find?.insert).toBe('find({ })');
    expect(find?.cursor).toBe('find({ '.length);
  });

  it('suggests the fields of the sample in a filter', () => {
    expect(labels('db.orders.find({ sta| })')).toContain('status');
  });

  it('lists the methods of a cursor, in order', () => {
    expect(labels('db.orders.find({ status: "paid" }).|')).toEqual([
      'sort',
      'limit',
      'skip',
      'project',
      'toArray',
      'count',
      'forEach',
      'map',
      'hint',
      'collation',
      'maxTimeMS',
      'explain',
      'hasNext',
      'next',
      'itcount',
    ]);
  });

  it('suggests the fields as for a sort in sort()', () => {
    expect(labels('db.orders.find({}).sort({ | })')).toEqual(expect.arrayContaining(['status', 'total']));
  });

  it('lists the methods of a session held in a variable', () => {
    expect(labels('const s = db.getMongo().startSession(); s.|')).toEqual([
      'getDatabase',
      'startTransaction',
      'commitTransaction',
      'abortTransaction',
      'withTransaction',
      'endSession',
      'inTransaction',
      'hasEnded',
      'getSessionId',
      'getClusterTime',
      'getOperationTime',
      'getMongo',
    ]);
  });

  it('lists the collections of the database a session names', () => {
    expect(labels('const s = db.getMongo().startSession(); s.getDatabase("archive").|')).toEqual([
      'old-orders',
      ...databaseMethods,
    ]);
  });

  it('lists the methods of the connection', () => {
    expect(labels('db.getMongo().|')).toEqual(['startSession', 'getDB', 'getDBNames', 'getDBs']);
  });

  it('suggests nothing after a . in a comment', () => {
    expect(labels('// db.|')).toEqual([]);
  });

  it('lists the collections of archive after use("archive")', () => {
    expect(labels('use("archive")\ndb.|')[0]).toBe('old-orders');
  });

  it('asks for the collections and a sample it does not know yet, only when connected', () => {
    const empty: CompletionHints = { defaultDatabase: 'shop', collections: {}, fields: {}, connected: true };
    expect(at('db.|', empty).needs).toEqual([{ kind: 'collections', database: 'shop' }]);
    expect(at('db.orders.find({ | })', empty).needs).toEqual([
      { kind: 'sample', database: 'shop', collection: 'orders' },
    ]);
    const offline = { ...empty, connected: false };
    expect(at('db.|', offline)).toMatchObject({ needs: [] });
    expect(labels('db.|', offline)).toEqual(databaseMethods);
    expect(at('db.orders.find({ | })', offline).needs).toEqual([]);
  });

  it('reads only listCollections and the $sample aggregation', () => {
    expect(collectionsRequest('shop')).toMatchObject({
      method: 'listCollections',
      arguments: [{}, { nameOnly: true }],
    });
    expect(sampleRequest('shop', 'orders')).toMatchObject({
      method: 'aggregate',
      collection: 'orders',
      arguments: [[{ $sample: { size: { $numberInt: '300' } } }], { maxTimeMS: { $numberInt: '10000' } }],
    });
  });
});
