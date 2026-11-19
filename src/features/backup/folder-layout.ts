/**
 * Feature: backup.folder-layout
 *
 * What a backup folder holds, the same as `mongodump --out` writes and `mongorestore --dir` reads: a subfolder per
 * database, and for each collection `<name>.bson` (its documents as stored, one after the other) and
 * `<name>.metadata.json`, gzipped as `.bson.gz` and `.metadata.json.gz`; a view has only its metadata. Also the
 * command that restores a backup and the name of a new backup that replaces nothing.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, FileStep, Step } from '../../shared/feature';
import type { ConnectionId } from '../../shared/ids';
import { freeName, safeFileName } from '../task/file-names';
import { pathIn } from '../task/run';
import { compareNames, isObject } from '../tree/types';
import {
  isJsonDocument,
  namespaceOf,
  type BackupChoice,
  type BackupCollection,
  type BackupDatabase,
  type BackupDetails,
  type BackupFormat,
  type CollectionInfo,
  type JsonDocument,
} from './types';

/**
 * The metadata of a collection as mongodump writes it, its keys in mongodump's order: `options` (when there are any),
 * `indexes` (without `ns`; none for a view), `uuid` (when known), `collectionName`, `type`.
 */
export function collectionMetadata(collection: CollectionInfo, indexes: readonly JsonDocument[]): JsonDocument {
  const options = collection.options ?? {};
  const kept = collection.type === 'view' ? [] : indexes.map(({ ns: _ns, ...index }) => index);
  return {
    ...(Object.keys(options).length > 0 ? { options } : {}),
    indexes: kept,
    ...(collection.uuid === undefined ? {} : { uuid: collection.uuid }),
    collectionName: collection.name,
    type: collection.type,
  };
}

/** The text of a metadata file: canonical Extended JSON, on one line. */
export function metadataText(metadata: JsonDocument): string {
  return JSON.stringify(metadata);
}

/** The names of a collection's two files in the folder of its database, compressed or not. */
export function collectionFileNames(
  collection: string,
  format: Exclude<BackupFormat, 'archive'>,
): { readonly documents: string; readonly metadata: string } {
  const gzip = format === 'gzip' ? '.gz' : '';
  return { documents: `${collection}.bson${gzip}`, metadata: `${collection}.metadata.json${gzip}` };
}

/** A file of a folder, with its size in bytes. */
export interface FileEntry {
  readonly name: string;
  readonly size: number;
}

/** What the main process lists of a folder: its files and, one level down, its subfolders and their files. */
export interface FolderListing {
  readonly name: string;
  readonly path: string;
  readonly files: readonly FileEntry[];
  readonly folders: readonly FolderListing[];
}

const backupFile = /^(.+)\.(bson|metadata\.json)(\.gz)?$/u;

/** The collections whose files a folder holds, `system.*` left out, sorted by name. */
export function scanDatabase(files: readonly FileEntry[]): readonly BackupCollection[] {
  const found = new Map<string, BackupCollection>();
  for (const file of files) {
    const match = backupFile.exec(file.name);
    const name = match?.[1];
    if (match !== null && name !== undefined && !name.startsWith('system.')) {
      const known = found.get(name) ?? { name, size: 0 };
      found.set(
        name,
        match[2] === 'bson' ? { ...known, bson: file.name, size: file.size } : { ...known, metadata: file.name },
      );
    }
  }
  return [...found.values()].sort((one, other) => compareNames(one.name, other.name));
}

/**
 * The databases of a backup folder: the folder itself, named after it, when it holds backup files; otherwise each of
 * its subfolders that does, sorted by name. None when no such files are found at either level.
 */
export function scanBackup(listing: FolderListing): readonly BackupDatabase[] {
  const own = scanDatabase(listing.files);
  if (own.length > 0) {
    return [{ name: listing.name, folder: listing.path, collections: own }];
  }
  return listing.folders
    .map((folder) => ({ name: folder.name, folder: folder.path, collections: scanDatabase(folder.files) }))
    .filter((database) => database.collections.length > 0)
    .sort((one, other) => compareNames(one.name, other.name));
}

/**
 * The command that restores a backup with the MongoDB tools: `mongorestore --gzip --archive="<file>"`,
 * `mongorestore --gzip --dir "<folder>"` or `mongorestore --dir "<folder>"`.
 */
export function mongorestoreCommand(path: string, format: BackupFormat): string {
  switch (format) {
    case 'archive':
      return `mongorestore --gzip --archive="${path}"`;
    case 'gzip':
      return `mongorestore --gzip --dir "${path}"`;
    case 'plain':
      return `mongorestore --dir "${path}"`;
  }
}

/**
 * `path`, or `path` with `_2`, `_3`… added before `extension` while `existing` holds it: a new backup folder and the
 * output of a scheduled task never replace something.
 */
export function uniquePath(path: string, existing: ReadonlySet<string>, extension = ''): string {
  return freeName(path, extension, (candidate) => existing.has(candidate));
}

/** The UUID of `listCollections`'s `info.uuid`, a binary of subtype 4, in hexadecimal. */
export function uuidHex(value: unknown): string | undefined {
  const binary = isObject(value) ? value['$binary'] : undefined;
  const base64 = isObject(binary) ? binary['base64'] : undefined;
  if (typeof base64 !== 'string') {
    return undefined;
  }
  return Array.from(atob(base64), (character) => character.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

/** A collection of a `listCollections` reply, as a backup describes it. */
export function collectionInfoOf(entry: unknown): CollectionInfo | undefined {
  if (!isObject(entry) || typeof entry['name'] !== 'string') {
    return undefined;
  }
  const options = entry['options'] as Json | undefined;
  const uuid = uuidHex(isObject(entry['info']) ? entry['info']['uuid'] : undefined);
  return {
    name: entry['name'],
    type: typeof entry['type'] === 'string' ? entry['type'] : 'collection',
    ...(isJsonDocument(options) ? { options } : {}),
    ...(uuid === undefined ? {} : { uuid }),
  };
}

/** The collections a backup saves of a `listCollections` reply: not `system.*`, sorted by name. */
export function backupCollections(reply: unknown): readonly CollectionInfo[] {
  const entries: readonly unknown[] = Array.isArray(reply) ? reply : [];
  return entries
    .map(collectionInfoOf)
    .filter((info): info is CollectionInfo => info !== undefined && !info.name.startsWith('system.'))
    .sort((one, other) => compareNames(one.name, other.name));
}

/** The steps of a folder backup: the new folder, a folder per database, and each collection's files. */
export function folderSteps(
  root: string,
  choice: BackupChoice,
  details: BackupDetails,
  context: Pick<Context, 'platform'> & { readonly connection: ConnectionId; readonly format: 'gzip' | 'plain' },
): readonly Step[] {
  const folder = (path: string): FileStep => ({
    kind: 'file',
    action: 'create-folder',
    path,
    text: `create folder ${path}`,
  });
  const gzip = context.format === 'gzip';
  return [
    folder(root),
    ...choice.flatMap((each) => {
      const databaseFolder = pathIn(root, safeFileName(each.database), context.platform);
      return [
        folder(databaseFolder),
        ...each.collections.flatMap((info): FileStep[] => {
          const names = collectionFileNames(info.name, context.format);
          const metadata = collectionMetadata(info, details.indexes[namespaceOf(each.database, info.name)] ?? []);
          const metadataPath = pathIn(databaseFolder, names.metadata, context.platform);
          const documentsPath = pathIn(databaseFolder, names.documents, context.platform);
          const documents = {
            connection: context.connection,
            database: each.database,
            collection: info.name,
            gzip,
            total: details.counts[namespaceOf(each.database, info.name)] ?? 0,
          };
          return [
            write(metadataPath, 'backup.metadata', { text: metadataText(metadata), gzip }),
            ...(info.type === 'view' ? [] : [write(documentsPath, 'backup.documents', documents)]),
          ];
        }),
      ];
    }),
  ];
}

/** A step that writes a file with the writer of the main process it names. */
export function write(path: string, writer: string, args: Json): FileStep {
  return { kind: 'file', action: 'write', path, text: `write ${path}`, content: { writer, args } };
}
