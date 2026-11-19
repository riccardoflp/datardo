import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteQueryFile,
  pathInQueriesFolder,
  readQueriesFolder,
  renameQueryFile,
  writeQueryFile,
} from '../../../src/storage/queries-folder';

const recorded = join(import.meta.dirname, '..', '..', 'fixtures', 'saved-query', 'mongoster-0.8.0');

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'datardo-queries-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

async function put(file: string, content: string | Uint8Array): Promise<void> {
  const full = join(folder, ...file.split('/'));
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, content);
}

describe('the files of a queries folder', () => {
  it('reads the folder Mongoster 0.8.0 wrote, as it is, in order of name, folder by folder', async () => {
    const reading = await readQueriesFolder(recorded);
    expect(reading.files.map((each) => each.file)).toEqual([
      'misc/mine.json',
      'shop/orders/all.json',
      'shop/orders/paid-this-month.json',
      'shop/orders/totals-by-customer.json',
    ]);
    expect(reading.files[1]?.text).toBe(await readFile(join(recorded, 'shop', 'orders', 'all.json'), 'utf8'));
  });

  it('reads a folder that does not exist as empty', async () => {
    expect(await readQueriesFolder(join(folder, 'not-yet'))).toEqual({ folder: join(folder, 'not-yet'), files: [] });
  });

  it('reads PAID.JSON and not notes.txt', async () => {
    await put('shop/orders/PAID.JSON', '{}');
    await put('shop/orders/notes.txt', 'x');
    expect((await readQueriesFolder(folder)).files.map((each) => each.file)).toEqual(['shop/orders/PAID.JSON']);
  });

  it('gives no text for a file of 2 MB, and its size', async () => {
    await put('big.json', new Uint8Array(2_000_000));
    expect((await readQueriesFolder(folder)).files).toEqual([{ file: 'big.json', size: 2_000_000 }]);
  });

  it('does not enter a folder seven levels below the queries folder', async () => {
    await put('1/2/3/4/5/6/six.json', '{}');
    await put('1/2/3/4/5/6/7/seven.json', '{}');
    expect((await readQueriesFolder(folder)).files.map((each) => each.file)).toEqual(['1/2/3/4/5/6/six.json']);
  });

  it('reads 2,000 of 2,500 files', { timeout: 60_000 }, async () => {
    await mkdir(join(folder, 'q'));
    for (let start = 0; start < 2500; start += 250) {
      await Promise.all(
        Array.from({ length: 250 }, (_, index) =>
          writeFile(join(folder, 'q', `${String(start + index).padStart(4, '0')}.json`), '{}'),
        ),
      );
    }
    const files = (await readQueriesFolder(folder)).files;
    expect(files).toHaveLength(2000);
    expect(files.at(-1)?.file).toBe('q/1999.json');
  });

  it('writes a file, creating its folders, renames it, and deletes it with the folders it leaves empty', async () => {
    await writeQueryFile(folder, 'shop/orders/paid.json', '{}\n');
    expect(await readFile(join(folder, 'shop', 'orders', 'paid.json'), 'utf8')).toBe('{}\n');
    await renameQueryFile(folder, 'shop/orders/paid.json', 'shop/orders/paid-this-month.json');
    expect(await readdir(join(folder, 'shop', 'orders'))).toEqual(['paid-this-month.json']);
    await deleteQueryFile(folder, 'shop/orders/paid-this-month.json');
    expect(await readdir(folder)).toEqual([]);
    expect((await stat(folder)).isDirectory()).toBe(true);
  });

  it('leaves the other files of a folder when one is deleted', async () => {
    await put('shop/orders/a.json', '{}');
    await put('shop/orders/b.json', '{}');
    await deleteQueryFile(folder, 'shop/orders/a.json');
    expect(await readdir(join(folder, 'shop', 'orders'))).toEqual(['b.json']);
  });

  it('never renames over another file', async () => {
    await put('shop/a.json', 'a');
    await put('shop/b.json', 'b');
    await expect(renameQueryFile(folder, 'shop/a.json', 'shop/b.json')).rejects.toThrow('already exists');
    expect(await readFile(join(folder, 'shop', 'b.json'), 'utf8')).toBe('b');
  });

  it('refuses a path that leaves the queries folder', async () => {
    for (const file of ['../outside.json', 'shop/../../x.json', '/etc/x.json', 'C:\\x.json', 'a\\..\\..\\x.json', '']) {
      expect(() => pathInQueriesFolder(folder, file)).toThrow('is not a path inside the queries folder');
    }
    await expect(writeQueryFile(folder, '../outside.json', '{}')).rejects.toThrow();
  });
});
