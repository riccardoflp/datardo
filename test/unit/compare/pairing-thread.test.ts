import { BSON, Double, Int32 } from 'mongodb';
import { describe, expect, it } from 'vitest';
import type { ComparisonOptions, SideInfo } from '../../../src/features/compare/types';
import { inThread } from '../../../src/runner/workers/pairing';
import { pairingSession } from '../../../src/runner/workers/pairing-session';
import { connectionId } from '../../../src/shared/ids';
import { int } from './context';

const left: SideInfo = {
  connection: connectionId('c-local'),
  connectionName: 'Local',
  database: 'shop',
  collection: 'orders',
  view: false,
};
const right: SideInfo = { ...left, connection: connectionId('c-prod'), connectionName: 'Production' };

function options(numbersByValue: boolean): ComparisonOptions {
  return { filter: '', ignore: '', ignoreOrder: true, numbersByValue };
}

function bytes(documents: readonly Record<string, unknown>[]): readonly Uint8Array[] {
  return documents.map((document) => BSON.serialize(document));
}

const leftDocuments = bytes([
  { _id: new Int32(1), total: new Int32(1) },
  { _id: new Int32(2), total: new Int32(5) },
  { _id: new Int32(3), total: new Int32(7) },
]);
const rightDocuments = bytes([
  { _id: new Int32(1), total: new Double(1) },
  { _id: new Int32(2), total: new Int32(6) },
  { _id: new Int32(4), total: new Int32(9) },
]);

async function compared(numbersByValue: boolean) {
  const work = inThread({ options: options(numbersByValue), left, right });
  await work.add('left', leftDocuments);
  await work.add('right', rightDocuments);
  const result = await work.finish();
  work.close();
  return result;
}

describe('compare.read', () => {
  it('pairs the bytes of the documents as stored, with their BSON types', async () => {
    const byValue = await compared(true);
    expect(byValue.counts).toEqual({ identical: 1, different: 1, onlyLeft: 1, onlyRight: 1 });
    const byType = await compared(false);
    expect(byType.counts).toEqual({ identical: 0, different: 2, onlyLeft: 1, onlyRight: 1 });
    expect(byType.differences).toContainEqual({ id: int(1), kind: 'different' });
    expect(byType.differences).toContainEqual({ id: int(3), kind: 'only-left' });
  });

  it('answers a batch before the start, and after the end, with a failure', () => {
    const session = pairingSession();
    expect(session({ kind: 'add', side: 'left', documents: leftDocuments })).toMatchObject({ kind: 'failed' });
    expect(session({ kind: 'start', input: { options: options(true), left, right } })).toEqual({ kind: 'started' });
    expect(session({ kind: 'close' })).toEqual({ kind: 'closed' });
    expect(session({ kind: 'finish' })).toMatchObject({ kind: 'failed' });
  });
});
