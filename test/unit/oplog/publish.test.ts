import { describe, expect, it } from 'vitest';
import type { ConnectionView } from '../../../src/shared/connection';
import type { Json, MongoRequest } from '../../../src/shared/engine-request';
import type { Answers, Outcome } from '../../../src/shared/feature';
import { connectionId } from '../../../src/shared/ids';
import { bulkWriteIds, effectOf, matchedIdsRequest, plan, type WriteEffect } from '../../../src/features/oplog/publish';
import { documentsRead } from '../../../src/features/oplog/reads/documents';
import { publishingOf } from '../../../src/features/oplog/types';
import { appStateWith, cacheConnection, connection, contextOf, stepsOf, withArgs } from '../undo/harness';

const linked = connection('c-local', 'Local', {
  publishesTo: cacheConnection.id,
  oplog: { prefix: 'app:', namespaces: ['tenant1'], scope: ['shop'] },
});

function publish(
  effect: WriteEffect,
  more: Answers = {},
  saved: readonly ConnectionView[] = [linked, cacheConnection],
): Outcome {
  const args = { connection: 'c-local', database: 'shop', collection: 'orders', effect };
  return plan(contextOf('oplog.publish', appStateWith(undefined, saved)), withArgs(args, more));
}

/** Each step as `<channel> <message>`, the PUBLISH commands sent to db 0 of the linked connection. */
function published(outcome: Outcome): readonly string[] {
  const decoder = new TextDecoder();
  return stepsOf(outcome).map((step) => {
    if (step.kind !== 'engine' || step.request.engine !== 'redis') {
      throw new Error('Not a Redis step.');
    }
    expect(step.connection).toBe(cacheConnection.id);
    expect(step.writes).toBe(false);
    expect(step.request.database).toBe(0);
    const [verb, channel, message] = step.request.command.map((word) => decoder.decode(word));
    expect(verb).toBe('PUBLISH');
    return `${channel ?? ''} ${message ?? ''}`;
  });
}

const deleteMany: MongoRequest = {
  engine: 'mongodb',
  database: 'shop',
  collection: 'orders',
  method: 'deleteMany',
  arguments: [{ status: 'old' }],
};

describe('oplog.publish', () => {
  it('sends an edit of qty to the collection, the namespace and the document', () => {
    const message = '{"e":"u","d":{"_id":"abc"},"f":["qty"]}';
    expect(published(publish({ kind: 'updated', ids: ['abc'], update: { $set: { qty: 3 } } }))).toEqual([
      `app:orders ${message}`,
      `app:tenant1::orders ${message}`,
      `app:orders::abc ${message}`,
    ]);
  });

  it('publishes an insert for each document inserted and a removal for each document deleted', () => {
    const inserted = effectOf(
      { ...deleteMany, method: 'insertMany', arguments: [[{ _id: 'a' }, { _id: 'b' }]] },
      { insertedIds: { '0': 'a', '1': 'b' } },
    );
    expect(published(publish(inserted)).filter((each) => each.startsWith('app:orders '))).toEqual([
      'app:orders {"e":"i","d":{"_id":"a"}}',
      'app:orders {"e":"i","d":{"_id":"b"}}',
    ]);
    const removed = effectOf(deleteMany, { deletedCount: 2 }, ['a', 'b']);
    expect(published(publish(removed)).filter((each) => each.startsWith('app:orders '))).toEqual([
      'app:orders {"e":"r","d":{"_id":"a"}}',
      'app:orders {"e":"r","d":{"_id":"b"}}',
    ]);
  });

  it('publishes the fields of the operators for each document matched, when at least one was modified', () => {
    const request: MongoRequest = { ...deleteMany, method: 'updateMany', arguments: [{}, { $set: { a: 1 } }] };
    expect(effectOf(request, { matchedCount: 2, modifiedCount: 0 }, ['a', 'b'])).toEqual({ kind: 'none' });
    const effect = effectOf(request, { matchedCount: 2, modifiedCount: 1 }, ['a', 'b']);
    expect(published(publish(effect)).filter((each) => each.startsWith('app:orders '))).toEqual([
      'app:orders {"e":"u","d":{"_id":"a"},"f":["a"]}',
      'app:orders {"e":"u","d":{"_id":"b"},"f":["a"]}',
    ]);
  });

  it('reads the documents after a pipeline with $replaceWith, and publishes their fields', () => {
    const effect: WriteEffect = { kind: 'updated', ids: ['a'], update: [{ $replaceWith: '$b' }] };
    const need = publish(effect);
    expect(need).toMatchObject({ kind: 'read', need: { key: 'documents', read: documentsRead } });
    expect(published(publish(effect, { documents: [{ _id: 'a', x: 1, y: 2 }] }))[0]).toBe(
      'app:orders {"e":"u","d":{"_id":"a"},"f":["x","y"]}',
    );
  });

  it('publishes a removal only for the documents no longer there when fewer were deleted than matched', () => {
    const effect = effectOf(deleteMany, { deletedCount: 1 }, ['a', 'b']);
    expect(publish(effect)).toMatchObject({ kind: 'read', need: { key: 'remaining', read: documentsRead } });
    const steps = published(publish(effect, { remaining: [{ _id: 'b' }] }));
    expect(steps.filter((each) => each.startsWith('app:orders '))).toEqual(['app:orders {"e":"r","d":{"_id":"a"}}']);
  });

  it('publishes nothing without a linked connection, or for a collection outside its databases', () => {
    const effect: WriteEffect = { kind: 'inserted', ids: ['a'] };
    expect(stepsOf(publish(effect, {}, [connection('c-local', 'Local'), cacheConnection]))).toEqual([]);
    const elsewhere = plan(
      contextOf('oplog.publish', appStateWith(undefined, [linked, cacheConnection])),
      withArgs({ connection: 'c-local', database: 'admin', collection: 'orders', effect }),
    );
    expect(stepsOf(elsewhere)).toEqual([]);
  });

  it('knows a linked connection that was removed, which the runner reports', () => {
    expect(publishingOf(appStateWith(undefined, [linked]), connectionId('c-local'))).toEqual({ kind: 'missing-link' });
    expect(stepsOf(publish({ kind: 'inserted', ids: ['a'] }, {}, [linked]))).toEqual([]);
  });

  it('publishes nothing for a document whose _id cannot be a Meteor id', () => {
    expect(published(publish({ kind: 'inserted', ids: [{ a: 1 }] }))).toEqual([]);
  });

  it('reads the _ids matched before an update or a delete by filter', () => {
    expect(matchedIdsRequest(connectionId('c-local'), deleteMany)).toMatchObject({
      request: { method: 'find', arguments: [{ status: 'old' }, { projection: { _id: 1 } }] },
    });
    expect(matchedIdsRequest(connectionId('c-local'), { ...deleteMany, method: 'deleteOne' })).toMatchObject({
      request: { limit: 1 },
    });
    expect(matchedIdsRequest(connectionId('c-local'), { ...deleteMany, method: 'insertOne' })).toBeUndefined();
  });

  it('names the _ids of a bulkWrite, to read them before and after', () => {
    const operations: Json = [
      { insertOne: { document: { _id: 1 } } },
      { updateOne: { filter: { _id: 2 }, update: { $set: { a: 1 } } } },
      { deleteMany: { filter: { a: 1 } } },
    ];
    expect(bulkWriteIds({ ...deleteMany, method: 'bulkWrite', arguments: [operations] })).toEqual([1, 2]);
  });
});
