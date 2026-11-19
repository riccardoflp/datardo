/**
 * The pure parts of the MongoDB engine's methods: the forms mongosh accepts as the driver takes them, the `_id` of an
 * upsert kept as its operation gave it, what the client keeps by identifier, and the facts of an error.
 */
import { BSON, MongoBulkWriteError, MongoServerError, ReadPreference } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { EngineError } from '../../../src/engines/engine';
import { upsertedId } from '../../../src/engines/mongodb/bulk-write';
import { withMongoFacts, MongoEngineError } from '../../../src/engines/mongodb/errors';
import { createHandles, mostKept } from '../../../src/engines/mongodb/handles';
import {
  findAndModifyOptions,
  indexDescriptions,
  indexName,
  plainNumber,
  plainOptions,
  searchIndexDescription,
  sessionOptions,
  transactionOptions,
} from '../../../src/engines/mongodb/mongosh-forms';

const one = new BSON.Int32(1);

describe('the forms of mongosh, as the driver takes them', () => {
  it('numbers the driver reads become plain; a Timestamp and a document inside keep their types', () => {
    const time = new BSON.Timestamp({ t: 5, i: 1 });
    expect(plainNumber(new BSON.Long(7))).toBe(7);
    expect(plainNumber(new BSON.Double(2.5))).toBe(2.5);
    expect(plainNumber(time)).toBe(time);
    expect(plainOptions({ limit: one, sort: { a: one } })).toEqual({ limit: 1, sort: { a: one } });
  });

  it('names an index as the server does, and takes key patterns or descriptions', () => {
    expect(indexName({ status: one, total: new BSON.Int32(-1), body: 'text' })).toBe('status_1_total_-1_body_text');
    expect(indexDescriptions([{ a: one }], { unique: true, commitQuorum: 'majority' })).toEqual({
      indexes: [{ key: { a: one }, name: 'a_1', unique: true }],
      commitQuorum: 'majority',
    });
    expect(indexDescriptions([{ key: { a: one }, name: 'mine', sparse: true }], undefined)).toEqual({
      indexes: [{ key: { a: one }, name: 'mine', sparse: true }],
    });
    // A field named key, in a key pattern, is a field.
    expect(indexDescriptions([{ key: one }], {}).indexes).toEqual([{ key: { key: one }, name: 'key_1' }]);
  });

  it('takes a search index in each of its forms', () => {
    const definition = { mappings: { dynamic: true } };
    expect(searchIndexDescription(['s', definition])).toEqual({ name: 's', definition });
    expect(searchIndexDescription(['v', 'vectorSearch', definition])).toEqual({
      name: 'v',
      type: 'vectorSearch',
      definition,
    });
    expect(searchIndexDescription([{ name: 'n', definition }])).toEqual({ name: 'n', definition });
    expect(searchIndexDescription([definition])).toEqual({ name: 'default', definition });
  });

  it('returnNewDocument and returnOriginal are returnDocument, and the reply is the document alone', () => {
    expect(findAndModifyOptions({ returnNewDocument: true, upsert: true })).toEqual({
      upsert: true,
      returnDocument: 'after',
      includeResultMetadata: false,
    });
    expect(findAndModifyOptions({ returnOriginal: false })).toMatchObject({ returnDocument: 'after' });
    expect(findAndModifyOptions(undefined)).toEqual({ includeResultMetadata: false });
  });

  it('the options of a session give the defaults of its transactions', () => {
    const options = sessionOptions({
      causalConsistency: false,
      readConcern: { level: 'majority' },
      writeConcern: { w: new BSON.Int32(2) },
      defaultTransactionOptions: { readPreference: { mode: 'secondary', maxStalenessSeconds: new BSON.Int32(120) } },
    });
    expect(options.causalConsistency).toBe(false);
    expect(options.defaultTransactionOptions?.readConcern).toEqual({ level: 'majority' });
    expect(options.defaultTransactionOptions?.writeConcern).toEqual({ w: 2 });
    const preference = options.defaultTransactionOptions?.readPreference as ReadPreference;
    expect(preference.mode).toBe('secondary');
    expect(preference.maxStalenessSeconds).toBe(120);
    expect(sessionOptions({})).toEqual({});
    expect(() => transactionOptions({ readPreference: 'nearest-ish' })).toThrow(/is not a read preference/);
  });
});

describe('the _id of an upsert', () => {
  it('is the replacement’s, else the filter’s, else the server’s', () => {
    const double = new BSON.Double(3);
    expect(upsertedId({ replaceOne: { filter: { _id: 1 }, replacement: { _id: double } } }, 3)).toBe(double);
    expect(upsertedId({ updateOne: { filter: { _id: double }, update: {} } }, 3)).toBe(double);
    const made = new BSON.ObjectId();
    expect(upsertedId({ updateOne: { filter: { _id: { $gt: one } }, update: {} } }, made)).toBe(made);
    expect(upsertedId({ updateOne: { filter: { status: 'x' }, update: {} } }, made)).toBe(made);
  });
});

describe('what a MongoDB client keeps', () => {
  it('by identifier, until released; an unknown one is an error that says so', () => {
    const handles = createHandles();
    const session = { endSession: () => Promise.resolve() } as never;
    const id = handles.keep({ kind: 'session', session });
    expect(id).toBe('session-1');
    expect(handles.session(id)).toBe(session);
    expect(() => handles.cursor(id)).toThrow(`No cursor ${id} is open: it was closed, or never opened.`);
    expect(handles.release(id)?.kind).toBe('session');
    expect(handles.release(id)).toBeUndefined();
    expect(() => handles.session(id)).toThrow(EngineError);
  });

  it(`at most ${String(mostKept)}`, async () => {
    const handles = createHandles();
    let ended = 0;
    const session = { endSession: () => Promise.resolve((ended += 1)) } as never;
    for (let each = 0; each < mostKept; each += 1) {
      handles.keep({ kind: 'session', session });
    }
    expect(() => handles.keep({ kind: 'session', session })).toThrow(/keeps at most 100/);
    await handles.closeAll();
    expect(ended).toBe(mostKept);
  });
});

describe('the facts of an error of MongoDB', () => {
  it('its code as a number, its name, its labels', () => {
    const server = new MongoServerError({ message: 'conflict', code: new BSON.Int32(112), codeName: 'WriteConflict' });
    server.addErrorLabel('TransientTransactionError');
    const error = withMongoFacts(new EngineError('conflict'), server);
    expect(error).toBeInstanceOf(MongoEngineError);
    expect(error).toMatchObject({ code: 112, codeName: 'WriteConflict', labels: ['TransientTransactionError'] });
  });

  it('the operations of a bulk write that failed', () => {
    const bulk = new MongoBulkWriteError({ message: 'dup', code: 11000, writeErrors: [] }, {
      insertedCount: 0,
      matchedCount: 0,
      modifiedCount: 0,
      deletedCount: 0,
      upsertedCount: 0,
    } as never);
    Object.defineProperty(bulk, 'writeErrors', { value: [{ index: new BSON.Int32(2) }, { index: 4 }] });
    expect(withMongoFacts(new EngineError('dup', 11000), bulk)).toMatchObject({ failedOperations: [2, 4] });
  });

  it('an error of another kind stays as it was', () => {
    const masked = new EngineError('Cancelled.');
    expect(withMongoFacts(masked, new Error('Cancelled.'))).toBe(masked);
  });
});
