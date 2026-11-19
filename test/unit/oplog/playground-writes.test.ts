import { describe, expect, it } from 'vitest';
import {
  pendingAfter,
  plan,
  playgroundEffect,
  readBefore,
  restrictedFilter,
} from '../../../src/features/oplog/playground-writes';
import { appStateWith, contextOf, stepsOf, withArgs, cacheConnection, connection } from '../undo/harness';

describe('oplog.playground-writes', () => {
  it('publishes the inserts of insertOne and insertMany, with the _id the driver gave', () => {
    expect(playgroundEffect({ method: 'insertOne', arguments: [{ _id: 10 }], result: { insertedId: 10 } })).toEqual({
      kind: 'inserted',
      ids: [10],
    });
    expect(playgroundEffect({ method: 'insertMany', arguments: [[{ _id: 11 }, { _id: 12 }]] })).toEqual({
      kind: 'inserted',
      ids: [11, 12],
    });
    const given = { $oid: '0123456789abcdef01234567' };
    expect(playgroundEffect({ method: 'insertOne', arguments: [{ x: 1 }], result: { insertedId: given } })).toEqual({
      kind: 'inserted',
      ids: [given],
    });
  });

  it('publishes only the inserts before the failure of an ordered insertMany', () => {
    const write = { method: 'insertMany', arguments: [[{ _id: 20 }, { _id: 1 }, { _id: 21 }]], failed: [1] };
    expect(playgroundEffect(write)).toEqual({ kind: 'inserted', ids: [20] });
    expect(playgroundEffect({ ...write, arguments: [...write.arguments, { ordered: false }] })).toEqual({
      kind: 'inserted',
      ids: [20, 21],
    });
  });

  it('reads the document updateOne changes in its sort, restricts the write to it, and publishes its fields', () => {
    const update = { $set: { name: 'B', 'tags.0': 'y' }, $inc: { n: 1 } };
    const args = [{ n: { $gte: 2 } }, update, { sort: { n: -1 } }];
    expect(readBefore('updateOne', args)).toEqual({
      kind: 'one',
      filter: { n: { $gte: 2 } },
      sort: { n: -1 },
      whole: false,
    });
    expect(restrictedFilter({ n: { $gte: 2 } }, 7)).toEqual({ n: { $gte: 2 }, _id: 7 });
    expect(restrictedFilter({ _id: { $gt: 1 } }, 7)).toEqual({ $and: [{ _id: { $gt: 1 } }, { _id: 7 }] });
    const effect = playgroundEffect({
      method: 'updateOne',
      arguments: args,
      found: { _id: 7 },
      result: { matchedCount: 1, modifiedCount: 1 },
    });
    expect(effect).toEqual({ kind: 'updated', ids: [7], update });
  });

  it('publishes nothing for an update that modifies nothing, and an insert for an upsert', () => {
    const args = [{ a: 1 }, { $set: { a: 1 } }];
    expect(
      playgroundEffect({ method: 'updateOne', arguments: args, found: { _id: 1 }, result: { modifiedCount: 0 } }),
    ).toEqual({
      kind: 'none',
    });
    expect(
      playgroundEffect({ method: 'updateOne', arguments: args, result: { upsertedId: 9, modifiedCount: 0 } }),
    ).toEqual({
      kind: 'inserted',
      ids: [9],
    });
  });

  it('publishes one event for each document updateMany and deleteMany matched', () => {
    expect(readBefore('deleteMany', [{ a: 1 }])).toEqual({ kind: 'many', filter: { a: 1 } });
    expect(
      playgroundEffect({ method: 'deleteMany', arguments: [{ a: 1 }], matched: [1, 2], result: { deletedCount: 2 } }),
    ).toEqual({
      kind: 'removed',
      ids: [1, 2],
      deleted: 2,
    });
    expect(
      playgroundEffect({
        method: 'updateMany',
        arguments: [{}, { $set: { b: 1 } }],
        matched: [1, 2],
        result: { modifiedCount: 2 },
      }),
    ).toEqual({ kind: 'updated', ids: [1, 2], update: { $set: { b: 1 } } });
  });

  it('publishes the fields of the document before and after a replaceOne', () => {
    expect(readBefore('replaceOne', [{ _id: 1 }, { b: 2 }])).toMatchObject({ kind: 'one', whole: true });
    expect(
      playgroundEffect({
        method: 'replaceOne',
        arguments: [{ _id: 1 }, { b: 2 }],
        found: { _id: 1, a: 1 },
        result: { modifiedCount: 1 },
      }),
    ).toEqual({ kind: 'replaced', ids: [1], fields: ['a', 'b'] });
  });

  it('publishes an update, a removal and an insert for findOneAndUpdate, findOneAndDelete and an upserting findOneAndReplace', () => {
    expect(
      playgroundEffect({
        method: 'findOneAndUpdate',
        arguments: [{}, { $set: { a: 1 } }],
        found: { _id: 1 },
        result: { _id: 1 },
      }),
    ).toEqual({ kind: 'updated', ids: [1], update: { $set: { a: 1 } } });
    expect(
      playgroundEffect({ method: 'findOneAndDelete', arguments: [{}], found: { _id: 2 }, result: { _id: 2 } }),
    ).toEqual({
      kind: 'removed',
      ids: [2],
      deleted: 1,
    });
    expect(
      playgroundEffect({
        method: 'findOneAndReplace',
        arguments: [{ a: 9 }, { a: 9 }, { upsert: true }],
        result: null,
        after: [{ _id: 3, a: 9 }],
      }),
    ).toEqual({ kind: 'inserted', ids: [3] });
  });

  it('publishes the events of oplog.changes for a bulkWrite, also when some operations failed', () => {
    expect(
      playgroundEffect({ method: 'bulkWrite', arguments: [[]], before: [{ _id: 1, a: 1 }], after: [{ _id: 1, a: 2 }] }),
    ).toEqual({
      kind: 'changes',
      before: [{ _id: 1, a: 1 }],
      after: [{ _id: 1, a: 2 }],
    });
  });

  it('keeps the writes of a transaction until it commits, and drops them otherwise', () => {
    let state = pendingAfter([], { kind: 'write', write: 'first' });
    state = pendingAfter(state.pending, { kind: 'write', write: 'second' });
    expect(state.publish).toEqual([]);
    expect(pendingAfter(state.pending, { kind: 'commit' })).toEqual({ pending: [], publish: ['first', 'second'] });
    for (const kind of ['abort', 'end', 'attempt'] as const) {
      expect(pendingAfter(state.pending, { kind })).toEqual({ pending: [], publish: [] });
    }
  });

  it('publishes only the attempt of withTransaction that committed', () => {
    let state = pendingAfter([], { kind: 'write', write: 'tried' });
    state = pendingAfter(state.pending, { kind: 'attempt' });
    state = pendingAfter(state.pending, { kind: 'write', write: 'committed' });
    expect(pendingAfter(state.pending, { kind: 'commit' }).publish).toEqual(['committed']);
  });

  it('publishes nothing without a linked connection', () => {
    const write = { method: 'insertOne', arguments: [{ _id: 10 }], result: { insertedId: 10 } };
    const args = { connection: 'c-local', database: 'shop', collection: 'orders', write };
    const alone = appStateWith(undefined, [connection('c-local', 'Local'), cacheConnection]);
    expect(stepsOf(plan(contextOf('oplog.playground-writes', alone), withArgs(args)))).toEqual([]);
    const linked = connection('c-local', 'Local', { publishesTo: cacheConnection.id });
    const both = appStateWith(undefined, [linked, cacheConnection]);
    expect(stepsOf(plan(contextOf('oplog.playground-writes', both), withArgs(args)))).toHaveLength(2);
  });
});
