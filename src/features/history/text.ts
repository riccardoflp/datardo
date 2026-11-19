/**
 * The text of the interface of the document history, word for word as the cards write it (R10.1).
 */
import { groupThousands } from '../../shared/text-units';

/** `1 field`, `3 fields`, with the thousands grouped. */
export function counted(count: number, singular: string, plural = `${singular}s`): string {
  return `${groupThousands(count)} ${count === 1 ? singular : plural}`;
}

/** What `history.oplog-window` and `history.read-writes` refuse. */
export const oplogText = {
  sharded:
    'This is a sharded cluster (mongos): each shard has its own oplog. Connect to the replica set of the shard that holds the document to see its history.',
  standalone:
    'A standalone server has no oplog, so there is no history of the writes: it needs a replica set. A single-node one is enough (mongod --replSet rs0, then rs.initiate()).',
  view: (collection: string): string =>
    `${collection} is a view: its documents are written in its source collection. Open the history from there.`,
  notAuthorized:
    "Not authorized to read the oplog: reading local.oplog.rs needs a role such as clusterMonitor or readAnyDatabase (or read on the local database). Atlas shared tiers (M0, Flex) don't allow it at all.",
  tooSlow: (seconds: number): string =>
    `Reading the oplog took more than ${String(seconds)} s without reaching any entry: the server may be too busy, try again.`,
} as const;

/** What happened to the collection, from a command of its database (`history.document-writes`, rule 3). */
export const commandText = {
  collectionDropped: 'collection dropped',
  databaseDropped: 'database dropped',
  renamedTo: (to: string): string => `collection renamed to ${to}`,
  renamedFrom: (from: string): string => `renamed into this collection from ${from}`,
} as const;

/** The **changes** column (`history.update-changes`, `history.show`). */
export const changesText = {
  set: (paths: string): string => `set ${paths}`,
  unset: (paths: string): string => `unset ${paths}`,
  resized: (arrays: string): string => `resized ${arrays}`,
  noChange: 'no change',
  resizedTo: (array: string, length: string): string => `${array} to ${length}`,
  inserted: (fields: number): string => `inserted a document of ${counted(fields, 'field')}`,
  replaced: (fields: number): string => `replaced with a document of ${counted(fields, 'field')}`,
  deleted: 'deleted',
} as const;

/** Why a version could not be rebuilt from the one before (`history.versions`). */
export const mismatchText = {
  missingField: (field: string): string => `The diff changes ${field}, which the document doesn't have`,
  missingElement: (index: number): string =>
    `The diff changes the element ${String(index)}, which the array doesn't have`,
  notAnIndex: (key: string): string => `${key} is not an index of an array`,
  cannotHoldFields: (path: string): string => `${path} can't hold fields`,
  notAnArray: 'An array diff on a value that is not an array',
  notASubDocument: 'A sub-document diff on a value that is not a sub-document',
  unknownFormat: (keys: string): string => `Unknown update format: ${keys}`,
  unknownSection: (section: string): string => `Unknown diff section ${section}`,
  unknownArraySection: (section: string): string => `Unknown array diff section ${section}`,
  updateAfterDelete: 'An update of a document that was deleted',
} as const;

/** The document history page (`history.show`). */
export const showText = {
  tabTitle: (id: string): string => `History: ${id}`,
  command: 'Document history',
  noDocument: 'Open a document of a collection first: a new document has no history yet.',
  openDocument: 'Open document',
  openDocumentTip: 'Open the document as it is now in a document tab',
  refresh: 'Refresh',
  refreshTip: 'Read the oplog again',
  oplogBack: (date: string, duration: string): string =>
    `The oplog goes back to ${date} (${duration}): older writes are no longer there.`,
  oplogEmpty: 'The oplog is empty.',
  found: (writes: number, seconds: string): string => `${counted(writes, 'write')} found in ${seconds} s.`,
  conflict:
    'Some writes rebuilt from an insert lead to a different document than the one there is now (writes missing from the oplog read, or made while reading): those versions are shown from the current document instead.',
  columns: { time: 'time', write: 'write', changes: 'changes', by: 'by', version: 'version' },
  kinds: {
    insert: 'Insert',
    update: 'Update',
    replace: 'Replace',
    delete: 'Delete',
    drop: 'Removed',
    renamed: 'Renamed',
  },
  datardo: 'Datardo',
  datardoTip: (title: string): string => `Written from Datardo: ${title} (in the Undo history)`,
  transaction: 'transaction',
  largeTransaction: 'part of a large transaction (several oplog entries)',
  preparedTransaction: 'prepared transaction',
  batch: 'batch',
  batchTip: 'One command writing several documents, logged as one applyOps',
  retryableWrite: 'retryable write',
  session: (session: string): string => `session ${session}`,
  transactionNumber: (number: string): string => `txnNumber ${number}`,
  chunkMigration: 'chunk migration',
  chunkMigrationTip: 'Written by the balancer moving a chunk to another shard, not by a client',
  current: 'current',
  currentTip: 'The document as it is now',
  partial: 'partial',
  partialTip: (paths: string): string => `Some values of this version aren't known: ${paths}`,
  unknown: 'unknown',
  unknownTip:
    "What the document was at this point isn't known: the write before it isn't in the part of the oplog read",
  absent: 'no document',
  absentTip: "The document didn't exist after this write",
  restore: 'Restore…',
  insertAgain: 'Insert again…',
  restoreTip: 'Replace the document as it is now with this version (after a confirmation)',
  insertAgainTip: 'The document was deleted: insert it again as it was in this version (after a confirmation)',
  readOnly: (name: string): string => `The connection ${name} is read-only.`,
  olderGone: 'Older versions are no longer in the oplog.',
  readBack: (date: string): string =>
    `The oplog was read back to ${date}. Older writes of this document may be in the rest.`,
  timeLimit: (date: string): string =>
    `Reading stopped at the time limit: the oplog was read back to ${date}. Older writes of this document may be in the rest.`,
  loadOlder: 'Load older',
  loadOlderTip: 'Read the older part of the oplog',
  loading: 'Reading the oplog…',
  loadingOlder: 'Reading older entries of the oplog…',
  emptyWhole: (date: string): string =>
    `No write to this document is left in the oplog: it was last written before ${date}.`,
  emptyPart: 'No write to this document in the part of the oplog read: Load older reads further back.',
} as const;

/** A version in the inspector (`history.version-detail`). */
export const detailText = {
  heading: (date: string, timestamp: string): string => `${date} · ${timestamp}`,
  restore: 'Restore this version…',
  insertAgain: 'Insert again…',
  copy: 'Copy',
  copyTip: 'Copy this version of the document',
  partial: (paths: string): string =>
    `Partial: the values marked ? aren't known (${paths}). The oplog keeps the new values of an update, not the old ones: a version is known in full from an insert or a replacement still in the oplog, or when it is the current document.`,
  unknown:
    "The document at this point isn't known: it was rebuilt neither from an insert or replacement in the oplog nor back from the current document.",
  mismatch: (reason: string): string =>
    `This write doesn't fit the version before as rebuilt (${reason}): some writes are missing from the part of the oplog read.`,
  datardo: (title: string): string => `Written from Datardo: ${title}.`,
  columns: { field: 'field', before: 'before', after: 'after' },
  unknownValue: '?',
  unknownValueTip:
    'Not known: the oplog keeps the new values of an update, not the old ones (it may also have been missing)',
  missing: '—',
  missingTip: 'The field is missing',
  noChange: 'No field changed.',
  document: 'Document after this write',
  partialDocument: 'Document after this write (partial)',
  nothingSelected: 'Select a write to see what it changed.',
} as const;

/** Copying a version (`history.copy-version`). */
export const copyText = {
  title: 'Copy this version of the document',
  copied: 'Copied to the clipboard',
  cannotUndo: 'Cannot be undone: nothing is written.',
} as const;
