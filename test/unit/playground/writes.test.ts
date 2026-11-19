import { describe, expect, it } from 'vitest';
import { connectionId } from '../../../src/shared/ids';
import type { PlaygroundCall } from '../../../src/features/playground/runtime';
import {
  answerLine,
  cancelledMessage,
  dropOf,
  dropPlan,
  existsRequest,
  writeCheck,
  type Drop,
  type WriteConnection,
} from '../../../src/features/playground/writes';

const local: WriteConnection = { id: connectionId('c-local'), name: 'Local', readOnly: false, publishes: false };
const production: WriteConnection = { ...local, name: 'Production', readOnly: true };
const publishing: WriteConnection = { ...local, publishes: true };

function on(collection: string, method: string, args: PlaygroundCall['arguments'] = []): PlaygroundCall {
  return { on: 'collection', database: 'shop', collection, method, arguments: args, scriptDatabase: 'shop', line: 1 };
}

function onDb(method: string, args: PlaygroundCall['arguments'] = [], database = 'shop'): PlaygroundCall {
  return { on: 'database', database, method, arguments: args, scriptDatabase: 'shop', line: 4 };
}

const collectionMethods = [
  'insertOne',
  'insertMany',
  'insert',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'findOneAndDelete',
  'bulkWrite',
  'createIndex',
  'createIndexes',
  'dropIndex',
  'dropIndexes',
  'createSearchIndex',
  'updateSearchIndex',
  'dropSearchIndex',
  'drop',
  'renameCollection',
];

function askedDrop(call: PlaygroundCall): Drop {
  const check = writeCheck(call, local);
  if (check.kind !== 'ask') {
    throw new Error(`Expected a question, got ${check.kind}`);
  }
  return check.drop;
}

describe('playground.writes', () => {
  it('refuses every write on a read-only connection, with its own name', () => {
    for (const method of collectionMethods) {
      expect(writeCheck(on('orders', method), production)).toEqual({
        kind: 'refuse',
        message: `${method}() is not allowed: the connection is read-only.`,
      });
    }
    for (const method of ['createCollection', 'createView', 'dropDatabase']) {
      expect(writeCheck(onDb(method), production)).toEqual({
        kind: 'refuse',
        message: `${method}() is not allowed: the connection is read-only.`,
      });
    }
  });

  it('refuses a pipeline with $out or $merge on a read-only connection', () => {
    expect(writeCheck(on('orders', 'aggregate', [[{ $match: {} }, { $out: 'copy' }]]), production)).toEqual({
      kind: 'refuse',
      message: 'A pipeline with $out is not allowed: the connection is read-only.',
    });
    expect(writeCheck(onDb('aggregate', [[{ $merge: 'copy' }]]), production)).toMatchObject({
      message: 'A pipeline with $merge is not allowed: the connection is read-only.',
    });
    expect(
      writeCheck(onDb('runCommand', [{ aggregate: 'orders', pipeline: [{ $out: 'copy' }], cursor: {} }]), production),
    ).toMatchObject({ message: 'A pipeline with $out is not allowed: the connection is read-only.' });
  });

  it('runs only the reading commands on a read-only connection', () => {
    expect(writeCheck(onDb('runCommand', [{ ping: 1 }]), production).kind).toBe('send');
    expect(writeCheck(onDb('runCommand', [{ create: 'x' }]), production)).toEqual({
      kind: 'refuse',
      message: 'The command create is not allowed: the connection is read-only.',
    });
    expect(writeCheck(onDb('runCommand', ['dropDatabase']), production)).toEqual({
      kind: 'refuse',
      message: 'The command dropDatabase is not allowed: the connection is read-only.',
    });
  });

  it('does not refuse reading, and never asks on a read-only connection', () => {
    expect(writeCheck(on('orders', 'find', [{}]), production).kind).toBe('send');
    expect(writeCheck(on('orders', 'drop'), production).kind).toBe('refuse');
  });

  it('asks before db.orders.drop(), with the step and the name to type', () => {
    const drop = askedDrop(on('orders', 'drop'));
    expect(drop).toEqual({
      kind: 'collection',
      database: 'shop',
      collection: 'orders',
      step: 'db.orders.drop()',
      line: 1,
    });
    expect(existsRequest(drop as Extract<Drop, { kind: 'collection' }>)).toEqual({
      engine: 'mongodb',
      database: 'shop',
      method: 'listCollections',
      arguments: [{ name: 'orders' }],
    });
    const plan = dropPlan(
      drop,
      { kind: 'collection', documents: 1234, indexes: 2 },
      { playground: 'Playground 1', connection: local.id },
      { engine: 'mongodb', database: 'shop', collection: 'orders', method: 'drop', arguments: [] },
    );
    expect(plan.title).toBe('Drop collection shop.orders');
    expect(plan.danger).toEqual({
      kind: 'destructive',
      text: 'The script of Playground 1 drops it at line 1. Deletes 1,234 documents and 2 indexes. This cannot be undone.',
      button: 'Drop',
      name: 'orders',
    });
    expect(plan.steps[0]?.text).toBe('db.orders.drop()');
    expect(plan.publishes).toBe(false);
  });

  it('says only This cannot be undone. when the numbers could not be read', () => {
    const drop = askedDrop(on('old', 'drop'));
    const plan = dropPlan(
      drop,
      { kind: 'unknown' },
      { playground: 'Playground 1', connection: local.id },
      {
        engine: 'mongodb',
        database: 'shop',
        method: 'drop',
        arguments: [],
      },
    );
    expect(plan.danger).toMatchObject({
      text: 'The script of Playground 1 drops it at line 1. This cannot be undone.',
    });
  });

  it('asks about a view with its own title', () => {
    const drop = askedDrop(on('recent', 'drop'));
    const plan = dropPlan(
      drop,
      { kind: 'view' },
      { playground: 'Playground 1', connection: local.id },
      {
        engine: 'mongodb',
        database: 'shop',
        method: 'drop',
        arguments: [],
      },
    );
    expect(plan.title).toBe('Drop view shop.recent');
    expect(plan.danger.kind === 'destructive' ? plan.danger.text : '').toContain(
      'The documents of its source collection are not affected. This cannot be undone.',
    );
  });

  it('asks before runCommand({ drop: "orders" })', () => {
    expect(askedDrop(onDb('runCommand', [{ drop: 'orders' }]))).toMatchObject({
      kind: 'collection',
      collection: 'orders',
      step: 'db.runCommand({ drop: "orders" })',
    });
  });

  it('asks before dropping a database, in any of its ways', () => {
    const sibling = askedDrop(onDb('dropDatabase', [], 'archive'));
    expect(sibling).toMatchObject({ kind: 'database', database: 'archive' });
    expect(sibling.step).toBe('db.getSiblingDB("archive").dropDatabase()');
    expect(askedDrop(onDb('runCommand', [{ dropDatabase: 1 }]))).toMatchObject({ kind: 'database', database: 'shop' });
    expect(askedDrop(onDb('runCommand', ['dropDatabase']))).toMatchObject({ kind: 'database', database: 'shop' });
    expect(askedDrop(onDb('adminCommand', [{ dropDatabase: 1 }]))).toMatchObject({ database: 'admin' });
    const plan = dropPlan(
      sibling,
      { kind: 'database', collections: 3 },
      {
        playground: 'Playground 1',
        connection: local.id,
      },
      { engine: 'mongodb', database: 'archive', method: 'dropDatabase', arguments: [] },
    );
    expect(plan.title).toBe('Drop database archive');
    expect(plan.danger).toMatchObject({ name: 'archive' });
  });

  it('asks nothing for the writes that are not drops', () => {
    expect(writeCheck(on('orders', 'deleteMany', [{}]), local).kind).toBe('send');
    expect(writeCheck(on('orders', 'renameCollection', ['users', true]), local).kind).toBe('send');
    expect(writeCheck(on('orders', 'dropIndexes'), local).kind).toBe('send');
    expect(dropOf(on('orders', 'deleteMany'))).toBeUndefined();
  });

  it('gives the error of a cancelled drop and the lines of the Log', () => {
    const drop = askedDrop(on('orders', 'drop'));
    expect(cancelledMessage(drop)).toBe('Dropping shop.orders was cancelled.');
    expect(cancelledMessage(askedDrop(onDb('dropDatabase')))).toBe('Dropping the database shop was cancelled.');
    expect(answerLine(drop, 'confirmed')).toBe('db.orders.drop(): confirmed');
    expect(answerLine(drop, 'cancelled')).toBe('db.orders.drop(): cancelled');
  });

  it('publishes the writes to documents of a collection, with their session', () => {
    const update = on('orders', 'updateOne', [{ _id: 7 }, { $set: { status: 'paid' } }]);
    expect(writeCheck({ ...update, session: 1 }, publishing)).toMatchObject({
      kind: 'send',
      publish: { database: 'shop', collection: 'orders', method: 'updateOne', session: 1 },
    });
    expect(writeCheck(update, local)).not.toHaveProperty('publish');
  });

  it('publishes nothing of runCommand, of a pipeline or of an index', () => {
    const insert = onDb('runCommand', [{ insert: 'orders', documents: [{ _id: 8 }] }]);
    expect(writeCheck(insert, publishing)).not.toHaveProperty('publish');
    expect(writeCheck(on('orders', 'aggregate', [[{ $out: 'copy' }]]), publishing)).not.toHaveProperty('publish');
    expect(writeCheck(on('orders', 'createIndex', [{ a: 1 }]), publishing)).not.toHaveProperty('publish');
  });
});
