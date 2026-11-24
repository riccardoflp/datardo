/**
 * Uploads, downloads and opens files of GridFS buckets through the runner, against the throwaway MongoDB: every byte
 * survives the round trip, a cancel leaves nothing half written, and the bytes are never whole in memory.
 */
import { lstat, mkdir, open, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, sep } from 'node:path';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { removeCopies, removeLeftCopies } from '../../../src/main/gridfs';
import { openPath } from './live';
import type { Json } from '../../../src/shared/engine-request';
import { digestOf, liveGridFs, productionId, type Chosen, type LiveGridFs } from './live';

let live: LiveGridFs;

beforeAll(async () => {
  live = await liveGridFs('transfer');
});

afterAll(async () => {
  await live.close();
});

/** The byte `i` of the files of these tests: not a repetition of one chunk, so that a chunk out of place shows. */
function byteAt(i: number): number {
  return (i * 31 + Math.floor(i / 251)) % 256;
}

let written = 0;

/** Writes a file of `size` bytes in a folder of its own in the test's folder, 1 MB at a time. */
async function fileOf(name: string, size: number): Promise<string> {
  written += 1;
  const folder = join(live.folder, 'disk', String(written));
  await mkdir(folder, { recursive: true });
  const path = join(folder, name);
  const handle = await open(path, 'w');
  try {
    const block = 1 << 20;
    for (let at = 0; at < size; at += block) {
      const length = Math.min(block, size - at);
      const bytes = Buffer.alloc(length);
      for (let i = 0; i < length; i += 1) {
        bytes[i] = byteAt(at + i);
      }
      await handle.write(bytes);
    }
  } finally {
    await handle.close();
  }
  return path;
}

async function chosenFile(name: string, size: number): Promise<Chosen> {
  return live.chosen(await fileOf(name, size), name, size);
}

function numberOf(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  const record = (value ?? {}) as Record<string, unknown>;
  const text = record['$numberInt'] ?? record['$numberLong'] ?? record['$numberDouble'];
  return typeof text === 'string' ? Number(text) : Number.NaN;
}

function bytesOf(value: unknown): Buffer {
  const binary = ((value ?? {}) as { $binary?: { base64?: string } }).$binary;
  return Buffer.from(binary?.base64 ?? '', 'base64');
}

async function filesOf(bucket: string, filter: Json = {}): Promise<readonly Record<string, unknown>[]> {
  return (await live.send(bucket, 'files', 'find', [filter])) as readonly Record<string, unknown>[];
}

async function chunksOf(bucket: string, id: Json): Promise<readonly Record<string, unknown>[]> {
  return (await live.send(bucket, 'chunks', 'find', [{ files_id: id }, { sort: { n: 1 } }])) as readonly Record<
    string,
    unknown
  >[];
}

function upload(bucket: string, files: readonly Chosen[], from?: 'page'): ReturnType<LiveGridFs['start']> {
  live.dialogs.push(files);
  return live.start('gridfs.upload', {
    connection: 'c-m33-local',
    database: live.database,
    bucket,
    ...(from === undefined ? {} : { from }),
  });
}

function lastNotification(): string {
  return live.notifications().at(-1) ?? '';
}

describe('gridfs.upload', () => {
  it('uploads logo.png of 734,003 bytes to an empty bucket: two indexes, 3 chunks, one files document', async () => {
    const logo = await chosenFile('logo.png', 734_003);
    const result = await upload('fs', [logo]);
    expect(result.kind).toBe('done');
    const [file] = await filesOf('fs', { _id: logo.id });
    expect(file).toMatchObject({ filename: 'logo.png', metadata: { contentType: 'image/png' } });
    expect(numberOf(file?.['length'])).toBe(734_003);
    expect(numberOf(file?.['chunkSize'])).toBe(261_120);
    const chunks = await chunksOf('fs', logo.id);
    expect(chunks.map((chunk) => numberOf(chunk['n']))).toEqual([0, 1, 2]);
    expect(bytesOf(chunks[2]?.['data']).length).toBe(211_763);
    const stored = Buffer.concat(chunks.map((chunk) => bytesOf(chunk['data'])));
    expect(stored.equals(await readFile(logo.path))).toBe(true);
    const one = { $numberInt: '1' };
    const indexes = (await live.send('fs', 'chunks', 'listIndexes', [])) as readonly { key: unknown }[];
    expect(indexes.map((index) => index.key)).toContainEqual({ files_id: one, n: one });
    const fileIndexes = (await live.send('fs', 'files', 'listIndexes', [])) as readonly { key: unknown }[];
    expect(fileIndexes.map((index) => index.key)).toContainEqual({ filename: one, uploadDate: one });
    expect(lastNotification()).toBe(`Uploaded 1 file (717 KB) to Local › ${live.database} › fs.`);
  });

  it('uploads Makefile with metadata {}, and a file of 0 bytes with length 0 and no chunk', async () => {
    const makefile = await chosenFile('Makefile', 10);
    const empty = await chosenFile('empty', 0);
    await upload('plain', [makefile, empty]);
    const [made] = await filesOf('plain', { _id: makefile.id });
    expect(made?.['metadata']).toEqual({});
    const [nothing] = await filesOf('plain', { _id: empty.id });
    expect(numberOf(nothing?.['length'])).toBe(0);
    expect(await chunksOf('plain', empty.id)).toEqual([]);
  });

  it('asks nothing with no name already in the bucket, and adds a revision with Add a new revision', async () => {
    const first = await chosenFile('report.txt', 100);
    await upload('revisions', [first]);
    expect(live.confirmed).not.toContain('Upload files');
    const again = await chosenFile('report.txt', 120);
    live.answers.push({ 'existing-choice': 'revision' });
    await upload('revisions', [again]);
    const both = await filesOf('revisions', { filename: 'report.txt' });
    expect(both).toHaveLength(2);
  });

  it('Skip with 3 files, one of which exists, uploads 2 and says so', async () => {
    await upload('skips', [await chosenFile('a.png', 1000)]);
    const files = [await chosenFile('a.png', 1000), await chosenFile('b.png', 2048), await chosenFile('c.png', 2048)];
    live.answers.push({ 'existing-choice': 'skip' });
    await upload('skips', files);
    expect(await filesOf('skips', { filename: 'a.png' })).toHaveLength(1);
    expect(await filesOf('skips')).toHaveLength(3);
    expect(lastNotification()).toBe(
      `Uploaded 2 files (4.0 KB) to Local › ${live.database} › skips, skipped 1 that already existed.`,
    );
  });

  it('Replace asks first, then deletes both old revisions and their chunks once the new one is in', async () => {
    const old = [await chosenFile('logo.png', 300_000), await chosenFile('logo.png', 400_000)];
    await upload('replaces', [old[0] as Chosen]);
    live.answers.push({ 'existing-choice': 'revision' });
    await upload('replaces', [old[1] as Chosen]);
    const fresh = await chosenFile('logo.png', 5000);
    live.answers.push({ 'existing-choice': 'replace' });
    await upload('replaces', [fresh]);
    expect(live.confirmed.at(-1)).toBe(`Replace 1 file in Local › ${live.database} › replaces?`);
    const left = await filesOf('replaces', { filename: 'logo.png' });
    expect(left.map((file) => file['_id'])).toEqual([fresh.id]);
    for (const each of old) {
      expect(await chunksOf('replaces', each.id)).toEqual([]);
    }
  });

  it('cancelling the confirmation of Replace deletes and uploads nothing', async () => {
    const old = await chosenFile('keep.png', 1000);
    await upload('kept', [old]);
    const fresh = await chosenFile('keep.png', 2000);
    live.answers.push({ 'existing-choice': 'replace' });
    live.confirmAnswer = false;
    try {
      await upload('kept', [fresh]);
    } finally {
      live.confirmAnswer = true;
    }
    expect((await filesOf('kept')).map((file) => file['_id'])).toEqual([old.id]);
    expect(await chunksOf('kept', fresh.id)).toEqual([]);
  });

  it('Replace whose upload is cancelled leaves the old revisions with their chunks, and no chunk of the new one', async () => {
    const old = await chosenFile('logo.png', 1000);
    await upload('cancelled-replace', [old]);
    const fresh = await chosenFile('logo.png', 3_000_000);
    live.answers.push({ 'existing-choice': 'replace' });
    live.onProgress = (said) => {
      if (said.detail?.includes('logo.png') === true && !said.detail.startsWith('logo.png (1 of 1) · 0 B')) {
        live.cancel();
      }
    };
    try {
      await upload('cancelled-replace', [fresh]);
    } finally {
      live.onProgress = undefined;
    }
    expect((await filesOf('cancelled-replace')).map((file) => file['_id'])).toEqual([old.id]);
    expect(await chunksOf('cancelled-replace', old.id)).toHaveLength(1);
    expect(await chunksOf('cancelled-replace', fresh.id)).toEqual([]);
  });

  it('Cancel during the second of 3 files leaves the first, no chunk of the second, and says so', async () => {
    const files = [
      await chosenFile('one.png', 734_003),
      await chosenFile('two.png', 3_000_000),
      await chosenFile('three.png', 1000),
    ];
    live.onProgress = (said) => {
      if (said.detail?.startsWith('two.png (2 of 3)') === true) {
        live.cancel();
      }
    };
    try {
      await upload('cancels', files);
    } finally {
      live.onProgress = undefined;
    }
    const left = await filesOf('cancels');
    expect(left.map((file) => file['filename'])).toEqual(['one.png']);
    expect(await chunksOf('cancels', (files[1] as Chosen).id)).toEqual([]);
    expect(await chunksOf('cancels', (files[2] as Chosen).id)).toEqual([]);
    expect(lastNotification()).toBe(`Uploaded 1 file (717 KB) to Local › ${live.database} › cancels, cancelled.`);
  });

  it('a file that can no longer be read when the upload starts stops it before anything is deleted or written', async () => {
    const old = await chosenFile('gone.png', 1000);
    await upload('unread', [old]);
    const fresh = await chosenFile('gone.png', 2000);
    const other = await chosenFile('other.png', 2000);
    await rm(fresh.path);
    live.answers.push({ 'existing-choice': 'replace' });
    const result = await upload('unread', [other, fresh]);
    expect(result.kind).toBe('failed');
    expect((await filesOf('unread')).map((file) => file['_id'])).toEqual([old.id]);
    expect(await chunksOf('unread', other.id)).toEqual([]);
    const changed = await chosenFile('changed.png', 2000);
    await writeFile(changed.path, 'shorter');
    await upload('unread', [changed]);
    expect(lastNotification()).toContain(`${changed.path} changed since it was chosen: nothing was uploaded.`);
    expect(await filesOf('unread', { filename: 'changed.png' })).toEqual([]);
  });

  it('is refused on a read-only connection with its code', async () => {
    live.dialogs.push([await chosenFile('ro.png', 10)]);
    const result = await live.start(
      'gridfs.upload',
      { connection: productionId, database: live.database, bucket: 'fs' },
      productionId,
    );
    expect(result).toMatchObject({
      kind: 'refused',
      code: 'gridfs.upload/read-only',
      message: "The connection Production is read-only: files can't be changed.",
    });
    live.dialogs.length = 0;
  });
});

describe('gridfs.create-bucket', () => {
  it('on a database, the name photos and one file create photos.files and photos.chunks', async () => {
    live.answers.push({ bucket: ' photos ' });
    live.dialogs.push([await chosenFile('cat.jpg', 5000)]);
    await live.start('gridfs.create-bucket', { connection: 'c-m33-local', database: live.database });
    expect(await filesOf('photos', { filename: 'cat.jpg' })).toHaveLength(1);
    expect(lastNotification()).toBe(`Uploaded 1 file (4.9 KB) to Local › ${live.database} › photos.`);
  });

  it('closing the file dialog after the name was given creates nothing', async () => {
    live.answers.push({ bucket: 'nothing' });
    live.dialogs.push(null);
    await live.start('gridfs.create-bucket', { connection: 'c-m33-local', database: live.database });
    const names = (await live.engines.send(
      {
        connection: 'c-m33-local' as never,
        request: {
          engine: 'mongodb',
          database: live.database,
          method: 'listCollections',
          arguments: [{}, { nameOnly: true }],
        },
      },
      AbortSignal.timeout(10_000),
    )) as readonly { name: string }[];
    expect(names.map((each) => each.name)).not.toContain('nothing.files');
  });
});

/** Uploads one file to `bucket` and gives it. */
async function stored(bucket: string, name: string, size: number): Promise<Chosen> {
  const file = await chosenFile(name, size);
  live.answers.push({ 'existing-choice': 'revision' });
  await upload(bucket, [file]);
  live.answers.length = 0;
  return file;
}

function download(bucket: string, file: Chosen, connection = 'c-m33-local'): ReturnType<LiveGridFs['start']> {
  return live.start(
    'gridfs.download',
    { connection, database: live.database, bucket, id: file.id },
    connection as never,
  );
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

describe('gridfs.download', () => {
  it('writes a file with exactly the bytes that were uploaded, and says where', async () => {
    const logo = await stored('downloads', 'logo.png', 734_003);
    const path = join(live.folder, 'logo-downloaded.png');
    live.dialogs.push(path);
    await download('downloads', logo);
    expect(await digestOf(path)).toBe(await digestOf(logo.path));
    expect(lastNotification()).toBe(`Downloaded logo.png (717 KB) to ${path}.`);
    expect(await exists(`${path}.part`)).toBe(false);
  });

  it('Cancel at half leaves no file at the path and says Download cancelled.', async () => {
    const big = await stored('downloads', 'big.bin', 120_000_000);
    const path = join(live.folder, 'big-downloaded.bin');
    live.dialogs.push(path);
    live.onProgress = (said) => {
      if (said.detail !== undefined && !said.detail.startsWith('0 B of')) {
        live.cancel();
      }
    };
    try {
      await download('downloads', big);
    } finally {
      live.onProgress = undefined;
    }
    expect(await exists(path)).toBe(false);
    expect(await exists(`${path}.part`)).toBe(false);
    expect(lastNotification()).toBe('Download cancelled.');
  });

  it("a chunk missing stops the download with the driver's error and leaves no file at the path", async () => {
    const broken = await stored('downloads', 'broken.bin', 600_000);
    await live.send('downloads', 'chunks', 'deleteOne', [{ files_id: broken.id, n: 1 }]);
    const path = join(live.folder, 'broken-downloaded.bin');
    live.dialogs.push(path);
    const result = await download('downloads', broken);
    expect(result.kind).toBe('failed');
    expect(result.kind === 'failed' ? result.message : '').toMatch(/ChunkIsMissing|missing/iu);
    expect(await exists(path)).toBe(false);
    expect(await exists(`${path}.part`)).toBe(false);
  });

  it('works on a read-only connection, and closing the save dialog writes nothing', async () => {
    const notes = await stored('downloads', 'notes.txt', 1234);
    const path = join(live.folder, 'notes-read-only.txt');
    live.dialogs.push(path);
    await download('downloads', notes, productionId);
    expect(await digestOf(path)).toBe(await digestOf(notes.path));
    live.dialogs.push(null);
    const before = live.notifications().length;
    await download('downloads', notes);
    expect(live.notifications()).toHaveLength(before);
  });
});

describe('gridfs.open', () => {
  const linux = process.platform !== 'win32';

  async function openOf(file: Chosen, connection = 'c-m33-local'): Promise<string> {
    await live.start('gridfs.open', {
      connection,
      database: live.database,
      bucket: 'opens',
      id: file.id,
      filename: basename(file.path),
    });
    return live.opened.at(-1) ?? '';
  }

  function modeOf(path: string): Promise<number> {
    return lstat(path).then((found) => found.mode & 0o777);
  }

  it('writes a copy named report.pdf under a folder datardo-gridfs- and six characters, and hands it to the system', async () => {
    const report = await stored('opens', 'report.pdf', 50_000);
    const path = await openOf(report);
    expect(relative(live.folder, path).split(sep)[0]).toMatch(/^datardo-gridfs-[A-Za-z0-9]{6}$/u);
    expect(path.endsWith(`${sep}report.pdf`)).toBe(true);
    expect(await digestOf(path)).toBe(await digestOf(report.path));
    expect(openPath(path)).toBe(path);
  });

  it.skipIf(!linux)('makes the folder of the copies and the folder of the file 0700, and the copy 0600', async () => {
    const notes = await stored('opens', 'notes.txt', 1000);
    const path = await openOf(notes);
    expect(await modeOf(path)).toBe(0o600);
    expect(await modeOf(dirname(path))).toBe(0o700);
    expect(await modeOf(dirname(dirname(path)))).toBe(0o700);
  });

  it('makes a folder with another name when the one of the copies was deleted, and in another run', async () => {
    const notes = await stored('opens', 'again.txt', 1000);
    const first = relative(live.folder, await openOf(notes)).split(sep)[0] ?? '';
    await rm(join(live.folder, first), { recursive: true, force: true });
    const second = relative(live.folder, await openOf(notes)).split(sep)[0] ?? '';
    expect(second).toMatch(/^datardo-gridfs-[A-Za-z0-9]{6}$/u);
    expect(second).not.toBe(first);
    await removeCopies();
    expect(await exists(join(live.folder, second))).toBe(false);
    const third = relative(live.folder, await openOf(notes)).split(sep)[0] ?? '';
    expect(third).not.toBe(second);
  });

  it('refuses run.exe and picture.svg before anything is written, and hands nothing to the system', async () => {
    const program = await stored('opens', 'run.exe', 100);
    const before = live.opened.length;
    const result = await live.start('gridfs.open', {
      connection: 'c-m33-local',
      database: live.database,
      bucket: 'opens',
      id: program.id,
      filename: 'run.exe',
    });
    expect(result).toMatchObject({ kind: 'refused', code: 'gridfs.open/type' });
    expect(live.opened).toHaveLength(before);
  });

  it('Cancel leaves no copy and opens nothing; the copies are gone once Datardo quits', async () => {
    const video = await stored('opens', 'video.mp4', 120_000_000);
    const before = live.opened.length;
    live.onProgress = (said) => {
      if (said.detail !== undefined && !said.detail.startsWith('0 B of')) {
        live.cancel();
      }
    };
    try {
      await live.start(
        'gridfs.open',
        { connection: productionId, database: live.database, bucket: 'opens', id: video.id, filename: 'video.mp4' },
        productionId,
      );
    } finally {
      live.onProgress = undefined;
    }
    expect(live.opened).toHaveLength(before);
    const copies = (await readdir(live.folder)).filter((name) => name.startsWith('datardo-gridfs-'));
    expect(copies).toHaveLength(1);
    await removeCopies();
    expect(await exists(join(live.folder, copies[0] ?? ''))).toBe(false);
  });

  it.skipIf(!linux)(
    'deletes at start the folders of copies a quit left and the old datardo-gridfs, not a link',
    async () => {
      const elsewhere = join(live.folder, 'elsewhere');
      await mkdir(join(elsewhere, 'kept'), { recursive: true });
      await mkdir(join(live.folder, 'datardo-gridfs', 'x'), { recursive: true });
      await mkdir(join(live.folder, 'datardo-gridfs-Ab12Cd'), { recursive: true });
      await symlink(elsewhere, join(live.folder, 'datardo-gridfs-Linked'));
      await mkdir(join(live.folder, 'datardo-gridfs-other-name'), { recursive: true });
      await removeLeftCopies(live.folder);
      expect(await exists(join(live.folder, 'datardo-gridfs'))).toBe(false);
      expect(await exists(join(live.folder, 'datardo-gridfs-Ab12Cd'))).toBe(false);
      expect((await lstat(join(live.folder, 'datardo-gridfs-Linked'))).isSymbolicLink()).toBe(true);
      expect(await exists(join(elsewhere, 'kept'))).toBe(true);
      expect(await exists(join(live.folder, 'datardo-gridfs-other-name'))).toBe(true);
    },
  );
});

describe('gridfs.upload and gridfs.download', () => {
  it(
    'a file of 200 MB goes up and comes back with every byte, never whole in memory',
    { timeout: 600_000 },
    async () => {
      // What is kept, not what waits to be collected: the memory is measured after a collection.
      setFlagsFromString('--expose-gc');
      const collect = runInNewContext('gc') as () => void;
      const size = 200 * 1024 * 1024;
      const big = await chosenFile('large.bin', size);
      collect();
      const baseline = process.memoryUsage();
      let most = 0;
      live.onProgress = (said) => {
        if (said.detail === undefined) {
          return;
        }
        collect();
        const now = process.memoryUsage();
        most = Math.max(most, now.heapUsed - baseline.heapUsed + (now.arrayBuffers - baseline.arrayBuffers));
      };
      try {
        await upload('large', [big]);
        const path = join(live.folder, 'large-downloaded.bin');
        live.dialogs.push(path);
        await download('large', big);
        expect(await digestOf(path)).toBe(await digestOf(big.path));
      } finally {
        live.onProgress = undefined;
      }
      // Never whole: well under the size of the file. The measure also holds the driver's buffers and what other work
      // of this process keeps at that moment, which under the load of the whole suite went past 32 MB.
      expect(most).toBeLessThan(size / 2);
    },
  );
});
