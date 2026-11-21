/**
 * Export, import, copy, generation, backup and restore against the test replica set (M25): each round trip gives back
 * the documents byte for byte, with every BSON type; a folder backup has mongodump's layout; an archive whose
 * collections alternate is read once and restored whole; a damaged archive stops at its checksum; an import with
 * duplicates inserts the others and its Undo deletes exactly those. The databases are `m25*`; the files are in a
 * temporary folder.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { BSON } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { archivePrelude, Crc64, namespaceHeader, terminator } from '../../../src/features/backup/archive-write';
import type { Json } from '../../../src/shared/engine-request';
import type { Target } from '../../../src/shared/target';
import { liveTransfer, localId, readOnlyId, type LiveTransfer } from './live';

const databases = ['m25', 'm25_import', 'm25_copy', 'm25_restored', 'm25_folder', 'm25_damaged', 'm25_alt', 'm25_gen'];
const types: Target = { kind: 'collection', connection: localId, database: 'm25', collection: 'types' };
let live: LiveTransfer;

/** One document of each BSON type a backup must keep, and field names with dots and `$`. */
const everyType: Json[] = [
  {
    _id: { $numberInt: '1' },
    int32: { $numberInt: '42' },
    double: { $numberDouble: '1.0' },
    beyond: { $numberDouble: '30000000000.0' },
    negativeZero: { $numberDouble: '-0.0' },
    int64: { $numberLong: '9007199254740993' },
    decimal: { $numberDecimal: '1.10' },
    date: { $date: { $numberLong: '1700000000000' } },
    regex: { $regularExpression: { pattern: '^a.c$', options: 'im' } },
    binary: { $binary: { base64: 'AAEC/w==', subType: '00' } },
    uuid: { $binary: { base64: 'AAECAwQFBgcICQoLDA0ODw==', subType: '04' } },
    timestamp: { $timestamp: { t: 1700000000, i: 7 } },
    min: { $minKey: 1 },
    max: { $maxKey: 1 },
    code: { $code: 'function () { return 1; }' },
    nested: { 'with.dot': { $numberInt: '1' }, $price: { $numberInt: '2' } },
    list: [{ $numberInt: '1' }, 'two', null, true],
    marker: 'checksum-marker',
  },
  { _id: { $oid: '65f1c0ffee0000000000000a' }, text: 'é ✓ 漢字', double: { $numberDouble: '2.5' } },
  { _id: 'text id', when: { $date: { $numberLong: '-1' } } },
];

function onCollection(database: string, collection: string): Target {
  return { kind: 'collection', connection: localId, database, collection };
}

function onDatabase(database: string): Target {
  return { kind: 'database', connection: localId, database };
}

async function dropAll(): Promise<void> {
  for (const database of databases) {
    await live.send(database, undefined, 'dropDatabase', []).catch(() => undefined);
  }
}

beforeAll(async () => {
  live = await liveTransfer();
  await dropAll();
  await live.send('m25', 'types', 'insertMany', [everyType, {}]);
  await live.send('m25', 'types', 'createIndexes', [[{ key: { marker: { $numberInt: '1' } }, name: 'marker_1' }]]);
}, 60_000);

afterAll(async () => {
  await dropAll();
  await live.close();
});

describe('transfer.export', () => {
  it('writes JSON Lines to the file chosen, with no .part left, and says how many', async () => {
    live.answers = { format: 'jsonl' };
    live.paths.push(join(live.folder, 'types.jsonl'));
    expect(await live.start('transfer.export', types)).toEqual({ kind: 'done' });
    const lines = (await readFile(join(live.folder, 'types.jsonl'), 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(everyType.length);
    await expect(readFile(join(live.folder, 'types.jsonl.part'))).rejects.toThrow();
    expect(live.notices().at(-1)).toBe('Exported 3 documents to types.jsonl.');
  });

  it('writes CSV with a byte order mark and the fields of every document as columns', async () => {
    live.answers = { format: 'csv' };
    live.paths.push(join(live.folder, 'types.csv'));
    expect(await live.start('transfer.export', types)).toEqual({ kind: 'done' });
    const text = await readFile(join(live.folder, 'types.csv'), 'utf8');
    expect(text.startsWith('﻿_id,')).toBe(true);
    expect(text.split('\r\n')[0]).toContain('when');
  });

  it('does nothing when the save dialog is closed', async () => {
    live.answers = { format: 'json' };
    live.paths.push(null);
    expect(await live.start('transfer.export', types)).toEqual({ kind: 'done' });
    await expect(readFile(join(live.folder, 'types.json'))).rejects.toThrow();
  });
});

describe('transfer.import', () => {
  it('gives back the documents exported as JSON Lines, byte for byte', async () => {
    live.answers = {};
    live.paths.push(join(live.folder, 'types.jsonl'));
    expect(await live.start('transfer.import', onCollection('m25_import', 'types'))).toEqual({ kind: 'done' });
    const source = await live.stored('m25', 'types');
    expect(source).toHaveLength(everyType.length);
    expect(await live.stored('m25_import', 'types')).toEqual(source);
    expect(live.notices().at(-1)).toBe('Imported 3 of 3 documents into types.');
  });

  it('inserts the documents after the duplicates, says how many failed, and Undo deletes only those inserted', async () => {
    await live.send('m25_import', 'dups', 'insertMany', [
      [
        { _id: { $numberInt: '1' }, kept: true },
        { _id: { $numberInt: '2' }, kept: true },
      ],
      {},
    ]);
    const file = join(live.folder, 'dups.jsonl');
    const lines = Array.from({ length: 10 }, (_, index) => JSON.stringify({ _id: index + 1, n: index }));
    await writeFile(file, lines.join('\n'));
    live.paths.push(file);
    expect(await live.start('transfer.import', onCollection('m25_import', 'dups'))).toEqual({ kind: 'done' });
    const [notice] = live.state().runner.notifications.slice(-1);
    expect(notice?.text).toMatch(/^Imported 8 of 10 documents into dups\. 2 failed: .*E11000 duplicate key error/u);
    expect(notice?.level).toBe('warning');
    const undo = notice?.actions?.[0];
    expect(undo?.label).toBe('Undo');
    expect(await live.start(undo?.feature ?? '', undo?.target ?? types, undo?.args ?? null)).toEqual({
      kind: 'done',
    });
    const left = (await live.send('m25_import', 'dups', 'find', [{}, {}])) as Json[];
    expect(left).toEqual([
      { _id: { $numberInt: '1' }, kept: true },
      { _id: { $numberInt: '2' }, kept: true },
    ]);
  });
});

describe('transfer.copy-collection', () => {
  it('copies a collection to a new database with its indexes, every document byte for byte', async () => {
    live.answers = {
      'destination-connection': localId,
      database: '$new',
      'new-database': 'm25_copy',
      collection: 'types',
      filter: '',
      also: ['indexes', 'options'],
    };
    expect(await live.start('transfer.copy-collection', types)).toEqual({ kind: 'done' });
    expect(await live.stored('m25_copy', 'types')).toEqual(await live.stored('m25', 'types'));
    const indexes = (await live.send('m25_copy', 'types', 'listIndexes', [])) as { name: string }[];
    expect(indexes.map((index) => index.name).sort()).toEqual(['_id_', 'marker_1']);
    expect(live.notices().at(-1)).toMatch(/^Copied 3 documents and 1 index to Local › m25_copy\.types in [\d.]+ s\.$/u);
  });

  it('skips the documents whose _id exists when appending', async () => {
    live.answers = { ...live.answers, database: 'm25_copy', mode: 'append' };
    expect(await live.start('transfer.copy-collection', types)).toEqual({ kind: 'done' });
    expect(live.notices().at(-1)).toMatch(/Copied 0 documents .* 3 skipped \(their _id already existed\)\.$/u);
  });
});

describe('transfer.generate', () => {
  it('inserts 2,500 generated documents in batches, and says so', async () => {
    const seed = Array.from({ length: 20 }, (_, index) => ({
      name: `name ${String(index)}`,
      n: { $numberInt: String(index) },
    }));
    await live.send('m25_gen', 'people', 'insertMany', [seed, {}]);
    live.answers = { 'how-many': '2500', where: 'this', seed: '42' };
    expect(await live.start('transfer.generate', onCollection('m25_gen', 'people'))).toEqual({ kind: 'done' });
    const count = await live.send('m25_gen', 'people', 'countDocuments', [{}]);
    expect(count).toEqual({ $numberInt: '2520' });
    expect(live.notices().at(-1)).toMatch(/^Inserted 2,500 generated documents into m25_gen\.people in [\d.]+ s\.$/u);
  });
});

describe('backup.create and backup.restore', () => {
  const archive = (): string => join(live.folder, 'm25.agz');

  it('backs up a database to an archive, also on a read-only connection', async () => {
    live.answers = { format: 'archive' };
    live.paths.push(archive());
    expect(await live.start('backup.create', onDatabase('m25'))).toEqual({ kind: 'done' });
    expect(live.notices().at(-1)).toMatch(
      /^Backed up m25 \(1 collection, 3 documents, [\d.]+ [KM]?B\) to .*m25\.agz in/u,
    );
    live.paths.push(join(live.folder, 'read-only.agz'));
    const readOnly = { kind: 'database', connection: readOnlyId, database: 'm25' } as const;
    expect(await live.start('backup.create', readOnly)).toEqual({ kind: 'done' });
  });

  it('restores the archive into another database, every value in its type and bytes, with its indexes', async () => {
    live.answers = { kind: 'archive' };
    live.paths.push(archive());
    expect(await live.start('backup.restore', onDatabase('m25_restored'))).toEqual({ kind: 'done' });
    expect(await live.stored('m25_restored', 'types')).toEqual(await live.stored('m25', 'types'));
    const indexes = (await live.send('m25_restored', 'types', 'listIndexes', [])) as { name: string }[];
    expect(indexes.map((index) => index.name).sort()).toEqual(['_id_', 'marker_1']);
    expect(live.notices().at(-1)).toMatch(
      /^Restored 3 documents and 1 index in 1 collection into Local › m25_restored/u,
    );
  });

  it('adds documents, keeping and skipping those whose _id exists, as one operation of the undo history', async () => {
    await live.send('m25_restored', 'types', 'deleteOne', [{ _id: 'text id' }]);
    live.answers = { kind: 'archive', mode: 'add' };
    live.paths.push(archive());
    const before = live.state().undo.entries.length;
    expect(await live.start('backup.restore', onDatabase('m25_restored'))).toEqual({ kind: 'done' });
    expect(live.notices().at(-1)).toMatch(/2 skipped \(their _id already existed\)\.$/u);
    expect(live.state().undo.entries.length).toBe(before + 1);
  });

  it('writes a compressed folder backup as mongodump does, and restores it', async () => {
    const parent = join(live.folder, 'folders');
    await import('node:fs/promises').then((fs) => fs.mkdir(parent));
    live.answers = { format: 'gzip' };
    live.paths.push(parent);
    expect(await live.start('backup.create', onDatabase('m25'))).toEqual({ kind: 'done' });
    const [root] = await readdir(parent);
    const backup = join(parent, root ?? '');
    expect((await readdir(join(backup, 'm25'))).sort()).toEqual(['types.bson.gz', 'types.metadata.json.gz']);
    const metadata = JSON.parse(
      gunzipSync(await readFile(join(backup, 'm25', 'types.metadata.json.gz'))).toString(),
    ) as {
      indexes: { name: string }[];
    };
    expect(metadata.indexes.map((index) => index.name)).toEqual(['_id_', 'marker_1']);
    live.answers = { kind: 'folder' };
    live.paths.push(backup);
    expect(await live.start('backup.restore', onDatabase('m25_folder'))).toEqual({ kind: 'done' });
    expect(await live.stored('m25_folder', 'types')).toEqual(await live.stored('m25', 'types'));
  });

  it('stops at the checksum of a damaged archive', async () => {
    const plain = gunzipSync(await readFile(archive()));
    const at = plain.indexOf(Buffer.from('checksum-marker'));
    expect(at).toBeGreaterThan(0);
    plain[at] = 'C'.charCodeAt(0);
    const damaged = join(live.folder, 'damaged.archive');
    await writeFile(damaged, plain);
    live.answers = { kind: 'archive' };
    live.paths.push(damaged);
    const result = await live.start('backup.restore', onDatabase('m25_damaged'));
    expect(result.kind).toBe('failed');
    expect(live.notices().at(-1)).toContain(
      "Restore into Local › m25_damaged failed: damaged.archive is damaged: the checksum of m25.types doesn't match its documents.",
    );
  });

  it('restores both collections of an archive in which they alternate, reading it once', async () => {
    const document = (n: number): Uint8Array => BSON.serialize({ _id: n, n });
    const a = [document(1), document(2), document(3)];
    const b = [document(10), document(20)];
    const crc = (documents: Uint8Array[]): bigint => {
      const checksum = new Crc64();
      documents.forEach((each) => {
        checksum.update(each);
      });
      return checksum.value();
    };
    const block = (collection: string, documents: Uint8Array[]): Uint8Array[] => [
      namespaceHeader('alt', collection),
      ...documents,
      terminator,
    ];
    const listed = ['a', 'b'].map((collection) => ({ database: 'alt', collection, metadata: {}, type: 'collection' }));
    const pieces = [
      archivePrelude('8.2.0', listed),
      ...block('a', a.slice(0, 2)),
      ...block('b', b.slice(0, 1)),
      ...block('a', a.slice(2)),
      ...block('b', b.slice(1)),
      namespaceHeader('alt', 'a', crc(a)),
      terminator,
      namespaceHeader('alt', 'b', crc(b)),
      terminator,
    ];
    const file = join(live.folder, 'alternating.archive');
    await writeFile(file, Buffer.concat(pieces));
    live.answers = { kind: 'archive', 'collections-of-alt': ['a', 'b'] };
    live.paths.push(file);
    expect(await live.start('backup.restore', onDatabase('m25_alt'))).toEqual({ kind: 'done' });
    expect(await live.send('m25_alt', 'a', 'countDocuments', [{}])).toEqual({ $numberInt: '3' });
    expect(await live.send('m25_alt', 'b', 'countDocuments', [{}])).toEqual({ $numberInt: '2' });
  });
});
