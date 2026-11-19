/**
 * The values a JavaScript value of the driver cannot hold, read back from a real server through the engine: a BSON
 * undefined and dates beyond the range of a JavaScript Date, at the first level, in arrays, in documents, in a DBRef
 * and in the scope of code (R5.5, QA2).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEngines } from '../../../src/engines';
import type { Json, MongoRequest } from '../../../src/shared/engine-request';
import { connectionId } from '../../../src/shared/ids';
import { testServers } from '../servers';
import { documentBytes, insertBytes } from './insert-bytes';

const database = 'datardo_engine_values';
const collection = 'values';
const lost: Json = { $undefined: true };
const far: Json = { $date: { $numberLong: '9000000000000000000' } };
const farBefore: Json = { $date: { $numberLong: '-9000000000000000000' } };

const stored: Json = {
  _id: { $numberInt: '1' },
  undefined: lost,
  dateBeyondJavaScript: far,
  dateBeforeJavaScript: farBefore,
  date: { $date: { $numberLong: '1710498600000' } },
  null: null,
  array: [{ $numberInt: '1' }, lost, far],
  document: { inner: lost, when: far, deeper: { list: [{ again: lost }] } },
  dbRef: { $ref: 'users', $id: { $oid: '65f1c0de65f1c0de65f1c0de' }, seen: far },
  codeWithScope: { $code: 'x + 1', $scope: { gone: lost, x: { $numberInt: '1' } } },
};

function on(method: string, args: readonly Json[], limit?: number): MongoRequest {
  return {
    engine: 'mongodb',
    database,
    collection,
    method,
    arguments: args,
    timeLimitMs: 10_000,
    ...(limit === undefined ? {} : { limit }),
  };
}

describe('query.run keeps every BSON type on the way back', () => {
  const engines = createEngines();
  const id = connectionId('engine-values');
  const send = (request: MongoRequest) => engines.send({ connection: id, request }, AbortSignal.timeout(20_000));

  beforeAll(async () => {
    await engines.connect(
      id,
      { engine: 'mongodb', connectionString: testServers().mongoStandalone, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(20_000),
    );
    await send(on('deleteMany', [{}]));
    await insertBytes(testServers().mongoStandalone, database, collection, documentBytes(stored));
  });

  afterAll(async () => {
    await engines.disconnectAll();
  });

  it('reads an undefined and a date beyond JavaScript with find as the server holds them', async () => {
    expect(await send(on('find', [{}], 50))).toEqual([stored]);
  });

  it('reads them with aggregate', async () => {
    expect(await send(on('aggregate', [[{ $match: {} }]], 50))).toEqual([stored]);
  });

  it('reads them with findOne, and null when no document matches', async () => {
    expect(await send(on('findOne', [{ _id: { $numberInt: '1' } }]))).toEqual(stored);
    expect(await send(on('findOne', [{ _id: { $numberInt: '2' } }]))).toBeNull();
  });
});
