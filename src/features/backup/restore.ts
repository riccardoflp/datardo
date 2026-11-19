/**
 * Feature: backup.restore
 *
 * Writes the collections of a backup, Datardo's or mongodump's, archive or folder, back into a connection, a database
 * or a collection: per collection, a drop (with **Drop and restore**), a `createCollection` with the backup's options,
 * the documents as stored, batch by batch from a feed, and the indexes. The creations come first and the indexes
 * last, so that the documents of an archive are read in one pass, also when its collections alternate.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import type { Answers, Context, Outcome, Plan, ReadFeature, ReadRequest, Step, Undo } from '../../shared/feature';
import { needRead, refuse, run } from '../../shared/feature';
import { connectionId, featureId } from '../../shared/ids';
import { savedConnection } from '../../shared/state/connections';
import { pathIn } from '../task/run';
import { nothingToDo } from '../task/types';
import {
  copiedOptions,
  createCollectionStep,
  dropStep,
  fedStep,
  indexSteps,
  insertUndo,
  viewOptions,
  type Namespace,
} from '../transfer/types';
import { argsOf, failureOf, isObject, textArg } from '../tree/types';
import { archiveDatabases } from './archive-read';
import { scanBackup, type FolderListing } from './folder-layout';
import {
  chooseBackup,
  chooseMode,
  chooseRestored,
  splitPath,
  type BackupListing,
  type ChosenBackup,
  type RestoredDatabase,
} from './restoring/choose';
import { restoreText as text } from './text';
import {
  batchBytes,
  batchDocuments,
  deepestMetadata,
  isJsonDocument,
  nesting,
  textsOf,
  typeOf,
  type ArchiveCollection,
  type JsonDocument,
} from './types';

/** The collections of each database restored into, with their kind, by database. */
type Existing = Readonly<Record<string, readonly { readonly name: string; readonly kind: string }[]>>;

/** The metadata of a folder's collections, by path; `null` for a file that is not there. */
type Metadata = Readonly<Record<string, JsonDocument | null>>;

/** What the plan is made of: where it goes, from what, how. */
interface Restore {
  readonly connection: { readonly id: Namespace['connection']; readonly name: string };
  readonly backup: ChosenBackup;
  readonly restored: readonly RestoredDatabase[];
  readonly existing: Existing;
  readonly metadata: Metadata;
  readonly mode: 'add' | 'drop';
  readonly where: string;
}

/** Where a restore goes, as its titles say it: `<connection>`, `<connection> › <database>`, or with the collection. */
function whereOf(context: Context, connection: string): string {
  const target = context.target;
  switch (target.kind) {
    case 'database':
      return `${connection} › ${target.database}`;
    case 'collection':
      return `${connection} › ${target.database}.${target.collection}`;
    case 'app':
    case 'tab':
    case 'connection':
    case 'redis-database':
    case 'key':
      return connection;
  }
}

function existsIn(
  existing: Existing,
  database: string,
  collection: string,
): { name: string; kind: string } | undefined {
  return existing[database]?.find((each) => each.name === collection);
}

/** The metadata file of a folder's collection, as a path. */
function metadataPath(context: Context, database: RestoredDatabase, file: string | undefined): string | undefined {
  return file === undefined || database.source.folder === undefined
    ? undefined
    : pathIn(database.source.folder, file, context.platform);
}

/** The metadata of a restored collection: the archive's, or its file's (none for a `.bson` without one). */
function metaOf(context: Context, how: Restore, database: RestoredDatabase, index: number): JsonDocument {
  const from = database.collections[index]?.from;
  const path = metadataPath(context, database, from?.metadata);
  const read = path === undefined ? undefined : how.metadata[path];
  return from?.meta ?? read ?? {};
}

interface CollectionSteps {
  readonly before: Step[];
  readonly documents: Step[];
  readonly indexes: Step[];
  readonly left: string[];
  readonly titles: string[];
  readonly drops: string[];
}

function collectionSteps(context: Context, how: Restore): CollectionSteps {
  const all: CollectionSteps = { before: [], documents: [], indexes: [], left: [], titles: [], drops: [] };
  for (const database of how.restored) {
    database.collections.forEach((each, index) => {
      const on = { connection: how.connection.id, database: database.database, collection: each.name };
      const meta = metaOf(context, how, database, index);
      const type = typeOf(meta);
      const exists = existsIn(how.existing, database.database, each.name);
      const name = `${database.database}.${each.name}`;
      if (type === 'timeseries' || (type === 'view' && exists !== undefined && how.mode === 'add')) {
        all.left.push(`${name} (${type === 'timeseries' ? text.timeSeries : text.viewExists})`);
        return;
      }
      const drop = exists !== undefined && how.mode === 'drop';
      const options = isJsonDocument(meta['options']) ? meta['options'] : {};
      const created = type === 'view' ? viewOptions(options) : copiedOptions(options);
      all.before.push(...(drop ? [dropStep(on, context.target)] : []));
      all.before.push(...(drop || exists === undefined ? [createCollectionStep(on, created, context.target)] : []));
      all.drops.push(...(drop ? [name] : []));
      if (type !== 'view') {
        all.documents.push(documentsStep(context, how, { on, database, from: each.from.name, bson: each.from.bson }));
        const indexes = Array.isArray(meta['indexes']) ? meta['indexes'].filter(isJsonDocument) : [];
        all.indexes.push(...indexSteps(on, indexes, context.target));
        all.titles.push(
          how.backup.kind === 'archive'
            ? text.undoTitleArchive(each.name, splitPath(how.backup.path).name)
            : text.undoTitleFolder(each.from.bson ?? each.name),
        );
      }
    });
  }
  return all;
}

function documentsStep(
  context: Context,
  how: Restore,
  of: { on: Namespace; database: RestoredDatabase; from: string; bson: string | undefined },
): Step {
  const feed =
    how.backup.kind === 'archive'
      ? ({ kind: 'archive', path: how.backup.path, database: of.database.source.name, collection: of.from } as const)
      : ({
          kind: 'bson',
          path: pathIn(of.database.source.folder ?? '', of.bson ?? `${of.from}.bson`, context.platform),
        } as const);
  const step = fedStep(
    of.on,
    {
      method: 'insertMany',
      options: { ordered: false, bypassDocumentValidation: true },
      from: `documents of ${of.from}`,
    },
    feed,
    context.target,
  );
  return { ...step, batches: { documents: batchDocuments, bytes: batchBytes } } as Step;
}

/** One operation of the undo history per collection, with **Add documents**; none with **Drop and restore**. */
function restoreUndo(context: Context, how: Restore, steps: CollectionSteps): Undo {
  const connection = savedConnection(context.state.connections, how.connection.id);
  if (how.mode === 'drop' || connection === undefined) {
    return { cannot: text.cannotUndo };
  }
  const operations = steps.documents.map((step, index) => {
    const request = (step as { readonly request: MongoRequest }).request;
    const on = { connection: how.connection.id, database: request.database, collection: request.collection ?? '' };
    return insertUndo(context, connection, 0, { ...on, title: steps.titles[index] ?? '' });
  });
  const kept = operations.flatMap((undo) => ('keeps' in undo ? [undo.keeps] : []));
  const first = operations[0];
  return kept.length === operations.length
    ? { keeps: { kind: 'per-collection', operations: kept } }
    : (first ?? { cannot: text.cannotUndo });
}

function restorePlan(context: Context, how: Restore): Plan {
  const steps = collectionSteps(context, how);
  const databases = [...new Set(how.restored.map((each) => each.database))];
  const count = how.restored.reduce((sum, each) => sum + each.collections.length, 0) - steps.left.length;
  const lines = [
    text.confirm(count, how.connection.name, databases.join(', ')),
    text.from(how.backup.path),
    how.mode === 'drop' ? text.dropped : text.added,
    ...(how.mode === 'add' ? [text.undoable] : []),
  ];
  const target = context.target;
  const name =
    target.kind === 'collection'
      ? target.collection
      : databases.length === 1
        ? (databases[0] ?? '')
        : how.connection.name;
  const confirm = { text: lines.join('\n'), button: text.restore };
  return {
    title: text.planTitle(how.where),
    steps: [...steps.before, ...steps.documents, ...steps.indexes],
    danger: steps.drops.length > 0 ? { kind: 'destructive', ...confirm, name } : { kind: 'confirm', ...confirm },
    undo: restoreUndo(context, how, steps),
    publishes: false,
    after: [
      { kind: 'refresh', connection: how.connection.id },
      ...(steps.left.length > 0
        ? [{ kind: 'notify', level: 'warning', text: text.notRestored(steps.left) } as const]
        : []),
    ],
  };
}

/** The paths of the metadata files of a folder's chosen collections. */
function metadataPaths(context: Context, restored: readonly RestoredDatabase[]): string[] {
  return restored.flatMap((database) =>
    database.collections.flatMap((each) => {
      const path = metadataPath(context, database, each.from.metadata);
      return path === undefined ? [] : [path];
    }),
  );
}

/** A backup that cannot be restored: unreadable, empty, or a folder without backup files. */
function backupRefusal(chosen: ChosenBackup, listing: BackupListing | undefined): Outcome | undefined {
  if (listing?.error !== undefined) {
    return refuse('backup.restore/unreadable', text.unreadable(splitPath(chosen.path).name, listing.error));
  }
  if (chosen.databases.length > 0) {
    return undefined;
  }
  return chosen.kind === 'folder'
    ? refuse('backup.restore/no-backup', text.noBackup(chosen.path))
    : refuse('backup.restore/empty', text.empty(splitPath(chosen.path).name));
}

/** Feature: backup.restore — on a connection, a database or a collection: the backup, what of it, how; then the plan. */
export function plan(context: Context, answers: Answers): Outcome {
  const target = context.target;
  const connection = 'connection' in target ? savedConnection(context.state.connections, target.connection) : undefined;
  if (
    connection === undefined ||
    (target.kind !== 'connection' && target.kind !== 'database' && target.kind !== 'collection')
  ) {
    return nothingToDo(text.command, text.cannotUndo);
  }
  if (connection.readOnly) {
    return refuse('backup.restore/read-only', text.readOnly(connection.name));
  }
  const where = whereOf(context, connection.name);
  const title = (step: string): string => text.title(where, step);
  const backup = chooseBackup(context, answers, title);
  if (!('path' in backup)) {
    return backup;
  }
  const chosen = backup;
  const refusal = backupRefusal(chosen, answers['listing'] as BackupListing | undefined);
  if (refusal !== undefined) {
    return refusal;
  }
  const restored = chooseRestored(context, chosen, answers, title);
  if (!Array.isArray(restored)) {
    return restored;
  }
  const existing = answers['existing'] as Existing | undefined;
  if (existing === undefined) {
    return needRead('existing', 'backup.restore:existing', {
      connection: connection.id,
      databases: [...new Set(restored.map((each) => each.database))],
    });
  }
  const anyExists = restored.some((database) =>
    database.collections.some((each) => existsIn(existing, database.database, each.name) !== undefined),
  );
  const mode = chooseMode(answers, anyExists, title);
  if (typeof mode !== 'string') {
    return mode;
  }
  const paths = chosen.kind === 'archive' ? [] : metadataPaths(context, restored);
  const metadata = answers['metadata'] as Metadata | undefined;
  if (metadata === undefined && paths.length > 0) {
    return needRead('metadata', 'backup.restore:metadata', { paths });
  }
  const how = {
    connection: { id: connection.id, name: connection.name },
    backup: chosen,
    restored,
    existing,
    metadata: metadata ?? {},
    mode,
    where,
  };
  return run(restorePlan(context, how));
}

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
