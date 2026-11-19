/**
 * Records the replies `query.run`, `query.count` and `query.field-hints` read from the throwaway MongoDB server into
 * `test/fixtures/replies/`, named after the server version they came from (testing.md). It runs only when
 * `DATARDO_RECORD_REPLIES=1`: the unit tests of the `parse` functions read the recorded files.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEngines } from '../../../src/engines';
import { countRequest, countArgs } from '../../../src/features/query/count';
import { sampleRequest } from '../../../src/features/query/field-hints';
import { checkedQuery, findRequest, runWindow } from '../../../src/features/query/run';
import { emptyTexts } from '../../../src/features/query/types';
import type { Json, MongoRequest } from '../../../src/shared/engine-request';
import { connectionId } from '../../../src/shared/ids';
import { everyType } from '../../unit/query/values';
import { testServers } from '../servers';
import { documentBytes, insertBytes } from './insert-bytes';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');

function on(collection: string, method: string, args: readonly Json[]): MongoRequest {
  return { engine: 'mongodb', database: 'datardo_record', collection, method, arguments: args, timeLimitMs: 10_000 };
}

describe('the recorded replies of query.run, query.count and query.field-hints', () => {
  it.runIf(recording)('records find, the counts and the sample', async () => {
    const engines = createEngines();
    const id = connectionId('record');
    const send = (request: MongoRequest) => engines.send({ connection: id, request }, AbortSignal.timeout(20_000));
    await engines.connect(
      id,
      { engine: 'mongodb', connectionString: testServers().mongoStandalone, connectTimeoutMs: 10_000 },
      AbortSignal.timeout(20_000),
    );
    try {
      await mkdir(folder, { recursive: true });
      await send(on('types', 'deleteMany', [{}]));
      // The driver cannot write a BSON undefined nor a date beyond JavaScript: the document goes as bytes of its own.
      const typed = documentBytes({ _id: { $numberInt: '1' }, ...everyType });
      await insertBytes(testServers().mongoStandalone, 'datardo_record', 'types', typed);
      await send(on('orders', 'deleteMany', [{}]));
      const statuses = ['paid', 'paid', 'paid', 'new', 'shipped'];
      const orders = statuses.map((status, index) => ({
        _id: { $numberInt: String(index + 1) },
        status,
        total: index % 2 === 0 ? { $numberDouble: `${String(index * 10)}.5` } : { $numberInt: String(index * 10) },
        items: [{ sku: `A${String(index)}`, qty: { $numberInt: '1' } }],
        vector: [{ $numberDouble: '0.5' }, { $numberDouble: '0.25' }],
      }));
      await send(on('orders', 'insertMany', [orders]));
      const query = checkedQuery(emptyTexts, 0);
      if (!query.ok) {
        throw new Error(query.message);
      }
      const window = runWindow(query.query, 1, 50);
      const find = await send({
        ...findRequest({ database: 'datardo_record', collection: 'types' }, query.query, window, 60_000),
      });
      const paid = checkedQuery({ ...emptyTexts, filter: '{ status: "paid" }' }, 0);
      const asked = countArgs({ database: 'datardo_record', collection: 'orders', filter: '{ status: "paid" }' });
      const estimated = await send(countRequest({ ...asked, filter: '' }, {}, 60_000));
      const counted = await send(countRequest(asked, paid.ok ? paid.query.filter : {}, 60_000));
      const sample = await send(sampleRequest('datardo_record', 'orders'));
      await writeFile(join(folder, 'mongodb-8.2-find-every-type.json'), `${JSON.stringify(find, null, 2)}\n`);
      await writeFile(
        join(folder, 'mongodb-8.2-query-estimatedDocumentCount.json'),
        `${JSON.stringify(estimated, null, 2)}\n`,
      );
      await writeFile(join(folder, 'mongodb-8.2-countDocuments.json'), `${JSON.stringify(counted, null, 2)}\n`);
      await writeFile(join(folder, 'mongodb-8.2-sample.json'), `${JSON.stringify(sample, null, 2)}\n`);
      expect(Array.isArray(find)).toBe(true);
    } finally {
      await engines.disconnectAll();
    }
  });
});
