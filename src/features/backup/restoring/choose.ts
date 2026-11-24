/**
 * The questions of **Restore from backup…** (`backup.restore`): the backup, archive or folder, or on a collection a
 * `.bson` file or an archive; the databases of the backup and the names they are restored under; the collections of
 * each; whether existing collections are added to or dropped. Each answer has its own key.
 */
import type { Answers, Context, Outcome } from '../../../shared/feature';
import { ask, needRead, refuse, run } from '../../../shared/feature';
import { chosenPath, dialogArgs, nothing, pathRead } from '../../transfer/ask/choose-path';
import type { Choice } from '../../../shared/question';
import { savedConnection } from '../../../shared/state/connections';
import { counted, sizeText, restoreText as text } from '../text';
import { textOf, textsOf, type BackupCollection, type BackupDatabase } from '../types';
import { offeredDatabases, refusedDatabase } from './guards';

/** What a restore reads: an archive, a folder of `.bson` files, or one `.bson` file. */
export type BackupKind = 'archive' | 'folder' | 'bson';

/** The backup chosen, and its databases. */
export interface ChosenBackup {
  readonly kind: BackupKind;
  readonly path: string;
  readonly databases: readonly BackupDatabase[];
}

/** A collection of the backup and the name it is restored under. */
export interface RestoredCollection {
  readonly from: BackupCollection;
  readonly name: string;
}

/** A database of the backup, the database it is restored into, and its collections. */
export interface RestoredDatabase {
  readonly source: BackupDatabase;
  readonly database: string;
  readonly collections: readonly RestoredCollection[];
}

const bsonFile = /^(.*?)\.bson(\.gz)?$/iu;

function pickOne(title: string, key: string, choices: readonly Choice[]): Outcome {
  return ask({ title, button: text.choose, fields: [{ kind: 'pick-one', key, label: title, choices }] });
}

function pickMany(title: string, key: string, choices: readonly Choice[], notOffered: readonly string[] = []): Outcome {
  const all = choices.map((choice) => choice.value);
  return ask({
    title,
    ...(notOffered.length === 0 ? {} : { text: text.notOffered(notOffered) }),
    button: text.choose,
    fields: [{ kind: 'pick-many', key, label: title, choices, default: all }],
  });
}

/** The folder of a path and its last name. */
export function splitPath(path: string): { readonly folder: string; readonly name: string } {
  const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return { folder: at < 0 ? '' : path.slice(0, at), name: path.slice(at + 1) };
}

/** A `.bson` or `.bson.gz` file as the one collection of one database; its metadata file is the one next to it. */
function bsonBackup(path: string, database: string, collection: string): ChosenBackup {
  const { folder, name } = splitPath(path);
  const match = bsonFile.exec(name);
  const metadata = `${match?.[1] ?? name}.metadata.json${match?.[2] ?? ''}`;
  const only = { name: collection, bson: name, metadata, size: 0 };
  return { kind: 'bson', path, databases: [{ name: database, folder, collections: [only] }] };
}

/** What the read of a backup's list gave: its databases, or why it could not be read. */
export interface BackupListing {
  readonly databases?: readonly BackupDatabase[];
  readonly error?: string;
}

/** The read of the dialog of a restore's archive, file or folder. */
export const pathReadId = 'backup.restore:path';

/** `backup.restore:path`: the system's dialog, which answers the path, or null when it was closed. */
export const pathDialog = pathRead(pathReadId, 'backup.choose-path');

/** The backup: its kind, its path, then its list of databases and collections, read. */
export function chooseBackup(
  context: Context,
  answers: Answers,
  title: (step: string) => string,
): Outcome | ChosenBackup {
  const target = context.target;
  const onCollection = target.kind === 'collection';
  const kind = onCollection ? 'archive' : answers['kind'];
  if (kind !== 'archive' && kind !== 'folder') {
    const choices = (['archive', 'folder'] as const).map((value) => ({ value, ...text.kinds[value] }));
    return pickOne(title(text.backupStep), 'kind', choices);
  }
  const path = chosenPath(answers['path']);
  if (path === undefined) {
    const step = title(onCollection ? text.bsonStep : kind === 'archive' ? text.archiveStep : text.folderStep);
    const filter = onCollection
      ? { name: text.bsonFilter, extensions: ['bson', 'gz', 'agz', 'archive'] }
      : { name: text.archiveFilter, extensions: ['agz', 'archive', 'gz'] };
    const dialog =
      kind === 'folder' && !onCollection
        ? dialogArgs({ mode: 'folder', title: step, button: text.restore })
        : dialogArgs({
            mode: 'open',
            title: step,
            button: text.restore,
            filters: [filter, { name: text.allFiles, extensions: ['*'] }],
          });
    return needRead('path', pathReadId, dialog);
  }
  if (path === null) {
    return run(nothing(title(text.backupStep), text.cannotUndo));
  }
  if (target.kind === 'collection' && bsonFile.test(path)) {
    return bsonBackup(path, target.database, target.collection);
  }
  const listing = answers['listing'] as BackupListing | undefined;
  if (listing === undefined) {
    const read = kind === 'archive' ? 'backup.restore:archive' : 'backup.restore:folder';
    return needRead('listing', read, { path });
  }
  return { kind, path, databases: listing.databases ?? [] };
}

/**
 * On a connection: the databases that can be restored under their names, all checked, the others said under the list
 * (`admin`, `local`, `config`, an invalid name); then the name of the one chosen when it is alone, its own proposed only
 * when it can be the target.
 */
function onConnection(context: Context, backup: ChosenBackup, answers: Answers, title: (step: string) => string) {
  const several = backup.databases.length > 1;
  const { offered, notOffered } = offeredDatabases(backup.databases);
  if (several && offered.length === 0) {
    return refuse(
      'backup.restore/system-databases',
      text.nothingUnderItsNames(splitPath(backup.path).name, notOffered),
    );
  }
  const names = (several ? offered : backup.databases).map((each) => each.name);
  const picked = several && offered.length > 1 ? textsOf(answers['databases']) : names;
  if (picked === undefined) {
    const choices = offered.map((each) => ({
      value: each.name,
      label: each.name,
      description: counted(each.collections.length, 'collection'),
    }));
    return pickMany(title(text.databasesStep), 'databases', choices, notOffered);
  }
  const chosen = (several ? offered : backup.databases).filter((each) => picked.includes(each.name));
  const only = chosen.length === 1 ? chosen[0] : undefined;
  if (only === undefined) {
    return chosen.map((source) => ({ source, database: source.name }));
  }
  const typed = textOf(answers['database-name'])?.trim() ?? '';
  return typed === '' ? databaseQuestion(context, only, title) : [{ source: only, database: typed }];
}

/** **database**: the name to restore the one database chosen under, its own by default unless it cannot be the target. */
function databaseQuestion(context: Context, only: BackupDatabase, title: (step: string) => string): Outcome {
  const target = context.target;
  const connection = 'connection' in target ? savedConnection(context.state.connections, target.connection) : undefined;
  const refused = refusedDatabase(only.name);
  const step = title(text.databaseStep);
  return ask({
    title: step,
    text: `${text.databasePrompt(connection?.name ?? '', only.name)}${refused === undefined ? '' : text.ownNameNotProposed(refused)}`,
    button: text.choose,
    fields: [
      {
        kind: 'text',
        key: 'database-name',
        label: step,
        default: refused === undefined ? only.name : '',
        rules: [{ kind: 'not-empty', message: text.databaseNeeded }],
      },
    ],
  });
}

/** The databases of a backup left out on a connection, with why: `admin (a system database)`; none elsewhere. */
export function databasesLeftOut(context: Context, backup: ChosenBackup): readonly string[] {
  return context.target.kind === 'connection' && backup.databases.length > 1
    ? offeredDatabases(backup.databases).notOffered
    : [];
}

/** On a database: the database of the backup restored into it, asked when there are several. */
function onDatabase(database: string, backup: ChosenBackup, answers: Answers, title: (step: string) => string) {
  const [first] = backup.databases;
  const picked =
    backup.databases.length > 1 ? backup.databases.find((each) => each.name === answers['backup-database']) : first;
  if (picked === undefined) {
    const choices = backup.databases.map((each) => ({ value: each.name, label: each.name }));
    return pickOne(title(text.databaseOfBackupStep), 'backup-database', choices);
  }
  return [{ source: picked, database }];
}

/** On a collection: the collection of the archive restored into it, the same name first, unless there is only one. */
function onCollection(
  target: { database: string; collection: string },
  backup: ChosenBackup,
  answers: Answers,
  title: (step: string) => string,
): Outcome | RestoredDatabase[] {
  const all = backup.databases.flatMap((source) =>
    source.collections.map((from) => ({ source, from, key: `${source.name}.${from.name}` })),
  );
  const same = all.filter((each) => each.from.name === target.collection);
  const ordered = [...same, ...all.filter((each) => each.from.name !== target.collection)];
  const picked = all.length === 1 ? all[0] : all.find((each) => each.key === answers['archive-collection']);
  if (picked === undefined) {
    const choices = ordered.map((each) => ({ value: each.key, label: each.key }));
    return pickOne(title(text.collectionOfArchiveStep), 'archive-collection', choices);
  }
  return [
    { source: picked.source, database: target.database, collections: [{ from: picked.from, name: target.collection }] },
  ];
}

/** The collections of each database with several, all checked, each with the size of its file. */
function collectionsOf(
  chosen: readonly { source: BackupDatabase; database: string }[],
  answers: Answers,
  title: (step: string) => string,
): Outcome | RestoredDatabase[] {
  const restored: RestoredDatabase[] = [];
  for (const each of chosen) {
    const key = `collections-of-${each.source.name}`;
    const picked =
      each.source.collections.length > 1 ? textsOf(answers[key]) : each.source.collections.map((c) => c.name);
    if (picked === undefined) {
      const choices = each.source.collections.map((collection) => ({
        value: collection.name,
        label: collection.name,
        description:
          collection.bson === undefined && collection.size === 0 && collection.meta === undefined
            ? text.metadataOnly
            : sizeText(collection.size),
      }));
      return pickMany(title(text.collectionsStep(each.source.name)), key, choices);
    }
    const collections = each.source.collections
      .filter((collection) => picked.includes(collection.name))
      .map((from) => ({ from, name: from.name }));
    restored.push({ ...each, collections });
  }
  return restored;
}

/** What is restored where: the databases, their names, their collections. */
export function chooseRestored(
  context: Context,
  backup: ChosenBackup,
  answers: Answers,
  title: (step: string) => string,
): Outcome | RestoredDatabase[] {
  const target = context.target;
  if (target.kind === 'collection') {
    return onCollection(target, backup, answers, title);
  }
  const chosen =
    target.kind === 'database'
      ? onDatabase(target.database, backup, answers, title)
      : onConnection(context, backup, answers, title);
  return Array.isArray(chosen) ? collectionsOf(chosen, answers, title) : chosen;
}

/** Whether existing collections are added to or dropped first: asked when one of them exists. */
export function chooseMode(
  answers: Answers,
  anyExists: boolean,
  title: (step: string) => string,
): Outcome | 'add' | 'drop' {
  const mode = answers['mode'];
  if (!anyExists) {
    return 'add';
  }
  if (mode === 'add' || mode === 'drop') {
    return mode;
  }
  const choices = (['add', 'drop'] as const).map((value) => ({ value, ...text.modes[value] }));
  return pickOne(title(text.existingStep), 'mode', choices);
}
