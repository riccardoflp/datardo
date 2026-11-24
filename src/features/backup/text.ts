/**
 * The text of the interface of the backup area, word for word as the cards write it (R10.1).
 */
import { groupThousands } from '../../shared/text-units';

/** `1 collection`, `3 collections`, with the thousands grouped. */
export function counted(count: number, singular: string, plural = `${singular}s`): string {
  return `${groupThousands(count)} ${count === 1 ? singular : plural}`;
}

/** A size in bytes as the result says it: `512 B`, `1.5 KB`, `12 MB`. */
export function sizeText(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size < 10 && unit > 0 ? size.toFixed(1) : String(Math.round(size))} ${units[unit] ?? 'B'}`;
}

/** What reading an archive or a `.bson` file says when it cannot (`backup.archive-read`). */
export const archiveText = {
  notAnArchive: (file: string): string =>
    `${file} is not a mongodump archive (mongodump --archive, with or without --gzip).`,
  invalidDocument: (file: string, what: 'archive' | 'bson', byte: string): string =>
    `${file} is not ${what === 'archive' ? 'a mongodump archive' : 'a BSON file'} (invalid document at byte ${byte}).`,
  endsInList: (file: string): string => `${file} is truncated: it ends in its list of collections.`,
  incomplete: (file: string, namespace: string): string => `${file} is truncated: ${namespace} is incomplete.`,
  lastDocumentIncomplete: (file: string): string => `${file} is truncated: its last document is incomplete.`,
  damaged: (file: string, namespace: string): string =>
    `${file} is damaged: the checksum of ${namespace} doesn't match its documents.`,
  invalidMetadata: (file: string, namespace: string): string =>
    `${file} is damaged: the metadata of ${namespace} can't be read.`,
} as const;

/** The text of **Back up…** (`backup.create`). */
export const createText = {
  command: 'Back up…',
  title: (what: string, step: string): string => `Back up ${what}: ${step}`,
  databasesStep: 'databases',
  collectionsStep: 'collections',
  formatStep: 'format',
  archiveStep: 'archive',
  folderStep: 'folder',
  view: 'view',
  timeseries: 'time series',
  formats: {
    archive: {
      label: 'Archive (.agz)',
      description: 'a single gzipped file; restore with mongorestore --gzip --archive',
    },
    gzip: { label: 'Folder, compressed (gzip)', description: '.bson.gz files; restore with mongorestore --gzip --dir' },
    plain: { label: 'Folder, uncompressed', description: '.bson files' },
  },
  archiveFilter: 'mongodump archive (gzip)',
  backUp: 'Back up',
  backUpHere: 'Back up here',
  choose: 'Choose',
  noDatabases: (connection: string): string => `${connection} has no databases to back up.`,
  notConnected: (connection: string, error: string): string => `Could not connect to ${connection}: ${error}`,
  notConnectedError: 'not connected',
  onlyTimeSeries: "Nothing to back up: time series collections aren't supported (use mongodump).",
  empty: (what: string): string => `Nothing to back up in ${what}.`,
  planTitle: (what: string): string => `Back up ${what}`,
  cannotUndo: 'A backup writes files, not a deployment: there is nothing to undo.',
  progressTitle: (what: string): string => `Backing up ${what}`,
  progress: (namespace: string, documents: number): string => `${namespace}: ${counted(documents, 'document')}`,
  done: (what: string, totals: BackupTotals, path: string, seconds: string): string =>
    `Backed up ${what} (${counted(totals.collections, 'collection')}, ${counted(totals.documents, 'document')}, ` +
    `${sizeText(totals.bytes)}) to ${path} in ${seconds} s.`,
  leftOut: (namespaces: readonly string[]): string =>
    ` Time series collections aren't supported and were left out (use mongodump): ${namespaces.join(', ')}.`,
  copyCommand: 'Copy mongorestore command',
  revealFile: 'Reveal file',
  revealFolder: 'Reveal folder',
  failedBefore: (error: string): string => `Backup failed: ${error}`,
  failed: (what: string, error: string): string => `Backup of ${what} failed: ${error}`,
  cancelled: (what: string): string => `Backup of ${what} cancelled: the incomplete backup was deleted.`,
} as const;

/** What a finished backup counted, for its message. */
export interface BackupTotals {
  readonly collections: number;
  readonly documents: number;
  /** The size of the documents before compression. */
  readonly bytes: number;
}

/** What a restore did, for its message (`backup.restore`). */
export interface RestoreTotals {
  readonly inserted: number;
  readonly skipped: number;
  readonly failed: number;
  readonly firstError?: string;
  readonly indexes: number;
  readonly collections: number;
  readonly indexErrors: readonly string[];
  readonly notRestored: readonly string[];
  /** How many operations of the undo history were recorded. */
  readonly recorded: number;
}

/** The text of **Restore from backup…** (`backup.restore`). */
export const restoreText = {
  command: 'Restore from backup…',
  title: (where: string, step: string): string => `Restore into ${where}: ${step}`,
  planTitle: (where: string): string => `Restore into ${where}`,
  backupStep: 'backup',
  kinds: {
    archive: { label: 'Archive', description: 'a single .agz or .archive file (mongodump --archive)' },
    folder: { label: 'Folder', description: 'a folder backup (mongodump --out), or the folder of one database' },
  },
  archiveStep: 'archive',
  folderStep: 'backup folder',
  archiveFilter: 'mongodump archive',
  allFiles: 'All files',
  restore: 'Restore',
  choose: 'Choose',
  databasesStep: 'databases',
  databaseOfBackupStep: 'database of the backup',
  databaseStep: 'database',
  databasePrompt: (connection: string, database: string): string =>
    `Database on ${connection} to restore ${database} into`,
  databaseNeeded: 'Enter a database name',
  ownNameNotProposed: (why: string): string => ` (its own name isn't proposed: ${why})`,
  systemDatabase: 'a system database',
  invalidDatabase: 'not a valid database name',
  notOffered: (list: readonly string[]): string => `Not offered: ${list.join(', ')}`,
  nothingUnderItsNames: (file: string, list: readonly string[]): string =>
    `Nothing of ${file} is restored under the names it gives: ${list.join(', ')}. ` +
    'To restore one of them, use Restore from backup… on the database to restore it into.',
  viewsReplace: (namespaces: readonly string[]): string =>
    `The backup has a view in place of ${namespaces.length === 1 ? 'this collection, which is dropped with its' : 'these collections, which are dropped with their'} documents: ${namespaces.join(', ')}.`,
  ttlKeptOff: (index: string): string =>
    `Index not created — ${index}: a TTL index (expireAfterSeconds) would make the server delete documents that were already in the collection; create it from the Indexes section if it's wanted`,
  collectionsStep: (database: string): string => `collections of ${database}`,
  metadataOnly: 'view or metadata only',
  bsonStep: 'BSON file or archive',
  bsonFilter: 'BSON or archive (mongodump)',
  collectionOfArchiveStep: 'collection of the archive',
  existingStep: 'existing collections',
  modes: {
    add: { label: 'Add documents', description: 'documents whose _id already exists are kept and skipped' },
    drop: { label: 'Drop and restore', description: 'each collection is dropped first, like mongorestore --drop' },
  },
  confirm: (count: number, connection: string, databases: string): string =>
    `Restore ${counted(count, 'collection')} into ${connection} › ${databases}?`,
  from: (path: string): string => `From ${path}.`,
  dropped:
    "Existing collections with the same names are dropped first, with their documents and indexes: this can't be undone.",
  added: 'Documents are added; those whose _id already exists are skipped.',
  undoable: 'It can be undone from the Undo history, for collections of up to 10,000 documents.',
  cannotUndo: "Existing collections are dropped first: this can't be undone.",
  undoTitleFolder: (file: string): string => `Restore ${file}`,
  undoTitleArchive: (collection: string, archive: string): string => `Restore ${collection} from ${archive}`,
  readOnly: (connection: string): string =>
    `The connection ${connection} is read-only: nothing can be restored into it.`,
  unreadable: (file: string, error: string): string => `Can't read ${file}: ${error}`,
  empty: (file: string): string => `${file} has no collections to restore.`,
  noBackup: (folder: string): string =>
    `No backup found in ${folder}: expected <collection>.bson and <collection>.metadata.json files (mongodump), ` +
    'or a folder of them per database.',
  timeSeries: 'a time series collection (use mongorestore)',
  viewExists: 'a view that already exists',
  progressTitle: (where: string): string => `Restoring into ${where}`,
  summary: (totals: RestoreTotals): string =>
    `${counted(totals.inserted, 'document')} and ${counted(totals.indexes, 'index', 'indexes')} in ` +
    counted(totals.collections, 'collection'),
  done: (summary: string, connection: string, databases: string, seconds: string): string =>
    `Restored ${summary} into ${connection} › ${databases} in ${seconds} s.`,
  skipped: (count: number): string => `${groupThousands(count)} skipped (their _id already existed)`,
  failedSome: (count: number, error: string): string => `${groupThousands(count)} failed: ${error}`,
  indexNotCreated: (index: string): string => `Index not created — ${index}`,
  notRestored: (list: readonly string[]): string => `Not restored: ${list.join(', ')}`,
  undoEach: 'Undo from the Undo history, one operation per collection',
  failed: (where: string, error: string): string => `Restore into ${where} failed: ${error}`,
  restoredBefore: (summary: string): string => ` Restored before the error: ${summary}.`,
  cancelled: (where: string, summary: string): string =>
    `Restore into ${where} cancelled after ${summary}; those stay.`,
} as const;
