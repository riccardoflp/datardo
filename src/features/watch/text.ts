/**
 * The text of the interface of the Watch changes page, word for word as the cards write it (R10.1).
 */
import { groupThousands } from '../../shared/text-units';

/** `1 change event`, `1,000 change events`. */
export function changeEvents(count: number): string {
  return `${groupThousands(count)} ${count === 1 ? 'change event' : 'change events'}`;
}

/** The page (`watch.show`). */
export const showText = {
  command: 'Watch changes',
  tabTitle: (name: string): string => `Watch: ${name}`,
  allDatabases: 'all databases',
  states: {
    starting: 'Starting…',
    watching: 'Watching',
    stopped: 'Stopped',
    paused: 'Paused',
    pausedNew: (count: number): string => `Paused · ${groupThousands(count)} new`,
  },
  types: { insert: 'insert', update: 'update', replace: 'replace', delete: 'delete', other: 'other' },
  typeTips: {
    insert: 'Show the insert events',
    update: 'Show the update events',
    replace: 'Show the replace events',
    delete: 'Show the delete events',
    other: 'drop, rename, dropDatabase, invalidate…',
  },
  search: 'Search the change events',
  filter: 'Filter',
  filterTip: 'A $match on the change events, or a list of stages, applied by the server',
  filterPlaceholder: '{ "fullDocument.status": "active" }  —  Enter applies',
  fullDocument: 'Current document on update',
  fullDocumentTip: 'On updates, also read the current version of the document',
  preImages: 'Pre-images recorded',
  preImagesTip: 'The collection stores the document before each change: updates show the values before.',
  noPreImages: 'Values before a change: not recorded',
  noPreImagesTip: 'The collection does not store pre-images (changeStreamPreAndPostImages).',
  count: (shown: number, all: number): string =>
    shown === all ? changeEvents(all) : `${groupThousands(shown)} of ${changeEvents(all)}`,
  dropped: (count: number): string => `(${groupThousands(count)} older dropped)`,
  columns: { time: 'time', type: 'type', collection: 'collection', id: '_id', changes: 'changes' },
  starting: 'Starting the change stream…',
  waiting: 'Waiting for changes… Insert, update or delete a document to see it here.',
  nothingMatches: 'No change event matches the filters.',
  notWatching: 'Not watching. Press Start.',
  invalidated: 'The stream was invalidated: the collection or database was dropped or renamed.',
} as const;

/** The stream (`watch.stream`). */
export const streamText = {
  standalone:
    'Change streams need a replica set or a sharded cluster: this server is a standalone. (A single-node replica set is enough, e.g. mongod --replSet rs0 and rs.initiate().)',
} as const;

/** The filter (`watch.pipeline`). */
export const pipelineText = {
  stage: (stage: string): string => `A change stream doesn't accept the stage ${stage}.`,
  notDocument: 'The filter must be a document { … } or a list of stages [ … ].',
  invalid: (found: string): string => `Invalid filter: ${found}`,
} as const;

/** The line of a change event (`watch.event-summary`). */
export const summaryText = {
  set: (fields: string): string => `set ${fields}`,
  unset: (fields: string): string => `unset ${fields}`,
  truncated: (fields: string): string => `truncated ${fields}`,
  renamed: (to: string): string => `→ ${to}`,
} as const;

/** Pause, Stop, Start, Start from the last change, Clear. */
export const controlText = {
  pause: 'Pause',
  pauseTip: 'Hold the new change events without stopping the stream',
  resume: 'Resume',
  resumeHeld: (count: number): string => `Resume (${groupThousands(count)})`,
  pauseTitle: 'Pause the list',
  resumeTitle: 'Resume the list',
  pauseStep: 'hold the new change events out of the list',
  resumeStep: 'add the held change events to the list',
  stop: 'Stop',
  stopTip: 'Close the change stream',
  start: 'Start',
  startTip: 'Open the change stream (changes made while stopped are not shown)',
  stopTitle: 'Stop the change stream',
  startTitle: 'Start the change stream',
  stopStep: 'close the change stream',
  resumeFromLast: 'Start from the last change',
  resumeFromLastTip: 'Open the change stream right after the last change event received, so that nothing is missed',
  resumeFromLastTitle: 'Start from the last change',
  historyLost:
    'The changes after the last change event are no longer in the oplog: the stream can only start from now.',
  clear: 'Clear',
  clearTip: 'Remove the change events from the list',
  clearTitle: 'Clear the list',
  clearStep: 'remove the change events from the list',
  nothingWritten: 'Cannot be undone: nothing is written.',
} as const;

/** Recording pre-images (`watch.enable-pre-images`). */
export const preImagesText = {
  enable: 'Enable…',
  enableTip: 'Record the document before each change (collMod)',
  title: (namespace: string): string => `Record pre-images of ${namespace}?`,
  line: 'Enables changeStreamPreAndPostImages on the collection (collMod): from now on, the document before each update, replace and delete is stored, so it can be shown here. It uses storage, and is a change to the collection options.',
  button: 'Enable',
  readOnly: (name: string): string => `The connection ${name} is read-only: the collection options can't be changed.`,
  cannotUndo:
    'Cannot be undone: it changes the options of the collection, not its documents. The same command with enabled: false turns it off again.',
  failed: (message: string): string => `Pre-images not enabled: ${message}`,
} as const;

/** Copying change events (`watch.copy-events`). */
export const copyText = {
  copyEvent: 'Copy event',
  copyShown: 'Copy the events shown',
  titleOne: 'Copy the change event',
  titleShown: 'Copy the change events shown',
  copied: 'Copied to the clipboard',
} as const;

/** Exporting change events (`watch.export`). */
export const exportText = {
  export: 'Export…',
  title: 'Export the change events',
  which: 'Change events',
  button: 'Export',
  shown: (count: number): string => `The ${groupThousands(count)} shown`,
  all: (count: number): string => `All ${groupThousands(count)}`,
  nothing: 'There is no change event to export.',
  cannotUndo: 'Cannot be undone: it writes a file, which the user can delete.',
  done: (count: number, path: string): string => `Exported ${changeEvents(count)} to ${path}`,
  showInFolder: 'Show in folder',
} as const;

/** A change event in the inspector (`watch.event-detail`). */
export const detailText = {
  nothingSelected: 'Select a change event to see what it changed.',
  openDocument: 'Open document',
  openDocumentTip: 'Open the current version of the document in a document tab',
  changes: 'Changes',
  changesNoBefore: 'Changes (the values before are not recorded)',
  columns: { field: 'field', before: 'before', after: 'after', value: 'value' },
  removed: '(removed)',
  missing: '—',
  noChange: 'No field changed.',
  inserted: 'Inserted document',
  newDocument: 'New document',
  deleted: 'Deleted document',
  notRecorded: 'Not recorded: the collection does not store pre-images.',
  current: 'Current document',
  currentNotRead: 'Current document (not read: enable "Current document on update", or the document was deleted)',
  event: 'Change event',
} as const;

/** What `watch.event-diff` notes on a truncated array. */
export function truncatedNote(size: number): string {
  return `truncated to ${groupThousands(size)} ${size === 1 ? 'element' : 'elements'}`;
}
