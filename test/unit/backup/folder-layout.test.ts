import { describe, expect, it } from 'vitest';
import {
  backupCollectionName,
  backupDatabaseName,
  backupFileName,
  collectionFileNames,
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

  it('encodes every name that is not plain letters, digits, _, - and . into a file name', () => {
    expect(['a/b', '../x', 'con', 'nul.txt', '%2e%2e', 'été'].map(backupFileName)).toEqual([
      'a%2Fb',
      '%2E.%2Fx',
      '%63on',
      '%6Eul.txt',
      '%252e%252e',
      '%C3%A9t%C3%A9',
    ]);
    expect(collectionFileNames('a/b', 'plain')).toEqual({ documents: 'a%2Fb.bson', metadata: 'a%2Fb.metadata.json' });
  });

  it('keeps the names that need nothing as they are', () => {
    expect(['console', 'fs.files', 'orders_2026-01'].map(backupFileName)).toEqual([
      'console',
      'fs.files',
      'orders_2026-01',
    ]);
  });

  it('cuts a name longer than 238 characters and ends it with the hash of the name, as mongodump does', () => {
    const long = backupFileName('a'.repeat(300));
    expect(long).toHaveLength(238);
    expect(long).toMatch(/^a{208}%24[A-Za-z0-9_-]{27}$/u);
    const cut = backupFileName(`${'a'.repeat(207)}/${'b'.repeat(100)}`);
    expect(cut.slice(0, 207)).toBe('a'.repeat(207));
    expect(cut.slice(207, 210)).toBe('%24');
  });

  it('never gives a path, a device or the same file for two names', () => {
    const names = [
      'a/b',
      'a\\b',
      'a:b',
      'con',
      'CON.x',
      'lpt9',
      'up/../../../escaped',
      '..',
      '.',
      'a\u0007b',
      '%',
      '%25',
    ];
    const files = names.map(backupFileName);
    for (const file of files) {
      expect(file).not.toMatch(/[/\\:]/u);
      expect(Array.from(file, (character) => character.charCodeAt(0)).every((code) => code >= 32)).toBe(true);
      expect(file).not.toMatch(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/iu);
      expect(file).not.toMatch(/^\.|\.$/u);
    }
    expect(new Set(files).size).toBe(names.length);
  });

  it('reads the collection of a file from its metadata, and decodes a name without metadata', () => {
    expect(backupCollectionName('a%2Fb', 'a/b')).toBe('a/b');
    expect(backupCollectionName('a%2Fb', 'a%2Fb')).toBe('a%2Fb');
    expect(backupCollectionName('a%2Fb')).toBe('a/b');
    expect(backupCollectionName('100%')).toBe('100%');
    expect(backupCollectionName('a:b')).toBe('a:b');
    const long = 'z'.repeat(300);
    expect(backupCollectionName(backupFileName(long), long)).toBe(long);
  });

  it('leaves out the system collections whatever their file is called', () => {
    expect(names(folder('shop', ['system.views.bson', 'system%2Eviews.bson', 'orders.bson']))).toEqual([
      ['shop', ['orders']],
    ]);
  });

  it('decodes a database folder only when Datardo or mongodump encoded it', () => {
    expect(backupDatabaseName('%6Eul')).toBe('nul');
    expect(backupDatabaseName('50%')).toBe('50%');
    expect(backupDatabaseName('shop')).toBe('shop');
  });

  it('reads a folder of encoded names, of names written as they are, and of mongodump', () => {
    const dump: FolderListing = {
      name: 'dump',
      path: 'dump',
      files: [],
      folders: [
        {
          name: 'shop',
          path: 'dump/shop',
          files: [
            { name: 'a%2Fb.bson', size: 10 },
            { name: 'a%2Fb.metadata.json', size: 10, collectionName: 'a/b' },
            { name: '%63on.bson', size: 10 },
            { name: '%63on.metadata.json', size: 10, collectionName: 'con' },
            { name: 'a:b.bson', size: 10 },
            { name: 'p%2Fq.bson', size: 10 },
            { name: 'p%2Fq.metadata.json', size: 10, collectionName: 'p%2Fq' },
          ],
          folders: [],
        },
      ],
    };
    expect(names(dump)).toEqual([['shop', ['a:b', 'a/b', 'con', 'p%2Fq']]]);
    const [shop] = scanBackup(dump);
    expect(shop?.collections.find((each) => each.name === 'a/b')).toEqual({
      name: 'a/b',
      bson: 'a%2Fb.bson',
      metadata: 'a%2Fb.metadata.json',
      size: 10,
    });
  });

  it('writes the folder of a database and the files of a collection with encoded names', () => {
    const choice = [{ database: 'shop', collections: [{ name: 'up/../x', type: 'collection' }] }];
    const context = { platform: 'linux', connection: connectionId('c-local'), format: 'plain' } as const;
    expect(folderSteps('/b/L', choice, { indexes: {}, counts: {} }, context).map((step) => step.text)).toEqual([
      'create folder /b/L',
      'create folder /b/L/shop',
      'write /b/L/shop/up%2F..%2Fx.metadata.json',
      'write /b/L/shop/up%2F..%2Fx.bson',
    ]);
  });
});
