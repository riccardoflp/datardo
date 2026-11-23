/**
 * The files of a connection's queries folder (`saved-query.read-folder`): Mongoster's saved query files, read and
 * written unchanged. They come from outside, from a team through git or from someone's hands, so they are read with
 * limits (T5, R14.4): at most {@link queryFilesRead} files, each up to {@link queryFileBytes} bytes, in folders up to
 * {@link queryFolderDepth} levels below the queries folder. Their text is given as it is; parsing it is the features'
 * (`saved-query.parse-file`). Every path given to this module is relative to the queries folder, with `/`, and is
 * refused when it would lead out of it.
 */
import { open, readdir, rename, rmdir, stat, unlink } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { writeAtomically } from './store';

/** How many files are read, the first in order of name, folder by folder (Mongoster's `MAX_FILES`). */
export const queryFilesRead = 2000;

/** The largest file read, in bytes: 1 MB (Mongoster's `MAX_BYTES`). */
export const queryFileBytes = 1_000_000;

/** How many levels of folders below the queries folder are entered (Mongoster's `MAX_DEPTH`). */
export const queryFolderDepth = 6;

/** One file of the queries folder, as read. */
export interface QueryFolderFile {
  /** Its path inside the queries folder, with `/`: `shop/orders/paid.json`. */
  readonly file: string;
  /** Its size in bytes, when it could be read. */
  readonly size: number;
  /** Its text, absent when it is larger than {@link queryFileBytes} or could not be read. */
  readonly text?: string;
  /** Why it could not be read: the system's reason. */
  readonly error?: string;
}

/** What a queries folder holds: its `.json` files, in order of name, folder by folder. */
export interface QueryFolderReading {
  readonly folder: string;
  readonly files: readonly QueryFolderFile[];
}

function isMissing(error: unknown): boolean {
  // A file in place of one of its folders says ENOTDIR on Linux and macOS, ENOENT on Windows: either way it is not there.
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The path of a file inside the queries folder; throws when the path would lead out of it, or is not a file's. */
export function pathInQueriesFolder(folder: string, file: string): string {
  const parts = file.split('/');
  if (isAbsolute(file) || parts.some((part) => part === '' || part === '.' || part === '..' || part.includes('\\'))) {
    throw new Error(`${file} is not a path inside the queries folder.`);
  }
  const root = resolve(folder);
  const full = resolve(root, ...parts);
  const inside = relative(root, full);
  if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) {
    throw new Error(`${file} is not a path inside the queries folder.`);
  }
  return full;
}

async function readText(full: string): Promise<{ readonly size: number; readonly text?: string }> {
  const handle = await open(full, 'r');
  try {
    const { size } = await handle.stat();
    if (size > queryFileBytes) {
      return { size };
    }
    // Read at most one byte more than the limit: a file that grew since `stat` is still refused.
    const buffer = new Uint8Array(queryFileBytes + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return bytesRead > queryFileBytes
      ? { size: bytesRead }
      : { size: bytesRead, text: new TextDecoder('utf-8').decode(buffer.subarray(0, bytesRead)) };
  } finally {
    await handle.close();
  }
}

async function readOneFile(root: string, full: string): Promise<QueryFolderFile> {
  const file = relative(root, full).split(sep).join('/');
  try {
    return { file, ...(await readText(full)) };
  } catch (error: unknown) {
    // A file that cannot be read is reported with the system's reason and skipped; the others are still listed.
    return { file, size: 0, error: reason(error) };
  }
}

async function entriesOf(folder: string, depth: number): Promise<readonly Dirent[]> {
  try {
    const entries = await readdir(folder, { withFileTypes: true });
    return [...entries].sort((first, second) => (first.name < second.name ? -1 : first.name > second.name ? 1 : 0));
  } catch (error: unknown) {
    // The queries folder itself that does not exist yet is empty (the first save creates it); a folder below it that
    // cannot be listed is skipped, as Mongoster does, and the others are read.
    if (depth === 0 && !isMissing(error)) {
      throw error;
    }
    return [];
  }
}

async function walk(root: string, folder: string, depth: number, found: string[]): Promise<void> {
  for (const entry of await entriesOf(folder, depth)) {
    if (found.length >= queryFilesRead) {
      return;
    }
    const full = join(folder, entry.name);
    if (entry.isDirectory() && depth < queryFolderDepth) {
      await walk(root, full, depth + 1, found);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
      found.push(full);
    }
  }
}

/**
 * Reads the `.json` files of a queries folder, ignoring the case of the extension, within the limits. Links are not
 * followed. A queries folder that does not exist is read as empty.
 */
export async function readQueriesFolder(folder: string): Promise<QueryFolderReading> {
  const root = resolve(folder);
  const found: string[] = [];
  await walk(root, root, 0, found);
  const files: QueryFolderFile[] = [];
  for (const full of found) {
    files.push(await readOneFile(root, full));
  }
  return { folder, files };
}

/** Whether something is at a path inside the queries folder. */
export async function isInQueriesFolder(folder: string, file: string): Promise<boolean> {
  try {
    await stat(pathInQueriesFolder(folder, file));
    return true;
  } catch (error: unknown) {
    if (isMissing(error)) {
      return false;
    }
    throw error;
  }
}

/** Writes a saved query file, creating the folders it needs: beside, then renamed over the old one. */
export async function writeQueryFile(folder: string, file: string, text: string): Promise<void> {
  await writeAtomically(pathInQueriesFolder(folder, file), text);
}

/** Renames a saved query file; refused when a file is already at the new path, which is never overwritten. */
export async function renameQueryFile(folder: string, file: string, to: string): Promise<void> {
  const from = pathInQueriesFolder(folder, file);
  const target = pathInQueriesFolder(folder, to);
  if (target.toLowerCase() !== from.toLowerCase() && (await isInQueriesFolder(folder, to))) {
    throw new Error(`${to} already exists.`);
  }
  await rename(from, target);
}

/** Deletes a saved query file, then the folders it leaves empty, up to the queries folder, which is kept. */
export async function deleteQueryFile(folder: string, file: string): Promise<void> {
  const full = pathInQueriesFolder(folder, file);
  await unlink(full);
  const root = resolve(folder);
  for (let current = dirname(full); current !== root && current.startsWith(root + sep); current = dirname(current)) {
    try {
      await rmdir(current);
    } catch {
      // A folder that still holds something (another file, a README) is not empty: it and those above it are kept.
      return;
    }
  }
}
