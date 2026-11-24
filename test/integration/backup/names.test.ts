/**
 * The names of a folder backup and what a restore does not let a backup decide (M37), against the test replica set: a
 * collection whose name holds `/`, `\`, `:` or `..`, or that Windows reserves, gets files inside its database's folder,
 * which Datardo, and `mongorestore --dir` when `DATARDO_TEST_MONGO_TOOLS` names the tools, restore under its name; a
 * folder written before the names were encoded is still restored; a TTL index of a backup is kept off a collection that
 * was already there. The databases are `m37b*`; the files are in a temporary folder.
 */
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Target } from '../../../src/shared/target';
import { testServers } from '../servers';
import { liveTransfer, localId, type LiveTransfer } from '../transfer/live';

const tools = process.env['DATARDO_TEST_MONGO_TOOLS'] ?? '';
const run = promisify(execFile);
const databases = ['m37b', 'm37b_restored', 'm37b_tools', 'm37b_old', 'm37b_old_src', 'm37b_ttl', 'm37b_ttl_src'];
const names = ['a/b', 'a\\b', 'a:b', 'con', 'up/../../../escaped'];
let live: LiveTransfer;

function onDatabase(database: string): Target {
  return { kind: 'database', connection: localId, database };
}

/** A plain folder backup of a database, written by `backup.create`; its path. */
async function folderBackup(database: string, collections: readonly string[], under: string): Promise<string> {
  const parent = join(live.folder, under);
  await mkdir(parent, { recursive: true });
  live.answers = { format: 'plain', collections: [...collections] };
  live.paths.push(parent);
  expect(await live.start('backup.create', onDatabase(database))).toEqual({ kind: 'done' });
  const [root] = await readdir(parent);
  return join(parent, root ?? '');
}

async function collectionNames(database: string): Promise<string[]> {
  const listed = (await live.send(database, undefined, 'listCollections', [{}, { nameOnly: true }])) as {
    name: string;
  }[];
  return listed.map((each) => each.name).sort();
}

beforeAll(async () => {
  live = await liveTransfer();
  for (const database of databases) {
    await live.send(database, undefined, 'dropDatabase', []).catch(() => undefined);
  }
  for (const [index, name] of names.entries()) {
    await live.send('m37b', name, 'insertMany', [[{ _id: { $numberInt: String(index) }, name }], {}]);
  }
}, 60_000);

afterAll(async () => {
  for (const database of databases) {
    await live.send(database, undefined, 'dropDatabase', []).catch(() => undefined);
  }
  await live.close();
});

describe('backup.folder-layout', () => {
  it('writes two files per collection, all in the folder of the database, whatever the names', async () => {
    const backup = await folderBackup('m37b', names, 'encoded');
    expect(await readdir(backup)).toEqual(['m37b']);
    expect((await readdir(join(backup, 'm37b'))).sort()).toEqual(
      [
        '%63on.bson',
        '%63on.metadata.json',
        'a%2Fb.bson',
        'a%2Fb.metadata.json',
        'a%3Ab.bson',
        'a%3Ab.metadata.json',
        'a%5Cb.bson',
        'a%5Cb.metadata.json',
        'up%2F..%2F..%2F..%2Fescaped.bson',
        'up%2F..%2F..%2F..%2Fescaped.metadata.json',
      ].sort(),
    );
    expect((await readdir(live.folder)).sort()).toEqual(['encoded']);
  });

  it('restores such a folder under the names of the collections', async () => {
    const backup = join(live.folder, 'encoded', (await readdir(join(live.folder, 'encoded')))[0] ?? '');
    live.answers = { kind: 'folder', 'collections-of-m37b': [...names] };
    live.paths.push(join(backup, 'm37b'));
    expect(await live.start('backup.restore', onDatabase('m37b_restored'))).toEqual({ kind: 'done' });
    expect(await collectionNames('m37b_restored')).toEqual([...names].sort());
    for (const name of names) {
      expect(await live.stored('m37b_restored', name)).toEqual(await live.stored('m37b', name));
    }
  });

  it.skipIf(tools === '')('is restored by mongorestore --dir under the names of the collections', async () => {
    const backup = join(live.folder, 'encoded', (await readdir(join(live.folder, 'encoded')))[0] ?? '');
    const mongorestore = join(tools, process.platform === 'win32' ? 'mongorestore.exe' : 'mongorestore');
    await run(mongorestore, [
      `--uri=${testServers().mongoReplicaSet}`,
      `--dir=${backup}`,
      '--nsFrom=m37b.*',
      '--nsTo=m37b_tools.*',
    ]);
    expect(await collectionNames('m37b_tools')).toEqual([...names].sort());
  });

  it('restores a folder written before the names were encoded, a:b.bson as a:b', async () => {
    await live.send('m37b_old_src', 'ab', 'insertMany', [[{ _id: { $numberInt: '1' } }], {}]);
    const backup = await folderBackup('m37b_old_src', ['ab'], 'old');
    const folder = join(backup, 'm37b_old_src');
    await rename(join(folder, 'ab.bson'), join(folder, 'a:b.bson'));
    const metadata = (await readFile(join(folder, 'ab.metadata.json'), 'utf8')).replace('"ab"', '"a:b"');
    await writeFile(join(folder, 'a:b.metadata.json'), metadata);
    await rename(join(folder, 'ab.metadata.json'), join(live.folder, 'set-aside.json'));
    live.answers = { kind: 'folder' };
    live.paths.push(folder);
    expect(await live.start('backup.restore', onDatabase('m37b_old'))).toEqual({ kind: 'done' });
    expect(await collectionNames('m37b_old')).toEqual(['a:b']);
  });
});

describe('backup.restore', () => {
  it('keeps a TTL index of the backup off a collection that was already there, and its documents', async () => {
    const old = { $date: { $numberLong: '1000000000000' } };
    await live.send('m37b_ttl_src', 'orders', 'insertMany', [[{ _id: { $numberInt: '1' }, at: old }], {}]);
    await live.send('m37b_ttl_src', 'orders', 'createIndexes', [
      [{ key: { at: 1 }, name: 'at_ttl', expireAfterSeconds: 60 }],
    ]);
    await live.send('m37b_ttl_src', 'orders', 'createIndexes', [[{ key: { sku: 1 }, name: 'sku_1' }]]);
    const archive = join(live.folder, 'ttl.agz');
    live.answers = { format: 'archive' };
    live.paths.push(archive);
    expect(await live.start('backup.create', onDatabase('m37b_ttl_src'))).toEqual({ kind: 'done' });
    await live.send('m37b_ttl', 'orders', 'insertMany', [[{ _id: { $numberInt: '2' }, at: old }], {}]);
    live.answers = { kind: 'archive', mode: 'add' };
    live.paths.push(archive);
    expect(await live.start('backup.restore', onDatabase('m37b_ttl'))).toEqual({ kind: 'done' });
    const indexes = (await live.send('m37b_ttl', 'orders', 'listIndexes', [])) as { name: string }[];
    expect(indexes.map((index) => index.name).sort()).toEqual(['_id_', 'sku_1']);
    expect(await live.send('m37b_ttl', 'orders', 'countDocuments', [{}])).toEqual({ $numberInt: '2' });
    expect(live.notices().at(-1)).toBe(
      "Index not created — orders.at_ttl: a TTL index (expireAfterSeconds) would make the server delete documents that were already in the collection; create it from the Indexes section if it's wanted",
    );
  });
});
