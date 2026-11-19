/**
 * The text of the interface of the undo history, word for word from its cards (R10.1).
 */
import { groupThousands } from '../../shared/text-units';

/** `1 document`, `2,500 documents`. */
export function counted(count: number, word: string): string {
  return `${groupThousands(count)} ${word}${count === 1 ? '' : 's'}`;
}

/** The texts of `undo.note` and `undo.record`. */
export const recordText = {
  canBeUndone: 'It can be undone from the Undo history.',
  off: "The undo history is off for this connection: this can't be undone.",
  overLimit: (limit: number, unit: string): string =>
    `This can't be undone: the undo history keeps operations of up to ${counted(limit, unit)}.`,
  moreThanCount: (limit: number, unit: string): string => `more than ${counted(limit, unit)}`,
  moreThanSize: (megabytes: number): string => `more than ${groupThousands(megabytes)} MB`,
  question: (action: string): string => `${action} without the possibility to undo?`,
  tooManyDocuments: (reason: string): string =>
    `The documents matching the filter are ${reason}: too many for the undo history (settings datardo.undo).`,
  tooManyKeys: (reason: string): string =>
    `The keys are ${reason}: too many for the undo history (settings datardo.undo).`,
  keysNotKept: (error: string): string => `The keys can't be kept for the undo history: ${error}`,
  withoutUndo: (action: string): string => `${action} without undo`,
  continue: 'Continue',
  notSaved: (error: string): string => `The change was made, but couldn't be saved in the undo history: ${error}`,
  writeFile: (path: string): string => `write ${path}`,
  addOperation: (title: string): string => `add the operation "${title}" to the undo history`,
  recordCannotUndo: 'It is what makes the other writes undoable: a recorded operation can be removed or cleared.',
} as const;

/** The texts of the **Undo history** page (`undo.show`) and of the details of a row (`undo.details`). */
export const pageText = {
  title: 'Undo history',
  opensNothing: 'Opening a page writes nothing.',
  filter: 'Filter by connection, target or operation',
  undoLast: 'Undo last change',
  settings: 'Settings',
  clear: 'Clear history…',
  off: "The undo history is off (setting datardo.undo.enabled): new changes aren't recorded.",
  columns: ['when', 'target', 'operation', 'changes', 'size'] as const,
  undo: 'Undo',
  undoing: 'Undoing…',
  undoDocuments: 'Put the documents back as they were before this operation',
  undoKeys: 'Put the keys back as they were before this operation',
  remove: '✕',
  removeTooltip: 'Remove from the history (the operation can no longer be undone)',
  undone: 'undone',
  undoneAt: (when: string): string => `Undone ${when}`,
  empty: 'No operations yet: changes made from Datardo to documents and keys show up here, to undo them.',
  noMatch: 'No operations match the filter.',
  yesterday: (time: string): string => `yesterday ${time}`,
  summary: (operations: number, used: string, most: string): string =>
    `${counted(operations, 'operation')} · ${used} of ${most}`,
  shown: (count: number): string => `${groupThousands(count)} shown`,
  limits: (days: number, operations: number, size: string, documents: number): string =>
    `Kept for ${counted(days, 'day')}, up to ${counted(operations, 'operation')} and ${size}; operations of more than ${groupThousands(documents)} documents or keys aren't recorded.`,
} as const;

/** The texts of the details of an operation (`undo.details`). */
export const detailsText = {
  loading: 'Loading…',
  firstOf: (shown: number, total: number, unit: string): string =>
    `First ${groupThousands(shown)} of ${counted(total, unit)}.`,
  inserted: 'inserted: the undo deletes it',
  updated: 'updated: the undo restores it',
  deleted: 'deleted: the undo inserts it again',
  created: 'created: the undo deletes it',
  changed: 'changed: the undo restores it',
  deletedKey: 'deleted: the undo creates it again',
  changedSince: 'changed since',
  someChanged: (count: number, unit: string): string =>
    `${counted(count, unit)} changed after the operation: undoing overwrites those changes too.`,
  field: 'field',
  now: 'now',
  afterUndo: 'after the undo',
  missing: '—',
  missingNow: 'Missing now',
  missingAfter: 'Missing after the undo',
  wholeDocument: '(document)',
  alreadyAsItWas: 'Already as it was: the undo changes nothing.',
  alreadyDeleted: 'Already deleted.',
  noExpiry: 'no expiry',
  expiresIn: (seconds: number): string => `expires in ${groupThousands(seconds)} s`,
} as const;

/** The texts of undoing an operation (`undo.changed-since`, `undo.revert`, `undo.last`). */
export const revertText = {
  undo: 'Undo',
  undoAnyway: 'Undo anyway',
  undoAll: 'Undo all',
  undoUnchanged: 'Undo unchanged only',
  choice: 'What to undo',
  oneChanged: (unit: string): string =>
    `The ${unit} changed after the operation: undoing overwrites those changes too.`,
  allChanged: 'All of them changed after the operation: undoing overwrites those changes too.',
  someChanged: (count: number): string =>
    `${groupThousands(count)} of them changed after the operation: undoing overwrites those changes too.`,
  question: (title: string, where: string): string => `Undo "${title}" in ${where}?`,
  documentsWhat: (parts: readonly string[]): string => `The undo ${parts.join(', ')}.`,
  deletesInserted: (count: number): string => `deletes ${counted(count, 'inserted document')}`,
  restoresUpdated: (count: number): string => `restores ${counted(count, 'updated document')}`,
  insertsDeleted: (count: number): string => `inserts again ${counted(count, 'deleted document')}`,
  deletesCreated: (count: number): string => `deletes ${counted(count, 'created key')}`,
  restoresChanged: (count: number): string => `restores ${counted(count, 'changed key')}`,
  createsDeleted: (count: number): string => `creates again ${counted(count, 'deleted key')}`,
  gone: 'This operation is no longer in the undo history.',
  alreadyUndone: 'This operation was already undone.',
  noConnection: (name: string): string => `The connection ${name} no longer exists.`,
  readOnly: (name: string): string => `The connection ${name} is read-only: nothing can be undone through it.`,
  undid: (title: string, count: number, unit: string, where: string): string =>
    `Undid "${title}": ${counted(count, unit)} in ${where}.`,
  incomplete: (
    title: string,
    counts: { readonly failed: number; readonly total: number },
    unit: string,
    error: string,
  ): string =>
    `Undo of "${title}" incomplete: ${counted(counts.failed, unit)} of ${groupThousands(counts.total)} failed: ${error}`,
  failed: (error: string): string => `Undo failed: ${error}`,
  dump: (size: string): string => `<dump, ${size}>`,
  markUndone: (title: string): string => `mark the operation "${title}" as undone`,
  empty: 'Nothing to undo: the undo history is empty.',
  severalCollections: 'Undo from the Undo history, one operation per collection',
} as const;

/** The texts of removing operations (`undo.clear`, `undo.remove`, `undo.forget-connection`, `undo.limits`). */
export const removeText = {
  clearQuestion: 'Clear the undo history?',
  clearText: (count: number): string => `${counted(count, 'operation')} can then no longer be undone.`,
  clearButton: 'Clear history',
  clearStep: (count: number): string => `delete the ${counted(count, 'operation')} of the undo history`,
  alreadyEmpty: 'The undo history is already empty.',
  cannotUndoClear: 'The files are deleted: the operations can no longer be undone.',
  removeTitle: (title: string): string => `Remove "${title}" from the undo history`,
  removeStep: (title: string): string => `delete the operation "${title}" from the undo history`,
  cannotUndoRemove: 'The file is deleted: the operation can no longer be undone.',
  forgetTitle: (name: string): string => `Delete the operations of ${name} from the undo history`,
  forgetStep: (count: number, name: string): string =>
    `delete the ${counted(count, 'operation')} of ${name} from the undo history`,
  limitsTitle: 'Apply the limits of the undo history',
  pruneStep: (count: number): string =>
    `delete the ${counted(count, 'operation')} beyond the limits of the undo history`,
  missingFileStep: (count: number): string =>
    `drop the ${counted(count, 'operation')} of the undo history whose file is missing`,
  orphanStep: (count: number): string =>
    `delete ${counted(count, 'file')} of the undo history that belong to no operation`,
} as const;

/** The texts of turning the undo history of a connection off and on (`undo.per-connection`). */
export const connectionText = {
  stop: 'Stop keeping undo history',
  keep: 'Keep undo history',
  saveConnection: (name: string): string => `save the connection ${name}`,
  notKept: "Changes aren't kept in the undo history",
  readOnly: (name: string): string => `The connection ${name} is read-only: nothing is recorded through it.`,
  cannotUndo: 'The other entry turns it back.',
} as const;

/** The notifications of `undo/index.json` when Datardo starts or writes it. */
export const storeText = {
  newer:
    'This data was written by a newer version of Datardo. Changes to the undo history are not saved until Datardo is updated.',
  setAside: (name: string): string => `The undo history could not be read and was set aside as ${name}.`,
  notSaved: (error: string): string => `The undo history could not be saved: ${error}`,
  openDataFolder: 'Open data folder',
};
