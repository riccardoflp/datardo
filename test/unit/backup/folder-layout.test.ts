import { describe, expect, it } from 'vitest';
import {
  collectionMetadata,
  folderSteps,
  metadataText,
  mongorestoreCommand,
  scanBackup,
  uniquePath,
  type FolderListing,
} from '../../../src/features/backup/folder-layout';
import { connectionId } from '../../../src/shared/ids';

function folder(path: string, files: readonly string[], folders: readonly FolderListing[] = []): FolderListing {
  const name = path.split('/').pop() ?? path;
  return { name, path, files: files.map((file) => ({ name: file, size: 100 })), folders };
}

function names(listing: FolderListing): unknown {
  return scanBackup(listing).map((database) => [database.name, database.collections.map((each) => each.name)]);
}

describe('backup.folder-layout', () => {
  it('reads a folder of a subfolder per database', () => {
    const dump = folder('dump', [], [folder('dump/shop', ['orders.bson', 'orders.metadata.json'])]);
    expect(names(dump)).toEqual([['shop', ['orders']]]);
  });

  it('reads the folder of one database, system files left out', () => {
    expect(names(folder('shop', ['orders.bson.gz', 'system.views.bson']))).toEqual([['shop', ['orders']]]);
  });

  it('reads a collection that has only its metadata, a view', () => {
    const [shop] = scanBackup(folder('shop', ['recent.metadata.json']));
    expect(shop?.collections).toEqual([{ name: 'recent', metadata: 'recent.metadata.json', size: 0 }]);
  });

  it('finds no database in a folder without backup files, at any level', () => {
    expect(names(folder('photos', ['a.jpg'], [folder('photos/2024', ['b.jpg'])]))).toEqual([]);
  });

  it('sorts databases and collections by name', () => {
    const dump = folder(
      'dump',
      [],
      [folder('dump/shop', ['orders.bson', 'carts.bson']), folder('dump/crm', ['leads.bson'])],
    );
    expect(names(dump)).toEqual([
      ['crm', ['leads']],
      ['shop', ['carts', 'orders']],
    ]);
  });

  it('never replaces a backup: _2, then _3, before the extension', () => {
    const taken = new Set(['shop-orders-20261101']);
    expect(uniquePath('shop-orders-20261101', taken)).toBe('shop-orders-20261101_2');
    taken.add('shop-orders-20261101_2');
    expect(uniquePath('shop-orders-20261101', taken)).toBe('shop-orders-20261101_3');
    expect(uniquePath('nightly.agz', new Set(['nightly.agz']), '.agz')).toBe('nightly_2.agz');
  });

  it('writes the metadata of a capped collection in mongodump order', () => {
    const metadata = collectionMetadata(
      { name: 'events', type: 'collection', options: { capped: true, size: { $numberInt: '4096' } }, uuid: 'ab12' },
      [
        { v: { $numberInt: '2' }, key: { _id: { $numberInt: '1' } }, name: '_id_', ns: 'shop.events' },
        { v: { $numberInt: '2' }, key: { at: { $numberInt: '-1' } }, name: 'at_-1' },
      ],
    );
    expect(Object.keys(metadata)).toEqual(['options', 'indexes', 'uuid', 'collectionName', 'type']);
    expect(metadata['indexes']).toEqual([
      { v: { $numberInt: '2' }, key: { _id: { $numberInt: '1' } }, name: '_id_' },
      { v: { $numberInt: '2' }, key: { at: { $numberInt: '-1' } }, name: 'at_-1' },
    ]);
    expect(metadataText(metadata)).toContain('"collectionName":"events","type":"collection"');
  });

  it('gives a view options with viewOn and pipeline, no indexes, the type view', () => {
    const view = { name: 'recent', type: 'view', options: { viewOn: 'orders', pipeline: [] } };
    expect(collectionMetadata(view, [{ name: '_id_' }])).toEqual({
      options: { viewOn: 'orders', pipeline: [] },
      indexes: [],
      collectionName: 'recent',
      type: 'view',
    });
  });

  it('writes no options key for a collection without options', () => {
    expect(Object.keys(collectionMetadata({ name: 'orders', type: 'collection' }, []))).not.toContain('options');
  });

  it('says the command that restores each format', () => {
    expect(mongorestoreCommand('D:\\b\\shop.agz', 'archive')).toBe('mongorestore --gzip --archive="D:\\b\\shop.agz"');
    expect(mongorestoreCommand('D:\\b\\shop', 'gzip')).toBe('mongorestore --gzip --dir "D:\\b\\shop"');
    expect(mongorestoreCommand('D:\\b\\shop', 'plain')).toBe('mongorestore --dir "D:\\b\\shop"');
  });

  it('writes a folder per database and the two files of a collection, the metadata only for a view', () => {
    const choice = [
      {
        database: 'shop',
        collections: [
          { name: 'orders', type: 'collection' },
          { name: 'recent', type: 'view', options: { viewOn: 'orders', pipeline: [] } },
        ],
      },
    ];
    const details = { indexes: {}, counts: { 'shop.orders': 3 } };
    const context = { platform: 'windows', connection: connectionId('c-local'), format: 'gzip' } as const;
    expect(folderSteps('D:\\b\\Local_1', choice, details, context).map((step) => step.text)).toEqual([
      'create folder D:\\b\\Local_1',
      'create folder D:\\b\\Local_1\\shop',
      'write D:\\b\\Local_1\\shop\\orders.metadata.json.gz',
      'write D:\\b\\Local_1\\shop\\orders.bson.gz',
      'write D:\\b\\Local_1\\shop\\recent.metadata.json.gz',
    ]);
  });
});
