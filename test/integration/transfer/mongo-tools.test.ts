/**
 * Datardo's archives and mongodump's (M25): an archive written by `backup.create` restored by `mongorestore --gzip
 * --archive`, and archives written by `mongodump --archive`, gzipped or not, restored by `backup.restore`, each with
 * every document byte for byte. The MongoDB Database Tools are not installed with the server: these tests run when
 * `DATARDO_TEST_MONGO_TOOLS` names the folder of `mongodump` and `mongorestore` (testing.md), and are skipped
 * otherwise.
 */
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Json } from '../../../src/shared/engine-request';
import { testServers } from '../servers';
import { liveTransfer, localId, type LiveTransfer } from './live';

const tools = process.env['DATARDO_TEST_MONGO_TOOLS'] ?? '';
const run = promisify(execFile);
const databases = ['m25t', 'm25t_tools', 'm25t_gzip', 'm25t_plain'];
let live: LiveTransfer;

const documents: Json[] = [
  {
    _id: { $numberInt: '1' },
    int32: { $numberInt: '42' },
    double: { $numberDouble: '1.0' },
    negativeZero: { $numberDouble: '-0.0' },
    int64: { $numberLong: '9007199254740993' },
    decimal: { $numberDecimal: '1.10' },
    date: { $date: { $numberLong: '1700000000000' } },
    regex: { $regularExpression: { pattern: '^a', options: 'i' } },
    uuid: { $binary: { base64: 'AAECAwQFBgcICQoLDA0ODw==', subType: '04' } },
    timestamp: { $timestamp: { t: 1700000000, i: 7 } },
    min: { $minKey: 1 },
    max: { $maxKey: 1 },
    code: { $code: 'function () { return 1; }' },
    nested: { 'with.dot': { $numberInt: '1' }, $price: { $numberInt: '2' } },
  },
  { _id: { $oid: '65f1c0ffee0000000000000a' }, text: 'é ✓ 漢字' },
];

function tool(name: string): string {
  return join(tools, process.platform === 'win32' ? `${name}.exe` : name);
}

describe.skipIf(tools === '')('mongodump and mongorestore', () => {
  beforeAll(async () => {
    live = await liveTransfer();
    for (const database of databases) {
      await live.send(database, undefined, 'dropDatabase', []).catch(() => undefined);
    }
    await live.send('m25t', 'types', 'insertMany', [documents, {}]);
  }, 60_000);

  afterAll(async () => {
    for (const database of databases) {
      await live.send(database, undefined, 'dropDatabase', []).catch(() => undefined);
    }
    await live.close();
  });

  it('restores with mongorestore --gzip --archive an archive of backup.create, byte for byte', async () => {
    const archive = join(live.folder, 'datardo.agz');
    live.answers = { format: 'archive' };
    live.paths.push(archive);
    expect(await live.start('backup.create', { kind: 'database', connection: localId, database: 'm25t' })).toEqual({
      kind: 'done',
    });
    const uri = testServers().mongoReplicaSet;
    await run(tool('mongorestore'), [
      `--uri=${uri}`,
      '--gzip',
      `--archive=${archive}`,
      '--nsFrom=m25t.*',
      '--nsTo=m25t_tools.*',
    ]);
    expect(await live.stored('m25t_tools', 'types')).toEqual(await live.stored('m25t', 'types'));
  });

  it('restores archives of mongodump --archive, gzipped or not, recognized from their content', async () => {
    const uri = testServers().mongoReplicaSet;
    for (const [gzip, database, name] of [
      [true, 'm25t_gzip', 'dump.bin'],
      [false, 'm25t_plain', 'dump.agz'],
    ] as const) {
      const archive = join(live.folder, name);
      await run(tool('mongodump'), [`--uri=${uri}`, '--db=m25t', `--archive=${archive}`, ...(gzip ? ['--gzip'] : [])]);
      live.answers = { kind: 'archive' };
      live.paths.push(archive);
      expect(await live.start('backup.restore', { kind: 'database', connection: localId, database })).toEqual({
        kind: 'done',
      });
      expect(await live.stored(database, 'types')).toEqual(await live.stored('m25t', 'types'));
    }
  });
});
