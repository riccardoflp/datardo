/**
 * Feature: backup.create
 *
 * Backs up the chosen databases of a connection, the chosen collections of a database, or one collection or view, to
 * an archive or a folder that `mongorestore` and **Restore from backup…** read back. The plan writes files only: the
 * main process carries out each `write` with the writer it names, reading the documents as stored, in batches of
 * 1,000, and deleting what it wrote when the backup fails or is cancelled. A scheduled task writes the same files with
 * the same writer, without asking (`task.run`).
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import type { Answers, Context, Outcome, Plan, ReadFeature, ReadRequest, Step } from '../../shared/feature';
import { ask, needRead, noDanger, refuse, run } from '../../shared/feature';
import { chosenPath, dialogArgs, pathRead } from '../transfer/ask/choose-path';
import { connectionId, featureId, type ConnectionId } from '../../shared/ids';
import { savedConnection } from '../../shared/state/connections';
import type { Target } from '../../shared/target';
import { expandPattern, safeFileName } from '../task/file-names';
import { pathIn } from '../task/run';
import { nothingToDo } from '../task/types';
import { listDatabasesArgs } from '../tree/list-databases';
import { argsOf, failureOf, isObject, numberOf, textArg, type MongoDatabase } from '../tree/types';
import { backupWhat, notificationAction } from './creating/message';
import { backupCollections, collectionMetadata, uniquePath, write } from './folder-layout';
import { createText as text } from './text';
import {
  isJsonDocument,
  namespaceOf,
  systemDatabases,
  textsOf,
  type BackupChoice,
  type BackupDetails,
  type BackupFormat,
  type CollectionInfo,
} from './types';

/** What `backup.create`'s writer of an archive is given (`FileStep.content`), also by `task.run` without `plan`. */
export interface BackupWriterArgs {
  readonly connection: ConnectionId;
  readonly database: string | null;
  readonly collection: string | null;
  readonly format: BackupFormat;
  /** What to back up, as chosen: without it the writer backs up everything of the source, as a task does. */
  readonly plan?: {
    readonly serverVersion: string;
    readonly collections: readonly {
      readonly database: string;
      readonly collection: string;
      readonly type: string;
      readonly metadata: Json;
      readonly total: number;
    }[];
  };
}

/** The name the dialog proposes: `<what>_<YYYY-MM-DD_HH-MM-SS>`, in local time, `Local_shop_2026-10-08_16-45-12`. */
export function proposedName(what: string, now: number): string {
  const stamp = expandPattern('{date}_{time}', now, { name: '', connection: '', database: '', collection: '' });
  return `${safeFileName(what)}_${stamp}`;
}

/** The time series collections a backup leaves out, as `<database>.<collection>`, and the choice without them. */
export function leaveOutTimeSeries(choice: BackupChoice): { readonly kept: BackupChoice; readonly left: string[] } {
  const left = choice.flatMap((each) =>
    each.collections.filter((info) => info.type === 'timeseries').map((info) => `${each.database}.${info.name}`),
  );
  const kept = choice.map((each) => ({
    database: each.database,
    collections: each.collections.filter((info) => info.type !== 'timeseries'),
  }));
  return { kept, left };
}

function pickMany(
  title: string,
  key: string,
  choices: readonly { value: string; label: string; description?: string }[],
) {
  return ask({
    title,
    button: text.choose,
    fields: [{ kind: 'pick-many', key, label: title, choices, default: choices.map((choice) => choice.value) }],
  });
}

/** The databases of a connection target: asked when there is more than one, `undefined` while a step is missing. */
function chosenDatabases(
  context: Context,
  connection: ConnectionId,
  what: string,
  answers: Answers,
): Outcome | string[] {
  const listed = answers['listed-databases'] as readonly MongoDatabase[] | undefined;
  if (listed === undefined) {
    return needRead('listed-databases', 'tree.list-databases', listDatabasesArgs(context.state, connection));
  }
  const names = listed.map((each) => each.name).filter((name) => !systemDatabases.includes(name));
  if (names.length === 0) {
    return refuse('backup.create/no-databases', text.noDatabases(what));
  }
  if (names.length === 1) {
    return names;
  }
  const picked = textsOf(answers['databases']);
  if (picked === undefined) {
    const title = text.title(what, text.databasesStep);
    return pickMany(
      title,
      'databases',
      names.map((name) => ({ value: name, label: name })),
    );
  }
  return names.filter((name) => picked.includes(name));
}

function typeDescription(type: string): { description?: string } {
  switch (type) {
    case 'view':
      return { description: text.view };
    case 'timeseries':
      return { description: text.timeseries };
    default:
      return {};
  }
}

/** What to back up: the databases, then their collections, the collections of a database asked when several. */
function backupChoice(context: Context, what: string, answers: Answers): Outcome | BackupChoice {
  const target = context.target;
  if (target.kind !== 'connection' && target.kind !== 'database' && target.kind !== 'collection') {
    return nothingToDo(text.planTitle(what), text.cannotUndo);
  }
  const databases =
    target.kind === 'connection' ? chosenDatabases(context, target.connection, what, answers) : [target.database];
  if (!Array.isArray(databases)) {
    return databases;
  }
  const list = answers['listed'];
  if (!isBackupList(list)) {
    return needRead('listed', 'backup.create:read', { connection: target.connection, databases });
  }
  const found = list.databases.filter((each) => databases.includes(each.database));
  if (target.kind === 'collection') {
    return found.map((each) => ({
      database: each.database,
      collections: each.collections.filter((info) => info.name === target.collection),
    }));
  }
  const only = found[0];
  if (target.kind === 'database' && only !== undefined && only.collections.length > 1) {
    const picked = textsOf(answers['collections']);
    if (picked === undefined) {
      const choices = only.collections.map((info) => ({
        value: info.name,
        label: info.name,
        ...typeDescription(info.type),
      }));
      return pickMany(text.title(what, text.collectionsStep), 'collections', choices);
    }
    return [{ database: only.database, collections: only.collections.filter((info) => picked.includes(info.name)) }];
  }
  return found;
}

/** The read of the save dialog of an archive and of the folder dialog of a folder backup. */
export const pathReadId = 'backup.create:path';

/** `backup.create:path`: the system's dialog, which answers the path, or null when it was closed. */
export const pathDialog = pathRead(pathReadId, 'backup.choose-path');

/** The format, then the file of an archive or the folder a new folder is made in; `null` when a dialog was closed. */
function destination(
  what: string,
  now: number,
  answers: Answers,
): Outcome | { format: BackupFormat; path: string } | null {
  const format = answers['format'];
  if (format !== 'archive' && format !== 'gzip' && format !== 'plain') {
    const choices = (['archive', 'gzip', 'plain'] as const).map((value) => ({ value, ...text.formats[value] }));
    const title = text.title(what, text.formatStep);
    return ask({ title, button: text.choose, fields: [{ kind: 'pick-one', key: 'format', label: title, choices }] });
  }
  const archive = format === 'archive';
  const key = archive ? 'file' : 'folder';
  const path = chosenPath(answers[key]);
  if (path === undefined) {
    const title = text.title(what, archive ? text.archiveStep : text.folderStep);
    const dialog = archive
      ? dialogArgs({
          mode: 'save',
          title,
          button: text.backUp,
          name: `${proposedName(what, now)}.agz`,
          filters: [{ name: text.archiveFilter, extensions: ['agz'] }],
        })
      : dialogArgs({ mode: 'folder', title, button: text.backUpHere });
    return needRead(key, pathReadId, dialog);
  }
  return path === null ? null : { format, path };
}

/** The arguments of the archive's writer: what was chosen, with the metadata and the totals of each collection. */
export function archiveArgs(
  connection: ConnectionId,
  target: Target,
  choice: BackupChoice,
  read: { readonly serverVersion: string; readonly details: BackupDetails },
): BackupWriterArgs {
  return {
    connection,
    database: target.kind === 'database' || target.kind === 'collection' ? target.database : null,
    collection: target.kind === 'collection' ? target.collection : null,
    format: 'archive',
    plan: {
      serverVersion: read.serverVersion,
      collections: choice.flatMap((each) =>
        each.collections.map((info) => {
          const namespace = namespaceOf(each.database, info.name);
          const metadata = collectionMetadata(info, read.details.indexes[namespace] ?? []);
          return {
            database: each.database,
            collection: info.name,
            type: info.type,
            metadata,
            total: read.details.counts[namespace] ?? 0,
          };
        }),
      ),
    },
  };
}

function backupPlan(what: string, steps: readonly Step[]): Plan {
  return {
    title: text.planTitle(what),
    steps,
    danger: noDanger,
    undo: { cannot: text.cannotUndo },
    publishes: false,
    after: [],
  };
}

/** The plan once everything is known: the archive written at once, or the new folder and its files. */
function planOf(context: Context, what: string, choice: BackupChoice, answers: Answers): Outcome {
  const connection = (context.target as { readonly connection: ConnectionId }).connection;
  const asked = destination(what, context.now, answers);
  if (asked === null) {
    return run(backupPlan(what, []));
  }
  if ('kind' in asked) {
    return asked;
  }
  const details = answers['details'];
  if (!isDetails(details)) {
    const collections = choice.flatMap((each) =>
      each.collections.map((info) => ({ database: each.database, collection: info.name, type: info.type })),
    );
    return needRead('details', 'backup.create:details', { connection, collections });
  }
  const list = answers['listed'] as BackupList;
  const args = {
    ...archiveArgs(connection, context.target, choice, { serverVersion: list.serverVersion, details }),
    format: asked.format,
  };
  if (asked.format === 'archive') {
    return run(backupPlan(what, [write(asked.path, 'backup.create', args)]));
  }
  const taken = textsOf(answers['taken']);
  if (taken === undefined) {
    return needRead('taken', 'backup.create:names', { folder: asked.path });
  }
  // The new folder and its files are written by one writer, so that Cancel and a failure delete the whole folder; the
  // files it writes are those of `backup.folder-layout`.
  const root = pathIn(asked.path, uniquePath(proposedName(what, context.now), new Set(taken)), context.platform);
  return run(backupPlan(what, [{ ...write(root, 'backup.create', args), text: `write folder ${root}` }]));
}

/**
 * Feature: backup.create — on a connection, a database, a collection or a view: the databases and the collections
 * when there are several, the format, the file or the folder; then the plan, which writes files only.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const target = context.target;
  const connection = 'connection' in target ? savedConnection(context.state.connections, target.connection) : undefined;
  const what = backupWhat(target, connection?.name ?? '');
  if (connection === undefined) {
    return nothingToDo(text.planTitle(what), text.cannotUndo);
  }
  const shown = notificationAction(answers);
  if (shown !== undefined) {
    return run({ ...backupPlan(what, shown.steps), after: shown.after });
  }
  const live = context.state.connections.live[connection.id];
  if (live?.state !== 'connected') {
    return refuse(
      'backup.create/not-connected',
      text.notConnected(connection.name, live?.reason ?? text.notConnectedError),
    );
  }
  const choice = backupChoice(context, what, answers);
  if (!Array.isArray(choice)) {
    return choice as Outcome;
  }
  const { kept, left } = leaveOutTimeSeries(choice);
  if (!kept.some((each) => each.collections.length > 0)) {
    return left.length > 0
      ? refuse('backup.create/unsupported', text.onlyTimeSeries)
      : refuse('backup.create/empty', text.empty(what));
  }
  const outcome = planOf(
    context,
    what,
    kept.filter((each) => each.collections.length > 0),
    answers,
  );
  if (outcome.kind !== 'run' || left.length === 0) {
    return outcome;
  }
  const warning = { kind: 'notify', level: 'warning', text: text.leftOut(left).trim() } as const;
  return run({ ...outcome.plan, after: [...outcome.plan.after, warning] });
}

/** How long a read of the backup may take, in milliseconds (R9.2; Datardo's choice). */
export const readTimeLimitMs = 30_000;

/** The most collections a database lists, and the most indexes a collection does (R9.2; Datardo's choice). */
export const mostListed = 10_000;

/** The collections of the databases to back up, and the server's version for the archive's header. */
export interface BackupList {
  readonly serverVersion: string;
  readonly databases: readonly { readonly database: string; readonly collections: readonly CollectionInfo[] }[];
}

function isBackupList(value: unknown): value is BackupList {
  return isObject(value) && Array.isArray(value['databases']) && typeof value['serverVersion'] === 'string';
}

function isDetails(value: unknown): value is BackupDetails {
  return isObject(value) && isObject(value['indexes']) && isObject(value['counts']);
}

/** A failed reply as the message of a backup that failed before writing. */
function checked(reply: unknown): unknown {
  const failure = failureOf(reply);
  if (failure !== undefined) {
    throw new Error(text.failedBefore(failure));
  }
  return reply;
}

/** A request of these reads on a database, or on a collection of it. */
function mongoRequest(
  database: string,
  method: string,
  on?: { collection: string; args: readonly Json[] },
): MongoRequest {
  return {
    engine: 'mongodb',
    database,
    method,
    ...(on === undefined
      ? { arguments: [{}, { authorizedCollections: true }] }
      : { collection: on.collection, arguments: on.args }),
    ...(method === 'estimatedDocumentCount' || method === 'runCommand' ? {} : { limit: mostListed }),
    timeLimitMs: readTimeLimitMs,
  };
}

const buildInfo: MongoRequest = {
  engine: 'mongodb',
  database: 'admin',
  method: 'runCommand',
  arguments: [{ buildInfo: { $numberInt: '1' } }],
  timeLimitMs: readTimeLimitMs,
};

/** `backup.create:read`: `buildInfo`, then `listCollections` of each database of `args.databases`. */
export const listRead: ReadFeature = {
  kind: 'read',
  id: featureId('backup.create:read'),
  request: (_context: Context, args: Json): ReadRequest => {
    const connection = connectionId(textArg(args, 'connection'));
    const databases = textsOf(argsOf(args)['databases']) ?? [];
    const requests = [buildInfo, ...databases.map((database) => mongoRequest(database, 'listCollections'))];
    return { kind: 'engine', requests: requests.map((request) => ({ connection, request })) };
  },
  parse: (replies: readonly unknown[], args: Json): BackupList => {
    const [info, ...lists] = replies;
    const version = isObject(info) && failureOf(info) === undefined ? info['version'] : undefined;
    const databases = textsOf(argsOf(args)['databases']) ?? [];
    return {
      serverVersion: typeof version === 'string' ? version : '',
      databases: databases.map((database, index) => ({
        database,
        collections: backupCollections(checked(lists[index])),
      })),
    };
  },
};

interface Listed {
  readonly database: string;
  readonly collection: string;
}

function listedOf(args: Json): readonly Listed[] {
  const collections = argsOf(args)['collections'];
  return (Array.isArray(collections) ? (collections as readonly Json[]) : [])
    .filter((each) => textArg(each, 'type') !== 'view')
    .map((each) => ({ database: textArg(each, 'database'), collection: textArg(each, 'collection') }));
}

/** `backup.create:details`: `listIndexes` and `estimatedDocumentCount` of each collection that is not a view. */
export const detailsRead: ReadFeature = {
  kind: 'read',
  id: featureId('backup.create:details'),
  request: (_context: Context, args: Json): ReadRequest => {
    const connection = connectionId(textArg(args, 'connection'));
    const requests = listedOf(args).flatMap((each) => [
      mongoRequest(each.database, 'listIndexes', { collection: each.collection, args: [] }),
      mongoRequest(each.database, 'estimatedDocumentCount', { collection: each.collection, args: [] }),
    ]);
    return { kind: 'engine', requests: requests.map((request) => ({ connection, request })) };
  },
  parse: (replies: readonly unknown[], args: Json): BackupDetails => {
    const entries = listedOf(args).map((each, index) => {
      const listed = checked(replies[index * 2]);
      const specs = (Array.isArray(listed) ? (listed as readonly Json[]) : []).filter(isJsonDocument);
      return { key: namespaceOf(each.database, each.collection), specs, count: numberOf(replies[index * 2 + 1]) ?? 0 };
    });
    return {
      indexes: Object.fromEntries(entries.map((each) => [each.key, each.specs])),
      counts: Object.fromEntries(entries.map((each) => [each.key, each.count])),
    };
  },
};

/** `backup.create:names`: the names of what the chosen folder holds, so that a new backup folder replaces nothing. */
export const namesRead: ReadFeature = {
  kind: 'read',
  id: featureId('backup.create:names'),
  request: (_context: Context, args: Json): ReadRequest => ({
    kind: 'app',
    action: 'backup.list-names',
    args: { folder: textArg(args, 'folder') },
  }),
  parse: (replies: readonly unknown[]): readonly string[] => textsOf(replies[0]) ?? [],
};
