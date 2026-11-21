/**
 * The text of the value area, word for word from its cards (R10.1): the messages of refusals, the questions and
 * confirmations, the notifications, and what the views say. Names are given already written as text (`nameText`).
 */
import { groupThousands } from '../../shared/text-units';
import type { ValueType } from './types';

/** How many of something, in the singular for one: `1 field`, `12 fields`. */
export function counted(count: number, one: string, many: string): string {
  return `${groupThousands(count)} ${count === 1 ? one : many}`;
}

/** The unit each type counts its items in, singular and plural. */
export const itemWords: Readonly<Record<ValueType, readonly [string, string]>> = {
  string: ['byte', 'bytes'],
  hash: ['field', 'fields'],
  list: ['element', 'elements'],
  set: ['member', 'members'],
  zset: ['member', 'members'],
  stream: ['entry', 'entries'],
};

/** A type as the messages name it, with its article: `a hash`, `a sorted set`, `a ReJSON-RL`. */
export function typeWithArticle(type: string): string {
  const word = type === 'zset' ? 'sorted set' : type;
  return `a ${word}`;
}

/** What every write of the area says before it writes. */
export const checkText = {
  readOnly: (connection: string): string => `The connection ${connection} is read-only.`,
  gone: (key: string): string => `The key ${key} no longer exists: it was deleted or it expired.`,
  typeChanged: (key: string, now: string, was: string): string =>
    `${key} is now ${typeWithArticle(now)}: it was ${typeWithArticle(was)} when this tab read it. Refresh to see it.`,
  typeChangedNotice: (key: string, now: string, was: string): string =>
    `${key} is now ${typeWithArticle(now)}: it was ${typeWithArticle(was)} when this tab read it.`,
  allItems: (key: string, many: string): string => `They are all the ${many} of ${key}: the key is deleted with them.`,
  noneLeft: (key: string, many: string): string => `${key} has no ${many} left: the key was deleted.`,
  nothingChanged: 'Nothing to save: the value is as it was.',
};

/** The texts of the reads. */
export const readText = {
  firstPartOf: (part: string, whole: string): string => `Showing the first ${part} of ${whole}.`,
  firstOfCompact: (part: string, whole: string): string => `First ${part} of ${whole}.`,
  changedWhileRead: 'The value changed while it was read: loaded again.',
  tooLargeToEdit: (size: string): string => `This value is ${size}: Datardo edits strings of up to 16 MB.`,
  found: (found: string, total: string): string => `${found} found of ${total}`,
  firstItems: (shownCount: number, total: string): string => `First ${groupThousands(shownCount)} of ${total}.`,
  index: 'Enter an index, for example 0, 5000 or -1.',
  noElementAt: (index: string, count: number): string =>
    `No element at index ${index}: the list has ${groupThousands(count)}.`,
  scoreBound: 'Enter a number, -inf or +inf; put ( before it to leave it out.',
  inScores: (found: number, total: number): string =>
    `${counted(found, 'member', 'members')} of ${groupThousands(total)}`,
  streamBound: 'Enter an ID, for example 1700000000000-0, or a date and time.',
};

/** The texts of the writes to strings and hashes. */
export const hashText = {
  saveTitle: (key: string): string => `Edit ${key}`,
  saved: (key: string): string => `Saved ${key}.`,
  overwriteString: (key: string): string => `${key} was changed in the database after it was loaded. Overwrite it?`,
  overwrite: 'Overwrite',
  createAgain: (key: string): string => `The key ${key} no longer exists. Create it again?`,
  createAgainDetail: 'It is created without an expiry.',
  createAgainButton: 'Create again',
  notSaved: 'Not saved: the value changed in the database.',
  noKeepTtl: 'This server does not support SET with KEEPTTL: saving would remove the expiry.',
  addFieldTitle: (field: string, key: string): string => `Add field ${field} to ${key}`,
  addedField: (field: string, key: string): string => `Added the field ${field} to ${key}.`,
  fieldExists: (key: string, field: string): string =>
    `${key} already has a field named ${field}: edit its value instead.`,
  addFieldForm: (key: string): string => `Add a field to ${key}`,
  fieldAs: 'Field as',
  valueAs: 'Value as',
  editFieldTitle: (field: string, key: string): string => `Edit field ${field} of ${key}`,
  savedField: (field: string, key: string): string => `Saved the field ${field} of ${key}.`,
  fieldChanged: (field: string, key: string, now: string): string =>
    `${field} of ${key} was changed to ${now} in the database after it was loaded. Overwrite it?`,
  fieldRemoved: (field: string, key: string): string =>
    `${field} of ${key} was removed in the database after it was loaded. Overwrite it?`,
  renameTitle: (from: string, to: string, key: string): string => `Rename field ${from} to ${to} of ${key}`,
  renamed: (from: string, to: string): string => `Renamed the field ${from} to ${to}.`,
  nameExists: (key: string, field: string): string => `${key} already has a field named ${field}.`,
  fieldGone: (field: string, key: string): string => `The field ${field} is no longer in ${key}.`,
};

/** The texts of a removal of items: fields, elements, members, entries. */
export const removalText = {
  removeOne: (what: string, name: string, key: string): string => `Remove the ${what} ${name} from ${key}?`,
  removeMany: (count: string, key: string): string => `Remove ${count} from ${key}?`,
  removeButton: 'Remove',
  titleOne: (what: string, name: string, key: string): string => `Remove ${what} ${name} from ${key}`,
  titleMany: (count: string, key: string): string => `Remove ${count} from ${key}`,
  removedOne: (what: string, name: string, key: string): string => `Removed the ${what} ${name} from ${key}.`,
  removedMany: (count: string, key: string): string => `Removed ${count} from ${key}.`,
  removedSome: (removed: number, asked: string, key: string): string =>
    `Removed ${groupThousands(removed)} of ${asked} from ${key}: the others were already gone.`,
};

/** The texts of the writes to lists. */
export const listText = {
  pushForm: (key: string): string => `Push to ${key}`,
  pushTitle: (key: string): string => `Push to ${key}`,
  pushed: (end: 'head' | 'tail', key: string): string => `Pushed an element to the ${end} of ${key}.`,
  elementAs: 'Element as',
  editTitle: (index: number, key: string): string => `Edit element ${String(index)} of ${key}`,
  saved: (index: number, key: string): string => `Saved the element ${String(index)} of ${key}.`,
  changed: (index: number, key: string): string =>
    `The element at index ${String(index)} of ${key} is no longer the one shown: the list changed. Refresh and retry.`,
  removeOne: (index: number, key: string): string => `Remove the element at index ${String(index)} from ${key}?`,
  titleOne: (index: number, key: string): string => `Remove element ${String(index)} from ${key}`,
  removedOne: (index: number, key: string): string => `Removed the element at index ${String(index)} from ${key}.`,
  trimForm: (key: string): string => `Trim ${key}`,
  trimFrom: 'Keep the elements from index',
  trimTo: 'to',
  trimButton: 'Trim',
  keeps: (kept: number, count: number): string =>
    `Keeps ${groupThousands(kept)} of ${counted(count, 'element', 'elements')}.`,
  trimQuestion: (key: string, kept: number): string => `Trim ${key} to ${counted(kept, 'element', 'elements')}?`,
  trimDetail: (removed: number, count: number, from: number, to: number): string =>
    `${groupThousands(removed)} of ${counted(count, 'element', 'elements')} are removed: those before index ${String(from)} and after index ${String(to)}.`,
  trimTitle: (key: string, from: string, to: string): string => `Trim ${key} to ${from}…${to}`,
  trimmed: (key: string, kept: number): string => `Trimmed ${key} to ${counted(kept, 'element', 'elements')}.`,
  keepsAll: 'This range keeps every element: there is nothing to trim.',
  keepsNone: 'This range keeps no element: the key would be deleted. Use Delete key instead.',
};

/** The texts of the writes to sets and sorted sets. */
export const memberText = {
  addForm: (key: string): string => `Add a member to ${key}`,
  memberAs: 'Member as',
  addTitle: (member: string, key: string): string => `Add member ${member} to ${key}`,
  added: (member: string, key: string): string => `Added the member ${member} to ${key}.`,
  exists: (member: string, key: string): string => `${member} is already a member of ${key}.`,
  scoredExists: (member: string, key: string, score: string): string =>
    `${member} is already a member of ${key}, with the score ${score}: change its score instead.`,
  score: 'Enter a number, inf or -inf.',
  scoreTitle: (member: string, key: string): string => `Change score of ${member} in ${key}`,
  savedScore: (member: string, key: string): string => `Saved the score of ${member} in ${key}.`,
  scoreChanged: (member: string, key: string, now: string): string =>
    `The score of ${member} in ${key} was changed to ${now} in the database after it was loaded. Overwrite it?`,
  memberGone: (member: string, key: string): string => `${member} is no longer a member of ${key}.`,
  notSavedScore: 'Not saved: the score changed in the database.',
};

/** The texts of the writes to streams. */
export const streamText = {
  addForm: (key: string): string => `Add an entry to ${key}`,
  addTitle: (key: string): string => `Add entry to ${key}`,
  added: (id: string, key: string): string => `Added the entry ${id} to ${key}.`,
  /** Before the server answers with the ID it gave (Q58): the notification knows no ID. */
  addedNew: (key: string): string => `Added an entry to ${key}.`,
  idNotGreater: (last: string): string => `The ID must be greater than the last one, ${last}.`,
  noPair: 'An entry needs at least one field with a name.',
  badId: 'Enter *, or an ID such as 1700000000000-0.',
  needsFullId: 'This server needs * or a full ID.',
  deleteOne: (id: string, key: string): string => `Delete the entry ${id} from ${key}?`,
  deleteMany: (count: number, key: string): string => `Delete ${groupThousands(count)} entries from ${key}?`,
  deleteDetail: 'Consumer groups keep an entry they have pending in their lists, without its fields.',
  deleteButton: 'Delete',
  deleteTitleOne: (id: string, key: string): string => `Delete entry ${id} from ${key}`,
  deleteTitleMany: (count: number, key: string): string => `Delete ${groupThousands(count)} entries from ${key}`,
  deletedOne: (id: string, key: string): string => `Deleted the entry ${id} from ${key}.`,
  deletedMany: (count: number, key: string): string => `Deleted ${groupThousands(count)} entries from ${key}.`,
  deletedSome: (deleted: number, asked: number, key: string): string =>
    `Deleted ${groupThousands(deleted)} of ${groupThousands(asked)} entries from ${key}: the others were already gone.`,
  trimForm: (key: string): string => `Trim ${key}`,
  keepNewest: 'Keep the newest',
  keepFrom: 'Keep the entries from',
  trimButton: 'Trim',
  trimNewestQuestion: (key: string, count: number): string =>
    `Trim ${key} to its newest ${counted(count, 'entry', 'entries')}?`,
  trimNewestDetail: (deleted: number, count: number): string =>
    `${groupThousands(deleted)} of ${counted(count, 'entry', 'entries')} are deleted.`,
  trimFromQuestion: (key: string, id: string): string => `Trim ${key} to the entries from ${id}?`,
  trimFromDetail: 'Every older entry is deleted.',
  trimNewestTitle: (key: string, count: number): string => `Trim ${key} to ${counted(count, 'entry', 'entries')}`,
  trimFromTitle: (key: string, id: string): string => `Trim ${key} from ${id}`,
  trimmed: (deleted: number, key: string): string => `Deleted ${counted(deleted, 'entry', 'entries')} from ${key}.`,
  trimmedFrom: (key: string, id: string): string => `Trimmed ${key} to the entries from ${id}.`,
  nothingToTrim: (key: string, count: number): string =>
    `${key} has ${counted(count, 'entry', 'entries')}: there is nothing to trim.`,
  badCount: 'Enter a whole number of entries, 0 or more.',
};

/** The texts of the views: `value.show`, `value.item-editor`, `value.stream-groups`. */
export const viewText = {
  moduleType: (type: string): string => `Datardo does not show values of the type ${type} yet.`,
  openConsole: 'Open the console',
  closeTab: 'Close tab',
  reload: 'Reload',
  retry: 'Retry',
  refresh: 'Refresh',
  openInTab: 'Open in a tab',
  loadMore: 'Load more',
  loadWhole: 'Load the whole value',
  emptyString: 'Empty string.',
  noEntries: 'No entries.',
  noMatch: (many: string, pattern: string): string => `No ${many} match ${pattern}.`,
  sortedAmong: (count: number, many: string): string => `Sorted among the ${String(count)} ${many} loaded.`,
  nothingSelected: 'Nothing selected',
  selectRow: 'Select a row to see its value here.',
  memberFixed: 'A member cannot be changed: remove it and add another.',
  entryFixed: 'An entry of a stream cannot be changed: add another and delete this one.',
  bytesLong: (count: string): string => `${count} bytes`,
  hint: 'Enter to save · Shift+Enter new line · Esc to cancel',
  editDialog: (name: string): string => `Edit the value of ${name}`,
  save: 'Save',
  cancel: 'Cancel',
  groupsReadOnly: 'Groups are read-only in this release: use the console to create, acknowledge or claim.',
  noGroups: 'No consumer groups.',
  nothingPending: 'Nothing pending.',
};

/** The texts of copying and refreshing. */
export const copyText = {
  tooLarge: 'Too large to copy: export the key to a file instead.',
  copied: 'Copied',
  copyTitle: 'Copy value',
  refreshTitle: 'Refresh value',
  discard: (key: string): string => `Discard your changes to ${key}?`,
  discardButton: 'Discard',
  nothingToUndo: 'There is nothing to undo.',
};
