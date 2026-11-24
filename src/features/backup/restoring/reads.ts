/**
 * The reads of a restore (`backup.restore`): the list of collections at the start of an archive, the files of a backup
 * folder, the texts of metadata files, and the collections that exist in the databases restored into.
 */
import type { Json } from '../../../shared/engine-request';
import type { Context, ReadFeature, ReadRequest } from '../../../shared/feature';
import { connectionId, featureId } from '../../../shared/ids';
import { argsOf, failureOf, isObject, textArg } from '../../tree/types';
import { archiveDatabases } from '../archive-read';
import { scanBackup, type FolderListing } from '../folder-layout';
import { deepestMetadata, isJsonDocument, nesting, textsOf, type ArchiveCollection, type JsonDocument } from '../types';
import type { BackupListing } from './choose';

/** The collections of each database restored into, with their kind, by database. */
export type Existing = Readonly<Record<string, readonly { readonly name: string; readonly kind: string }[]>>;

/** The metadata of a folder's collections, by path; `null` for a file that is not there. */
export type Metadata = Readonly<Record<string, JsonDocument | null>>;

function errorOf(reply: unknown): string | undefined {
  return failureOf(reply) ?? (isObject(reply) && typeof reply['error'] === 'string' ? reply['error'] : undefined);
}

/** `backup.restore:archive`: the list of collections at the start of an archive (`backup.archive-read`). */
export const archiveListRead: ReadFeature = {
  kind: 'read',
  id: featureId('backup.restore:archive'),
  request: (_context: Context, args: Json): ReadRequest => ({
    kind: 'app',
    action: 'backup.read-archive-list',
    args: { path: textArg(args, 'path') },
  }),
  parse: (replies: readonly unknown[]): BackupListing => {
    const [reply] = replies;
    const error = errorOf(reply);
    return error === undefined
      ? { databases: archiveDatabases(Array.isArray(reply) ? (reply as ArchiveCollection[]) : []) }
      : { error };
  },
};

/** `backup.restore:folder`: the files of a folder and of its subfolders (`backup.folder-layout`). */
export const folderListRead: ReadFeature = {
  kind: 'read',
  id: featureId('backup.restore:folder'),
  request: (_context: Context, args: Json): ReadRequest => ({
    kind: 'app',
    action: 'backup.list-folder',
    args: { path: textArg(args, 'path') },
  }),
  parse: (replies: readonly unknown[]): BackupListing => {
    const [reply] = replies;
    const error = errorOf(reply);
    return error === undefined && isObject(reply)
      ? { databases: scanBackup(reply as unknown as FolderListing) }
      : { error: error ?? '' };
  },
};

/** A metadata file's text as a document, refused when it is not one or nests too deep (R14.4). */
export function parseMetadata(source: string): JsonDocument | null {
  try {
    const value = JSON.parse(source) as Json;
    return isJsonDocument(value) && nesting(value, deepestMetadata) <= deepestMetadata ? value : null;
  } catch {
    return null;
  }
}

/** `backup.restore:metadata`: the texts of metadata files (gunzipped by the main process), parsed. */
export const metadataRead: ReadFeature = {
  kind: 'read',
  id: featureId('backup.restore:metadata'),
  request: (_context: Context, args: Json): ReadRequest => ({
    kind: 'app',
    action: 'backup.read-metadata',
    args: { paths: [...(textsOf(argsOf(args)['paths']) ?? [])] },
  }),
  parse: (replies: readonly unknown[], args: Json): Metadata => {
    const texts: readonly unknown[] = Array.isArray(replies[0]) ? replies[0] : [];
    const paths = textsOf(argsOf(args)['paths']) ?? [];
    return Object.fromEntries(
      paths.map((path, index) => {
        const source = texts[index];
        return [path, typeof source === 'string' ? parseMetadata(source) : null];
      }),
    );
  },
};

/** `backup.restore:existing`: `listCollections` of each database restored into, names and kinds. */
export const existingRead: ReadFeature = {
  kind: 'read',
  id: featureId('backup.restore:existing'),
  request: (_context: Context, args: Json): ReadRequest => {
    const connection = connectionId(textArg(args, 'connection'));
    const databases = textsOf(argsOf(args)['databases']) ?? [];
    const requests = databases.map((database) => ({
      connection,
      request: {
        engine: 'mongodb',
        database,
        method: 'listCollections',
        arguments: [{}, { nameOnly: true, authorizedCollections: true }],
        timeLimitMs: 30_000,
      } as const,
    }));
    return { kind: 'engine', requests };
  },
  parse: (replies: readonly unknown[], args: Json): Existing => {
    const databases = textsOf(argsOf(args)['databases']) ?? [];
    return Object.fromEntries(
      databases.map((database, index) => {
        const reply = replies[index];
        const failure = failureOf(reply);
        if (failure !== undefined) {
          throw new Error(failure);
        }
        const entries = (Array.isArray(reply) ? (reply as unknown[]) : []).filter(isObject);
        return [
          database,
          entries.map((entry) => ({
            name: String(entry['name']),
            kind: typeof entry['type'] === 'string' ? entry['type'] : 'collection',
          })),
        ];
      }),
    );
  },
};
