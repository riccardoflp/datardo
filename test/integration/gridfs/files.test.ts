/**
 * Lists, previews, renames, deletes and drops the files and buckets of GridFS through the runner, against the
 * throwaway MongoDB; and refuses every write on a read-only connection.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FilesPage } from '../../../src/features/gridfs/list';
import { chunksRoundArgs, type PreviewRead } from '../../../src/features/gridfs/preview';
import type { Json } from '../../../src/shared/engine-request';
import { liveGridFs, localId, productionId, type Chosen, type LiveGridFs } from './live';

let live: LiveGridFs;
let written = 0;

beforeAll(async () => {
  live = await liveGridFs('files');
});

afterAll(async () => {
  await live.close();
});

/** Uploads a file of these bytes to `bucket`, adding a revision when its name is there. */
async function stored(bucket: string, name: string, bytes: Uint8Array | string): Promise<Chosen> {
  written += 1;
  const folder = join(live.folder, 'disk', String(written));
  await mkdir(folder, { recursive: true });
  const path = join(folder, name);
  await writeFile(path, bytes);
  const size = typeof bytes === 'string' ? Buffer.byteLength(bytes) : bytes.length;
  const file = live.chosen(path, name, size);
  live.dialogs.push([file]);
  live.answers.push({ 'existing-choice': 'revision' });
  await live.start('gridfs.upload', { connection: localId, database: live.database, bucket });
  live.answers.length = 0;
  return file;
}

function on(bucket: string, more: Readonly<Record<string, Json>> = {}): Json {
  return { connection: localId, database: live.database, bucket, ...more };
}

async function filesOf(bucket: string, filter: Json = {}): Promise<readonly Record<string, unknown>[]> {
  return (await live.send(bucket, 'files', 'find', [filter])) as readonly Record<string, unknown>[];
}

async function chunksOf(bucket: string, id: Json): Promise<readonly unknown[]> {
  return (await live.send(bucket, 'chunks', 'find', [{ files_id: id }])) as readonly unknown[];
}

async function collections(): Promise<readonly string[]> {
  const listed = (await live.engines.send(
    {
      connection: localId,
      request: { engine: 'mongodb', database: live.database, method: 'listCollections', arguments: [{}] },
    },
    AbortSignal.timeout(10_000),
  )) as readonly { name: string }[];
  return listed.map((each) => each.name).sort();
}

async function readOf<T>(feature: string, args: Json): Promise<T> {
  const result = await live.start(feature, args, localId, 'toolbar');
  if (result.kind !== 'read') {
    throw new Error(`${feature} did not read: ${JSON.stringify(result)}`);
  }
  return result.result as T;
}

describe('gridfs.list', () => {
  it('reads a page of the files with their totals, and a filter in both the find and the $match', async () => {
    await stored('listed', 'logo.png', new Uint8Array(1000));
    await stored('listed', 'notes.txt', 'hello');
    const all = await readOf<FilesPage>('gridfs.list', on('listed', { filter: '', page: 0 }));
    expect(all.total).toBe(2);
    expect(all.bytes).toBe(1005);
    expect(all.files.map((file) => file.filename)).toEqual(['notes.txt', 'logo.png']);
    const found = await readOf<FilesPage>('gridfs.list', on('listed', { filter: 'LOGO', page: 0 }));
    expect(found.files.map((file) => file.filename)).toEqual(['logo.png']);
    expect(found.total).toBe(1);
    const refused = await live.start('gridfs.list', on('listed', { filter: '{ length: ' }), localId, 'toolbar');
    expect(refused.kind).toBe('refused');
    expect(refused.kind === 'refused' ? refused.message : '').toMatch(/^Filter:/u);
  });
});

describe('gridfs.preview', () => {
  async function previewOf(file: Chosen, bucket: string): Promise<PreviewRead> {
    const args = on(bucket, { id: file.id });
    const first = await readOf<PreviewRead>('gridfs.preview', args);
    return first.kind === 'chunks' ? readOf<PreviewRead>('gridfs.preview', chunksRoundArgs(args, first.file)) : first;
  }

  it('shows a text as it is, and an SVG with a script as a picture whose bytes are those uploaded', async () => {
    const notes = await stored('previews', 'notes.txt', 'Hello, GridFS!\n');
    expect(await previewOf(notes, 'previews')).toMatchObject({
      kind: 'preview',
      preview: { kind: 'text', text: 'Hello, GridFS!\n', cut: false },
    });
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    const picture = await stored('previews', 'picture.svg', svg);
    const read = await previewOf(picture, 'previews');
    expect(read).toMatchObject({ kind: 'preview', preview: { kind: 'image', contentType: 'image/svg+xml' } });
    const base64 = read.kind === 'preview' && read.preview.kind === 'image' ? read.preview.base64 : '';
    expect(Buffer.from(base64, 'base64').toString('utf8')).toBe(svg);
  });

  it('works on a read-only connection, and says a file deleted meanwhile no longer exists', async () => {
    const notes = await stored('previews', 'ro.txt', 'read only');
    const args = { connection: productionId, database: live.database, bucket: 'previews', id: notes.id };
    const result = await live.start('gridfs.preview', args, productionId, 'inspector');
    expect(result.kind).toBe('read');
    await live.send('previews', 'files', 'deleteOne', [{ _id: notes.id }]);
    expect(await previewOf(notes, 'previews')).toEqual({
      kind: 'preview',
      preview: { kind: 'gone', message: 'The file no longer exists.' },
    });
  });
});

describe('gridfs.rename', () => {
  it('renames logo.png to brand.png: the same _id, size and date, and says so', async () => {
    const logo = await stored('renames', 'logo.png', new Uint8Array(300));
    const [before] = await filesOf('renames', { _id: logo.id });
    live.answers.push({ name: ' brand.png ' });
    await live.start('gridfs.rename', on('renames', { id: logo.id, filename: 'logo.png' }), localId, 'row-menu');
    const [after] = await filesOf('renames', { _id: logo.id });
    expect(after).toEqual({ ...before, filename: 'brand.png' });
    expect(live.notifications().at(-1)).toBe('Renamed logo.png to brand.png.');
  });

  it('the same name sends nothing and says nothing; a read-only connection is refused', async () => {
    const notes = await stored('renames', 'same.txt', 'x');
    const count = live.notifications().length;
    live.answers.push({ name: 'same.txt' });
    await live.start('gridfs.rename', on('renames', { id: notes.id }), localId, 'row-menu');
    expect(live.notifications()).toHaveLength(count);
    const refused = await live.start(
      'gridfs.rename',
      { connection: productionId, database: live.database, bucket: 'renames', id: notes.id },
      productionId,
    );
    expect(refused).toMatchObject({ kind: 'refused', code: 'gridfs.rename/read-only' });
  });
});

describe('gridfs.delete', () => {
  it('deletes only the revision started on, its files document and its chunks, and says so', async () => {
    const first = await stored('deletes', 'logo.png', new Uint8Array(600_000));
    const second = await stored('deletes', 'logo.png', new Uint8Array(10));
    await live.start('gridfs.delete', on('deletes', { id: first.id }), localId, 'row-menu');
    expect(live.confirmed.at(-1)).toBe(`Delete logo.png (586 KB) from Local › ${live.database} › deletes?`);
    expect(await filesOf('deletes', { _id: first.id })).toEqual([]);
    expect(await chunksOf('deletes', first.id)).toEqual([]);
    expect(await filesOf('deletes', { _id: second.id })).toHaveLength(1);
    expect(live.notifications().at(-1)).toBe('Deleted logo.png.');
  });

  it('cancelling the confirmation deletes nothing; a read-only connection is refused', async () => {
    const kept = await stored('deletes', 'kept.png', new Uint8Array(10));
    live.confirmAnswer = false;
    try {
      await live.start('gridfs.delete', on('deletes', { id: kept.id }), localId, 'row-menu');
    } finally {
      live.confirmAnswer = true;
    }
    expect(await filesOf('deletes', { _id: kept.id })).toHaveLength(1);
    const refused = await live.start(
      'gridfs.delete',
      { connection: productionId, database: live.database, bucket: 'deletes', id: kept.id },
      productionId,
    );
    expect(refused).toMatchObject({
      kind: 'refused',
      code: 'gridfs.delete/read-only',
      message: "The connection Production is read-only: files can't be changed.",
    });
  });
});

describe('gridfs.drop-bucket', () => {
  it('drops fs.files and fs.chunks, and leaves the bucket photos and the other collections', async () => {
    await stored('fs', 'a.txt', 'a');
    await stored('photos', 'b.txt', 'b');
    await live.engines.send(
      {
        connection: localId,
        request: {
          engine: 'mongodb',
          database: live.database,
          collection: 'orders',
          method: 'insertOne',
          arguments: [{ n: 1 }],
        },
      },
      AbortSignal.timeout(10_000),
    );
    await live.start('gridfs.drop-bucket', on('fs'), localId, 'tree-menu');
    expect(live.confirmed.at(-1)).toBe(`Delete the GridFS bucket Local › ${live.database} › fs and its 1 file?`);
    const left = await collections();
    expect(left).not.toContain('fs.files');
    expect(left).not.toContain('fs.chunks');
    expect(left).toEqual(expect.arrayContaining(['photos.files', 'photos.chunks', 'orders']));
  });

  it('a read-only connection is refused', async () => {
    const refused = await live.start(
      'gridfs.drop-bucket',
      { connection: productionId, database: live.database, bucket: 'photos' },
      productionId,
    );
    expect(refused).toMatchObject({ kind: 'refused', code: 'gridfs.drop-bucket/read-only' });
    expect(await collections()).toContain('photos.files');
  });
});
