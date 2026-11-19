/**
 * The text of the interface of the scheduled tasks area, word for word as the cards write it (R10.1).
 */
import { groupThousands } from '../../shared/text-units';

/** `1 task`, `3 tasks`, with the thousands grouped. */
export function counted(count: number, singular: string, plural = `${singular}s`): string {
  return `${groupThousands(count)} ${count === 1 ? singular : plural}`;
}

/** What `task.next-runs` says of a schedule. */
export const scheduleText = {
  invalidTime: 'Invalid time',
  noDays: 'No days chosen',
  weekdays: 'Weekdays',
  everyDay: 'Every day',
  daily: (time: string): string => `Daily at ${time}`,
  weekly: (days: string, time: string): string => `${days} at ${time}`,
  hourly: (minutes: string): string => `Every hour at :${minutes}`,
  everyHours: (every: number, times: string): string => `Every ${String(every)} hours (${times})`,
  today: (time: string): string => `today ${time}`,
  tomorrow: (time: string): string => `tomorrow ${time}`,
  yesterday: (time: string): string => `yesterday ${time}`,
  weekdayNames: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  monthNames: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
} as const;

/** The placeholders of a file name pattern, as the form lists them. */
export const placeholderList =
  '{name} {connection} {database} {collection} {date} {time} {YYYY} {MM} {DD} {HH} {mm} {ss} {weekday}';

/** What `task.file-names` refuses. */
export const fileNameText = {
  empty: 'Enter a file name',
  separator: 'The file name cannot contain / or \\: choose the folder instead',
  unknown: (placeholder: string): string => `Unknown placeholder {${placeholder}}: use ${placeholderList}`,
  noDate: 'Include the date or time, e.g. {date}_{time}, so the runs write different files',
  fallback: 'output',
} as const;

/** The labels of the formats, as the form and the page show them. */
export const formatLabels = {
  archive: 'Archive (.agz)',
  gzip: 'Folder, compressed (gzip)',
  plain: 'Folder, uncompressed',
  json: 'JSON',
  jsonl: 'JSON Lines',
  csv: 'CSV',
} as const;

/** The form of a task (`task.edit`). */
export const formText = {
  newTitle: 'New scheduled task',
  editTitle: (name: string): string => `Edit ${name}`,
  create: 'Create task',
  save: 'Save',
  cancel: 'Cancel',
  backUp: (what: string): string => `Back up ${what}`,
  export: (what: string): string => `Export ${what}`,
  noSource: 'Backup',
  backup: 'Backup',
  exportKind: 'Export',
  backupHint: 'In the mongodump formats, as Back up… writes them: restore with Restore from backup… or mongorestore.',
  exportHint: 'The documents of a collection, as Export collection… writes them.',
  databasePlaceholder: 'empty: all databases',
  collectionPlaceholder: 'empty: all collections of the database',
  filterPlaceholder: '{ status: "active" }, empty: all documents',
  projectionPlaceholder: '{ name: 1, email: 1 }, empty: all fields',
  csvHint: 'CSV has the columns of the collection’s tab, as laid out there.',
  browse: 'Browse…',
  folderDialogTitle: 'Folder of the scheduled task',
  folderDialogButton: 'Choose folder',
  example: (name: string): string => `e.g. ${name}`,
  placeholders: `Placeholders: ${placeholderList}. A number is added if the name exists.`,
  everyFewHours: 'Every few hours',
  daily: 'Daily',
  weekly: 'Weekly',
  preview: (schedule: string, next: string): string => `${schedule}. Next: ${next}`,
  localTime: 'Local time. Tasks run while Datardo is open.',
  keepFiles: (count: number): string => `the last ${counted(count, 'file')}`,
  keepFolders: (count: number): string => `the last ${counted(count, 'folder')}`,
  keepHint:
    'Older ones written by this task are deleted after each successful run; nothing else in the folder is touched. 0 keeps them all.',
  runMissed: 'Run a missed run when Datardo starts',
  runMissedTooltip:
    'If Datardo was closed (or the computer asleep) at the time of a run, it runs once when it is open again',
  notifySuccess: 'Notify after successful runs too',
  notifySuccessTooltip: 'Failed and skipped runs always notify',
  enabled: 'Enabled',
} as const;

/** What is wrong with a field of the form (`task.edit`). */
export const problemText = {
  name: 'Enter a name',
  connection: 'Choose a connection',
  databaseOfCollection: 'Enter the database of the collection',
  database: 'Enter the database',
  collection: 'An export is of one collection: enter it',
  exportFormat: 'Choose JSON, JSON Lines or CSV',
  backupFormat: 'Choose a backup format',
  notObject: (label: string): string => `${label} must be an object, e.g. { status: "active" }`,
  parseError: (label: string, error: string): string => `${label}: ${error}`,
  filter: 'Filter',
  projection: 'Projection',
  folder: 'Choose the folder',
  time: 'Enter a time as HH:MM, e.g. 02:30',
  days: 'Choose at least one day',
  every: 'Every 1, 2, 3, 4, 6, 8, 12 hours',
  keep: 'Enter how many to keep (0: all)',
} as const;

/** The steps, titles and messages of the plans of the area. */
export const planText = {
  save: (name: string): string => `save the scheduled task "${name}"`,
  saved: (name: string, schedule: string, next: string): string => `Saved "${name}" (${schedule}). Next run: ${next}.`,
  savedDisabled: (name: string, schedule: string): string => `Saved "${name}" (${schedule}). It is disabled.`,
  cannotUndoEdit: 'A scheduled task is not in the undo history: edit it again.',
  saveFailed: (error: string): string => `Could not save the task: ${error}`,
  runTitle: (name: string): string => `Run the scheduled task "${name}"`,
  startRun: (name: string): string => `start the run of "${name}"`,
  write: (path: string): string => `write ${path}`,
  recordRun: (name: string): string => `record the run of "${name}"`,
  delete: (path: string): string => `delete ${path}`,
  forgetOutputs: (name: string): string => `save the outputs of "${name}" without those deleted`,
  cannotUndoRun: 'A run writes files, not a deployment; its outputs are kept or deleted by retention.',
  alreadyRunning: (name: string): string => `"${name}" is already running.`,
  noFolder: (folder: string): string => `The folder ${folder} doesn't exist (is the drive connected?)`,
  nothingTimeSeries: "Nothing to back up: time series collections aren't supported (use mongodump).",
  nothingAtAll: 'Nothing to back up: there are no collections.',
  noCollection: (database: string, collection: string): string =>
    `The collection ${database}.${collection} doesn't exist.`,
  exportNeedsCollection: 'An export needs a database and a collection.',
  connectionRemoved: 'The connection was removed',
  connectionUnavailable: (error: string): string => `Connection unavailable: ${error}`,
  timeSeriesLeftOut: (names: string): string => `Time series collections left out (use mongodump): ${names}`,
  skippedMeanwhile: (time: string): string => `The run due at ${time} was skipped: this one was still going`,
  interrupted: 'Interrupted: Datardo was closed during the run',
  couldNotDelete: (path: string, error: string): string => `Could not delete ${path}: ${error}`,
  retentionTitle: (name: string): string => `Delete the older outputs of "${name}"`,
  cannotUndoRetention: 'The files are deleted, not moved to the recycle bin.',
  missedTitle: (name: string): string => `Record the missed run of "${name}"`,
  recordMissed: (name: string): string => `record the missed run of "${name}"`,
  missed: "Datardo wasn't running (or the computer was asleep) at that time",
  cannotUndoMissed: 'It records a run in the log.',
  cancelTitle: (name: string): string => `Cancel the run of "${name}"`,
  cancelRun: (name: string): string => `cancel the run of "${name}"`,
  cancelled: 'Cancelled: the incomplete output was deleted',
  cannotUndoCancel: 'Run the task again with Run now.',
  deleteQuestion: (name: string): string => `Delete the scheduled task "${name}"?`,
  deleteText: 'Its run log is deleted too. The backups and exports it wrote stay where they are.',
  deleteButton: 'Delete',
  deleteTask: (name: string): string => `delete the scheduled task "${name}" and its run log`,
  cannotUndoDelete: 'The run log of the task is deleted.',
  enable: (name: string): string => `enable the scheduled task "${name}"`,
  disable: (name: string): string => `disable the scheduled task "${name}"`,
  enableTitle: (name: string): string => `Enable the scheduled task "${name}"`,
  disableTitle: (name: string): string => `Disable the scheduled task "${name}"`,
  cannotUndoEnable: 'Click the switch again.',
} as const;

/** The Scheduled tasks page (`task.show`). */
export const pageText = {
  title: 'Scheduled tasks',
  summary: (tasks: number, enabled: number): string => `${counted(tasks, 'task')}, ${groupThousands(enabled)} enabled`,
  newTask: 'New task…',
  empty:
    'No scheduled tasks yet. New task… (or Schedule… on a connection, a database or a collection) backs up or exports periodically.',
  trayNote: 'Tasks run while Datardo is open.',
  trayLink: 'Keep running in the tray',
  kind: (kind: string, format: string): string => `${kind}, ${format}`,
  allDatabases: 'all databases',
  allCollections: (database: string): string => `${database} (all collections)`,
  removedConnection: 'The connection was removed',
  noNextRun: '—',
  never: 'never',
  running: 'running',
  starting: 'starting…',
  runNow: 'Run now',
  runNowTooltip: 'Run it once now (the schedule stays as it is)',
  cancel: 'Cancel',
  cancelTooltip: 'Stop the run: what it wrote so far is deleted',
  edit: 'Edit',
  delete: 'Delete',
  deleteTooltip: 'Delete the task (the files it wrote stay)',
  enabledTooltip: 'Enabled: click to disable',
  disabledTooltip: 'Disabled: click to enable',
  writes: (format: string, folder: string, pattern: string): string =>
    `Writes: ${format} in ${folder}, named ${pattern}`,
  query: (parts: string): string => `Query: ${parts}`,
  filter: (filter: string): string => `filter ${filter}`,
  projection: (projection: string): string => `projection ${projection}`,
  keepsFiles: (count: number): string => `Keeps: the last ${counted(count, 'file')} it wrote`,
  keepsFolders: (count: number): string => `Keeps: the last ${counted(count, 'folder')} it wrote`,
  keepsAll: 'Keeps: everything it writes',
  missedRuns: 'Missed runs: run when Datardo starts',
  noRuns: 'No runs yet.',
  oldOutputs: (count: number): string => `${counted(count, 'old output')} deleted`,
  deletedByRetention: 'Deleted by retention',
  tasksRunning: (count: number): string => `${counted(count, 'task')} running`,
  statuses: { done: 'done', failed: 'failed', skipped: 'skipped', cancelled: 'cancelled', missed: 'missed' },
  triggers: { schedule: 'scheduled', manual: 'Run now', missed: 'missed, run late' },
} as const;

/** The notifications of runs (`task.notify`). */
export const notifyText = {
  failed: (name: string, error: string): string => `Scheduled task "${name}" failed: ${error}`,
  skipped: (name: string, error: string): string => `Scheduled task "${name}" was skipped: ${error}`,
  done: (name: string, what: string, seconds: string, file: string): string =>
    `Scheduled task "${name}" done (${what}) in ${seconds} s: ${file}`,
  show: 'Show scheduled tasks',
  reveal: 'Reveal',
} as const;
