/**
 * What the transfer and backup areas read from the disk for their reads (app reads), in the main process: the text of
 * an import file, the names in a folder, the list of collections at the start of an archive, the files of a backup
 * folder and the text of metadata files, gunzipped when they are. Nothing here writes.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { readArchiveCollections } from '../features/backup/archive-read';
import type { FileEntry, FolderListing } from '../features/backup/folder-layout';
import type { ArchiveCollection } from '../features/backup/types';
import { importText } from '../features/transfer/text';
import type { Json } from '../shared/engine-request';
import { jsonFields } from '../features/connection/types';
import { archiveSource } from './transfer-feeds';

/** The largest metadata file read, in bytes (R14.4; Datardo's choice). */
export const largestMetadata = 16 * 1024 * 1024;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** `transfer.read-file` `{ path, most }`: the text of an import file, or `{ error }`. */
export async function readImportFile(path: string, most: number): Promise<string | { readonly error: string }> {
  try {
    if ((await stat(path)).size > most) {
      return { error: importText.tooLarge(`${String(Math.round(most / (1024 * 1024)))} MB`) };
    }
    return await readFile(path, 'utf8');
  } catch (error: unknown) {
    return { error: messageOf(error) };
  }
}

/** `backup.list-names` `{ folder }`: the names of what a folder holds. */
export async function listNames(folder: string): Promise<readonly string[]> {
  return readdir(folder).catch(() => []);
}

/** `backup.read-archive-list` `{ path }`: the collections at the start of an archive, or `{ error }`. */
export async function readArchiveList(
  path: string,
): Promise<readonly ArchiveCollection[] | { readonly error: string }> {
  try {
    return await readArchiveCollections(archiveSource(path));
  } catch (error: unknown) {
    return { error: messageOf(error) };
  }
}

async function filesOf(path: string): Promise<{ files: FileEntry[]; folders: string[] }> {
  const entries = await readdir(path, { withFileTypes: true });
  const files: FileEntry[] = [];
  const folders: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      folders.push(entry.name);
    } else if (entry.isFile()) {
      files.push({ name: entry.name, size: (await stat(join(path, entry.name))).size });
    }
  }
  return { files, folders };
}

/** `backup.list-folder` `{ path }`: the files of a folder and of each of its subfolders, or `{ error }`. */
export async function listFolder(path: string): Promise<FolderListing | { readonly error: string }> {
  try {
    const top = await filesOf(path);
    const folders = await Promise.all(
      top.folders.map(async (name): Promise<FolderListing> => {
        const inner = await filesOf(join(path, name));
        return { name, path: join(path, name), files: inner.files, folders: [] };
      }),
    );
    return { name: basename(path), path, files: top.files, folders };
  } catch (error: unknown) {
    return { error: messageOf(error) };
  }
}

/** `backup.read-metadata` `{ paths }`: the text of each metadata file, gunzipped; `null` for one that can't be read. */
export async function readMetadata(paths: readonly string[]): Promise<readonly (string | null)[]> {
  return Promise.all(
    paths.map(async (path) => {
      try {
        if ((await stat(path)).size > largestMetadata) {
          return null;
        }
        const bytes = await readFile(path);
        const plain =
          bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes, { maxOutputLength: largestMetadata }) : bytes;
        return plain.toString('utf8');
      } catch {
        return null;
      }
    }),
  );
}

/** A text argument of an app action. */
export function textArgOf(args: Json, name: string): string {
  const value = jsonFields(args)[name];
  return typeof value === 'string' ? value : '';
}
