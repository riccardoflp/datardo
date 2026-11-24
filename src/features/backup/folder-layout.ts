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
import { sha1 } from '../compare/pairing/sha1';
import { freeName } from '../task/file-names';
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

/** The longest encoded name: with `.metadata.json.gz` after it a file's name stays within 255 bytes (mongodump's). */
const longestName = 238;
/** How much of a longer name is kept, before `%24` and the 27 characters of its hash (mongodump's numbers). */
const keptOfLongName = 208;
/** The names Windows gives to devices, whatever follows their first dot: `con.bson` is the console there. */
const reservedName = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/iu;
const keptCharacter = /^[A-Za-z0-9_.-]$/u;

function escaped(byte: number): string {
  return `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
}

/** The SHA-1 of a name's UTF-8 bytes in base64url without padding, as mongodump ends a name too long for a file. */
function nameHash(name: string): string {
  const hex = sha1(name);
  const bytes = Array.from({ length: hex.length / 2 }, (_, index) =>
    String.fromCharCode(parseInt(hex.slice(index * 2, index * 2 + 2), 16)),
  );
  return btoa(bytes.join('')).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

/**
 * The name of a collection or of a database as a file's or a folder's name: letters, digits, `_`, `-` and `.` are kept,
 * every other byte of its UTF-8 is `%XX` (`%` itself too, so that decoding gives the name back); a dot at either end
 * is `%2E`, and the first letter of a name Windows reserves for a device is encoded. A result longer than 238
 * characters is cut to its first 208, never inside a `%XX`, and ends with `%24` and the hash of the name, as mongodump
 * does. So no name leaves its folder or names a device, and `mongorestore` decodes them.
 */
export function backupFileName(name: string): string {
  let out = '';
  for (const byte of new TextEncoder().encode(name)) {
    const character = String.fromCharCode(byte);
    out += keptCharacter.test(character) ? character : escaped(byte);
  }
  if (out.startsWith('.')) {
    out = `%2E${out.slice(1)}`;
  }
  if (out.endsWith('.')) {
    out = `${out.slice(0, -1)}%2E`;
  }
  if (reservedName.test(out)) {
    out = escaped(out.charCodeAt(0)) + out.slice(1);
  }
  if (out.length <= longestName) {
    return out;
  }
  const cut = out[keptOfLongName - 1] === '%' ? 1 : out[keptOfLongName - 2] === '%' ? 2 : 0;
  return `${out.slice(0, keptOfLongName - cut)}%24${nameHash(name)}`;
}

/** A file's name percent-decoded; undefined when it is not percent-encoded text. */
function percentDecoded(fileName: string): string | undefined {
  try {
    return decodeURIComponent(fileName);
  } catch {
    // Not percent-encoded: the caller keeps the name as it is.
    return undefined;
  }
}

/**
 * The collection a backup's files are for, from their name without the extension and the `collectionName` of their
 * metadata, when they have one. A name without `%` is the collection's, also in a backup written before the names were
 * encoded. With a `%`, the metadata tells an encoded name (Datardo's, mongodump's, or cut with the name's hash) from a
 * name that has a `%` of its own; without metadata the name is decoded, as `mongorestore` does, or kept.
 */
export function backupCollectionName(fileName: string, metadataName?: string): string {
  if (!fileName.includes('%')) {
    return fileName;
  }
  const plain = percentDecoded(fileName);
  if (metadataName !== undefined) {
    const same = fileName === metadataName || plain === metadataName || backupFileName(metadataName) === fileName;
    if (same || fileName.endsWith(`%24${nameHash(metadataName)}`)) {
      return metadataName;
    }
  }
  return plain ?? fileName;
}

/**
 * The database a backup's folder is for. A folder has no metadata, so its name is decoded only when it is exactly what
 * `backupFileName` writes for the decoded name: any other folder (mongodump's, an earlier backup's) keeps its name.
 */
export function backupDatabaseName(folderName: string): string {
  if (!folderName.includes('%')) {
    return folderName;
  }
  const plain = percentDecoded(folderName);
  return plain !== undefined && backupFileName(plain) === folderName ? plain : folderName;
}

/** The names of a collection's two files in the folder of its database, compressed or not, the name encoded. */
export function collectionFileNames(
  collection: string,
  format: Exclude<BackupFormat, 'archive'>,
): { readonly documents: string; readonly metadata: string } {
  const gzip = format === 'gzip' ? '.gz' : '';
  const name = backupFileName(collection);
  return { documents: `${name}.bson${gzip}`, metadata: `${name}.metadata.json${gzip}` };
}

/** A file of a folder, with its size in bytes. */
export interface FileEntry {
  readonly name: string;
  readonly size: number;
  /** For a metadata file whose name has a `%`: the `collectionName` it holds, which tells how to read the name. */
  readonly collectionName?: string;
}

/** What the main process lists of a folder: its files and, one level down, its subfolders and their files. */
export interface FolderListing {
  readonly name: string;
  readonly path: string;
  readonly files: readonly FileEntry[];
  readonly folders: readonly FolderListing[];
}

const backupFile = /^(.+)\.(bson|metadata\.json)(\.gz)?$/u;

/** The collections whose files a folder holds, by the name of their files: `system.*` left out, sorted by name. */
export function scanDatabase(files: readonly FileEntry[]): readonly BackupCollection[] {
  const found = new Map<string, BackupCollection & { collectionName?: string }>();
  for (const file of files) {
    const match = backupFile.exec(file.name);
    const name = match?.[1];
    if (match !== null && name !== undefined) {
      const known = found.get(name) ?? { name, size: 0 };
      const metadata = {
        metadata: file.name,
        ...(file.collectionName === undefined ? {} : { collectionName: file.collectionName }),
      };
      found.set(name, match[2] === 'bson' ? { ...known, bson: file.name, size: file.size } : { ...known, ...metadata });
    }
  }
  return [...found.values()]
    .map(({ collectionName, ...each }) => ({ ...each, name: backupCollectionName(each.name, collectionName) }))
    .filter((each) => !each.name.startsWith('system.'))
    .sort((one, other) => compareNames(one.name, other.name));
}

/**
 * The databases of a backup folder: the folder itself, named after it, when it holds backup files; otherwise each of
 * its subfolders that does, sorted by name. None when no such files are found at either level. A folder's name is
 * decoded when Datardo or mongodump encoded it (`backupDatabaseName`).
 */
export function scanBackup(listing: FolderListing): readonly BackupDatabase[] {
  const own = scanDatabase(listing.files);
  if (own.length > 0) {
    return [{ name: backupDatabaseName(listing.name), folder: listing.path, collections: own }];
  }
  return listing.folders
    .map((folder) => ({
      name: backupDatabaseName(folder.name),
      folder: folder.path,
      collections: scanDatabase(folder.files),
    }))
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
      const databaseFolder = pathIn(root, backupFileName(each.database), context.platform);
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
