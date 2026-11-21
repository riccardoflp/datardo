import { describe, expect, it } from 'vitest';
import { fileNameOf, fileRead, plan } from '../../../src/features/transfer/import';
import { isFedStep, type FedStep } from '../../../src/features/backup/types';
import type { Answers, Step } from '../../../src/shared/feature';
import { connection, contextOn, local, mongoOf, next, ordersOn, planOf, production, stateWith } from './harness';

const contents = { buckets: [], entries: [{ name: 'orders', kind: 'collection', system: false }] };
const path = 'D:\\data\\orders.jsonl';

function lines(count: number, withIds = false): string {
  return Array.from({ length: count }, (_, index) =>
    JSON.stringify(withIds ? { _id: index, n: index } : { n: index }),
  ).join('\n');
}

function importing(answers: Answers, state = stateWith()) {
  return plan(contextOn(ordersOn(answers['on'] === 'prod' ? production : local), 'transfer.import', state), answers);
}

/** The documents a fed step of an import holds. */
function documentsOf(step: Step | undefined): readonly unknown[] {
  return step !== undefined && isFedStep(step) && step.feed.kind === 'documents' ? step.feed.documents : [];
}

describe('transfer.import', () => {
  it('inserts 2,500 documents in 3 batches of insertMany, ordered false', () => {
    const imported = planOf(importing({ contents, file: path, read: { text: lines(2500) } }));
    expect(imported.steps).toHaveLength(3);
    const steps = imported.steps as FedStep[];
    const sizes = steps.map((step) => (step.feed.kind === 'documents' ? step.feed.documents.length : 0));
    expect(sizes).toEqual([1000, 1000, 500]);
    expect(mongoOf(imported.steps[0])).toMatchObject({ method: 'insertMany', collection: 'orders' });
    expect(mongoOf(imported.steps[0]).arguments[1]).toEqual({ ordered: false });
    expect(steps.map((step) => step.text)).toEqual([
      'db.orders.insertMany([<documents 1–1,000 of orders.jsonl>], { ordered: false })',
      'db.orders.insertMany([<documents 1,001–2,000 of orders.jsonl>], { ordered: false })',
      'db.orders.insertMany([<documents 2,001–2,500 of orders.jsonl>], { ordered: false })',
    ]);
    // The status line says 1,000 of 2,500, 2,000 of 2,500, 2,500 of 2,500 (runner.progress).
    expect(steps.map((step) => step.work)).toEqual(
      [0, 1000, 2000].map((before) => ({
        title: 'Importing orders.jsonl',
        total: 2500,
        unit: '',
        before,
      })),
    );
    expect(imported.publishes).toBe(false);
  });

  it('gives each document without _id a new ObjectId while the undo history records, all different', () => {
    const imported = planOf(importing({ contents, file: path, read: { text: lines(3) } }));
    const documents = documentsOf(imported.steps[0]) as { _id: { $oid: string } }[];
    expect(documents.map((document) => Object.keys(document)[0])).toEqual(['_id', '_id', '_id']);
    expect(new Set(documents.map((document) => document._id.$oid)).size).toBe(3);
    expect(imported.undo).toEqual({
      keeps: {
        kind: 'inserted',
        connection: local.id,
        database: 'shop',
        collection: 'orders',
        title: 'Import orders.jsonl',
      },
    });
    expect(imported.danger).toEqual({
      kind: 'confirm',
      text: 'Import 3 documents from orders.jsonl into shop.orders?\nNew _id values will be generated.',
      button: 'Import',
    });
  });

  it('says how many have an _id: those already there are skipped', () => {
    const imported = planOf(importing({ contents, file: path, read: { text: lines(10, true) } }));
    expect(imported.danger.kind !== 'none' && imported.danger.text).toContain(
      '10 of them have an _id: documents whose _id already exists are skipped.',
    );
  });

  it('is refused on a read-only connection and on a view, before any dialog', () => {
    expect(importing({ on: 'prod' })).toEqual({
      kind: 'refuse',
      code: 'transfer.import/read-only',
      message: 'shop.orders is read-only.',
    });
    const view = { buckets: [], entries: [{ name: 'orders', kind: 'view', system: false }] };
    expect(importing({ contents: view })).toMatchObject({
      code: 'transfer.import/view',
      message: 'shop.orders is read-only.',
    });
  });

  it('says a file of 20,000 documents cannot be undone', () => {
    expect(planOf(importing({ contents, file: path, read: { text: lines(20000) } })).undo).toEqual({
      cannot: "This can't be undone: the undo history keeps operations of up to 10,000 documents.",
    });
  });

  it('keeps the documents as they are when the undo history is off', () => {
    const quiet = stateWith([connection('c-local', 'Local', { keepsUndo: false })]);
    const imported = planOf(importing({ contents, file: path, read: { text: lines(1) } }, quiet));
    expect(documentsOf(imported.steps[0])).toEqual([{ n: { $numberInt: '0' } }]);
    expect(imported.undo).toEqual({ cannot: "The undo history is off for this connection: this can't be undone." });
  });

  it('says an empty file contains no documents, and asks nothing more', () => {
    expect(importing({ contents, file: path, read: { text: '  \n ' } })).toEqual({
      kind: 'refuse',
      code: 'transfer.import/empty',
      message: 'orders.jsonl contains no documents.',
    });
  });

  it('says a file that does not parse, and one that cannot be read', () => {
    expect(importing({ contents, file: path, read: { text: '{ "a": 1 }\n{ oops' } })).toMatchObject({
      code: 'transfer.import/unreadable',
      message: expect.stringMatching(/^Can't import orders\.jsonl: Line 2: /u) as unknown,
    });
    expect(importing({ contents, file: path, read: { error: 'Access denied' } })).toMatchObject({
      message: "Can't import orders.jsonl: Access denied",
    });
  });

  it('asks the file in a dialog titled Import into <database>.<collection>, then reads it', () => {
    const asked = importing({ contents });
    expect(asked.kind === 'read' && asked.need).toMatchObject({
      key: 'file',
      read: 'transfer.import:file',
      args: {
        mode: 'open',
        title: 'Import into shop.orders',
        button: 'Import',
        filters: [
          { name: 'JSON, JSON Lines, CSV', extensions: ['json', 'jsonl', 'ndjson', 'csv'] },
          { name: 'All files', extensions: ['*'] },
        ],
      },
    });
    expect(planOf(importing({ contents, file: null })).steps).toEqual([]);
    expect(next(importing({ contents, file: path }))).toBe('read:read');
    expect(fileRead.request(contextOn(ordersOn(), 'x'), { path })).toEqual({
      kind: 'app',
      action: 'transfer.read-file',
      args: { path, most: 256 * 1024 * 1024 },
    });
    expect(fileRead.parse(['{"a":1}'], { path })).toEqual({ text: '{"a":1}' });
    expect(fileNameOf('/home/me/data.csv')).toBe('data.csv');
  });
});
