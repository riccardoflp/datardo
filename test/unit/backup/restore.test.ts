import { describe, expect, it } from 'vitest';
import {
  archiveListRead,
  existingRead,
  folderListRead,
  metadataRead,
  parseMetadata,
  plan,
} from '../../../src/features/backup/restore';
import type { FedStep } from '../../../src/features/backup/types';
import type { Answers, EngineStep } from '../../../src/shared/feature';
import type { Target } from '../../../src/shared/target';
import { connection, contextOn, local, mongoOf, next, planOf, production, stateWith } from '../transfer/harness';

const shop: Target = { kind: 'database', connection: local.id, database: 'shop' };
const onLocal: Target = { kind: 'connection', connection: local.id };
const orders: Target = { kind: 'collection', connection: local.id, database: 'shop', collection: 'orders' };

const ordersMeta = {
  options: { capped: true, size: { $numberInt: '4096' }, validator: { qty: { $gt: { $numberInt: '0' } } } },
  indexes: [
    { v: { $numberInt: '2' }, key: { _id: { $numberInt: '1' } }, name: '_id_' },
    { v: { $numberInt: '2' }, key: { at: { $numberInt: '-1' } }, name: 'at_-1', ns: 'shop.orders' },
  ],
  collectionName: 'orders',
  type: 'collection',
};

const archive = {
  databases: [
    {
      name: 'shop',
      collections: [
        { name: 'events', meta: { type: 'timeseries' }, size: 0 },
        { name: 'orders', meta: ordersMeta, size: 0 },
        { name: 'recent', meta: { options: { viewOn: 'orders', pipeline: [] }, indexes: [], type: 'view' }, size: 0 },
      ],
    },
  ],
};

const fromArchive: Answers = { kind: 'archive', path: 'D:\\b\\shop.agz', listing: archive };

function restore(target: Target, answers: Answers, state = stateWith()) {
  return plan(contextOn(target, 'backup.restore', state), answers);
}

describe('backup.restore', () => {
  it('is refused on a read-only connection', () => {
    const target: Target = { kind: 'database', connection: production.id, database: 'shop' };
    const outcome = restore(target, {});
    expect(outcome).toEqual({
      kind: 'refuse',
      code: 'backup.restore/read-only',
      message: 'The connection Production is read-only: nothing can be restored into it.',
    });
  });

  it('asks for the backup, then its file, titled Restore into <where>', () => {
    const first = restore(shop, {});
    expect(first.kind === 'ask' && first.question.title).toBe('Restore into Local › shop: backup');
    expect(next(restore(shop, { kind: 'archive' }))).toBe('path');
    expect(restore(shop, { kind: 'archive', path: 'D:\\b\\shop.agz' })).toEqual({
      kind: 'read',
      need: { key: 'listing', read: 'backup.restore:archive', args: { path: 'D:\\b\\shop.agz' } },
    });
    expect(next(restore(shop, { kind: 'folder', path: 'D:\\dump' }))).toBe('read:listing');
  });

  it('refuses an unreadable archive, one without collections, a folder without backup files', () => {
    const unreadable = restore(shop, { ...fromArchive, listing: { error: 'unexpected end of file' } });
    expect(unreadable).toMatchObject({
      code: 'backup.restore/unreadable',
      message: "Can't read shop.agz: unexpected end of file",
    });
    expect(restore(shop, { ...fromArchive, listing: { databases: [] } })).toMatchObject({
      code: 'backup.restore/empty',
      message: 'shop.agz has no collections to restore.',
    });
    expect(restore(shop, { kind: 'folder', path: 'D:\\photos', listing: { databases: [] } })).toMatchObject({
      code: 'backup.restore/no-backup',
    });
  });

  it('asks which collections, then reads the existing ones, then asks how to restore over them', () => {
    const asked = restore(shop, fromArchive);
    expect(asked.kind === 'ask' && asked.question.fields[0]).toMatchObject({
      kind: 'pick-many',
      key: 'collections-of-shop',
    });
    const chosen = { ...fromArchive, 'collections-of-shop': ['orders', 'recent'] };
    expect(restore(shop, chosen)).toEqual({
      kind: 'read',
      need: { key: 'existing', read: 'backup.restore:existing', args: { connection: local.id, databases: ['shop'] } },
    });
    const mode = restore(shop, { ...chosen, existing: { shop: [{ name: 'orders', kind: 'collection' }] } });
    expect(mode.kind === 'ask' && mode.question.fields[0]).toMatchObject({
      key: 'mode',
      choices: [
        { value: 'add', label: 'Add documents' },
        { value: 'drop', label: 'Drop and restore' },
      ],
    });
  });

  it('drops, creates with the options, inserts, then builds the indexes, and asks to type shop', () => {
    const answers = {
      ...fromArchive,
      'collections-of-shop': ['orders'],
      existing: { shop: [{ name: 'orders', kind: 'collection' }] },
      mode: 'drop',
    };
    const restored = planOf(restore(shop, answers));
    expect(restored.steps.map((step) => step.text)).toEqual([
      'db.orders.drop()',
      expect.stringMatching(/^db\.createCollection\("orders", \{ capped: true, size: 4096, validator:/u),
      'db.orders.insertMany([<documents of orders>], { ordered: false, bypassDocumentValidation: true })',
      'db.orders.createIndexes([{ key: { at: -1 }, name: "at_-1" }])',
    ]);
    expect(restored.danger).toMatchObject({ kind: 'destructive', name: 'shop', button: 'Restore' });
    expect(restored.undo).toEqual({ cannot: "Existing collections are dropped first: this can't be undone." });
  });

  it('reads the archive once: every insert is fed from it, in batches of 1,000 or 8 MB, validation bypassed', () => {
    const answers = { ...fromArchive, 'collections-of-shop': ['orders'], existing: { shop: [] } };
    const [, insert] = planOf(restore(shop, answers)).steps as [EngineStep, FedStep];
    expect(insert.feed).toEqual({ kind: 'archive', path: 'D:\\b\\shop.agz', database: 'shop', collection: 'orders' });
    expect(insert.batches).toEqual({ documents: 1000, bytes: 8 * 1024 * 1024 });
    expect(mongoOf(insert).arguments).toEqual([[], { ordered: false, bypassDocumentValidation: true }]);
  });

  it('asks to type nothing when none of the collections exists', () => {
    const answers = { ...fromArchive, 'collections-of-shop': ['orders'], existing: { shop: [] } };
    const restored = planOf(restore(shop, answers));
    expect(restored.danger.kind).toBe('confirm');
    expect(restored.danger.kind !== 'none' && restored.danger.text).toBe(
      [
        'Restore 1 collection into Local › shop?',
        'From D:\\b\\shop.agz.',
        'Documents are added; those whose _id already exists are skipped.',
        'It can be undone from the Undo history, for collections of up to 10,000 documents.',
      ].join('\n'),
    );
  });

  it('records one operation per collection with Add documents', () => {
    const answers = { ...fromArchive, 'collections-of-shop': ['orders', 'recent'], existing: { shop: [] } };
    expect(planOf(restore(shop, answers)).undo).toEqual({
      keeps: {
        kind: 'per-collection',
        operations: [
          {
            kind: 'inserted',
            connection: local.id,
            database: 'shop',
            collection: 'orders',
            title: 'Restore orders from shop.agz',
          },
        ],
      },
    });
  });

  it('says the undo history is off for a connection that does not keep it', () => {
    const quiet = connection('c-local', 'Local', { keepsUndo: false });
    const answers = { ...fromArchive, 'collections-of-shop': ['orders'], existing: { shop: [] } };
    expect(planOf(restore(shop, answers, stateWith([quiet]))).undo).toEqual({
      cannot: "The undo history is off for this connection: this can't be undone.",
    });
  });

  it('does not restore a time series collection, nor with Add documents a view that exists', () => {
    const answers = {
      ...fromArchive,
      'collections-of-shop': ['events', 'orders', 'recent'],
      existing: { shop: [{ name: 'recent', kind: 'view' }] },
      mode: 'add',
    };
    expect(planOf(restore(shop, answers)).after).toEqual([
      { kind: 'refresh', connection: local.id },
      {
        kind: 'notify',
        level: 'warning',
        text: 'Not restored: shop.events (a time series collection (use mongorestore)), shop.recent (a view that already exists)',
      },
    ]);
  });

  it('restores a .bson file into a collection, with the metadata next to it', () => {
    const answers = { path: 'D:\\dump\\shop\\orders.bson.gz', existing: { shop: [] } };
    expect(restore(orders, answers)).toEqual({
      kind: 'read',
      need: {
        key: 'metadata',
        read: 'backup.restore:metadata',
        args: { paths: ['D:\\dump\\shop\\orders.metadata.json.gz'] },
      },
    });
    const restored = planOf(
      restore(orders, { ...answers, metadata: { 'D:\\dump\\shop\\orders.metadata.json.gz': ordersMeta } }),
    );
    const insert = restored.steps[1] as FedStep;
    expect(insert.feed).toEqual({ kind: 'bson', path: 'D:\\dump\\shop\\orders.bson.gz' });
    expect(restored.steps).toHaveLength(3);
  });

  it('asks the collection of an archive restored into a collection, the same name first', () => {
    const two = {
      databases: [
        {
          name: 'shop',
          collections: [
            { name: 'carts', size: 0 },
            { name: 'orders', size: 0 },
          ],
        },
      ],
    };
    const outcome = restore(orders, { path: 'D:\\b\\shop.agz', listing: two });
    expect(outcome.kind === 'ask' && outcome.question.fields[0]).toMatchObject({
      key: 'archive-collection',
      choices: [{ value: 'shop.orders' }, { value: 'shop.carts' }],
    });
  });

  it('asks the databases on a connection, and the name of the one chosen', () => {
    const backup = { databases: [{ name: 'crm', collections: [{ name: 'leads', size: 0 }] }, archive.databases[0]] };
    const answers = { ...fromArchive, listing: backup };
    expect(next(restore(onLocal, answers))).toBe('databases');
    const named = restore(onLocal, { ...answers, databases: ['crm'] });
    expect(named.kind === 'ask' && named.question).toMatchObject({
      text: 'Database on Local to restore crm into',
      fields: [{ key: 'database-name', default: 'crm' }],
    });
    expect(restore(onLocal, { ...answers, databases: ['crm'], 'database-name': 'crm_copy' })).toMatchObject({
      need: { args: { databases: ['crm_copy'] } },
    });
  });

  it('reads the lists of an archive and of a folder, the metadata files and the existing collections', () => {
    expect(
      archiveListRead.parse([[{ database: 'shop', collection: 'orders', type: 'collection', metadata: {} }]], null),
    ).toEqual({
      databases: [{ name: 'shop', collections: [{ name: 'orders', meta: { type: 'collection' }, size: 0 }] }],
    });
    expect(archiveListRead.parse([{ error: 'not an archive' }], null)).toEqual({ error: 'not an archive' });
    const listing = { name: 'shop', path: 'D:\\shop', files: [{ name: 'orders.bson', size: 10 }], folders: [] };
    expect(folderListRead.parse([listing], null)).toMatchObject({ databases: [{ name: 'shop', folder: 'D:\\shop' }] });
    expect(metadataRead.parse([['{"type":"view"}', null]], { paths: ['a', 'b'] })).toEqual({
      a: { type: 'view' },
      b: null,
    });
    expect(
      existingRead.parse([[{ name: 'orders', type: 'collection' }]], { connection: local.id, databases: ['shop'] }),
    ).toEqual({
      shop: [{ name: 'orders', kind: 'collection' }],
    });
  });

  it('refuses metadata nested too deep, or that is not a document', () => {
    expect(parseMetadata(`${'{"a":'.repeat(300)}1${'}'.repeat(300)}`)).toBeNull();
    expect(parseMetadata('[1]')).toBeNull();
    expect(parseMetadata('{nope')).toBeNull();
  });
});
