/**
 * The text of the interface of the playground area, word for word as its cards write it (R10.1).
 */
import { groupThousands } from '../../shared/text-units';

function counted(count: number, one: string, many: string): string {
  return `${groupThousands(count)} ${count === 1 ? one : many}`;
}

const whatItDoes =
  'A playground runs what its script says. Dropping a collection or a database is confirmed first; every other write runs as written. Nothing a playground does is recorded in the undo history.';

/** The text of the playground area. */
export const text = {
  show: {
    runAll: 'Run all',
    runAllTooltip: 'Run the script (Ctrl+Enter). Drops are confirmed first; nothing is recorded in the undo history.',
    stop: 'Stop',
    targetTooltip: 'Connection and default database of this playground',
    open: 'Open…',
    save: 'Save',
    run: 'Run',
    runStatement: (line: number): string => `Run the statement at line ${String(line)}`,
    toolbar: 'Playground',
    editor: 'Script',
    runButtons: 'Statements',
    results: 'Results',
    resultsToolbar: 'Results',
    split: 'Resize the script and the results',
    failedLine: (line: number): string => `The run failed at line ${String(line)}`,
  },
  results: {
    beforeFirstRun: 'Run a playground with Ctrl+Enter.',
    whatItDoes,
    readOnly: 'The connection is read-only: the script can read, and every write it makes is refused.',
    running: (title: string, connection: string, database: string): string =>
      `Running ${title} on ${connection} › ${database}…`,
    summary: (title: string, connection: string, database: string, durationMs: number): string =>
      `${title} · ${connection} › ${database} · ${String(durationMs)} ms`,
    documents: (count: number): string => counted(count, 'document', 'documents'),
    firstDocuments: (count: number): string =>
      `${counted(count, 'document', 'documents')} (first ${String(count)}; add .limit() or .toArray() for others)`,
    showing: (shown: number, count: number): string => `Showing ${String(shown)} of ${String(count)} documents.`,
    noValue: 'The script ran; its last statement has no value.',
    noDocuments: 'No documents.',
    output: 'Output',
    line: (line: number): string => `line ${String(line)}`,
    showLine: 'Show the line in the playground',
    table: 'Table',
    json: 'JSON',
    copy: 'Copy',
    copyJson: 'Copy as JSON',
    copied: 'Copied to the clipboard',
    cancelled: 'Cancelled. Operations already sent may still complete on the server.',
    outOfMemory: "The playground's process ended before the script did: it may have run out of memory.",
  },
  open: {
    title: 'New playground',
    step: (title: string): string => `open the playground ${title}`,
    noConnection: 'Add a MongoDB connection first.',
    cannotUndo: 'Cannot be undone, and needs none: the tab is closed.',
    firstComment:
      '// Datardo playground: Ctrl+Enter runs the script (or the selected lines) on the connection shown above.',
    secondComment:
      '// mongosh syntax; the value of the last expression is shown below, print() and printjson() write to the output.',
  },
  openFile: {
    title: 'Open playground…',
    dialog: 'Open playground',
    filter: 'Playgrounds',
    allFiles: 'All files',
    step: (path: string): string => `open the playground ${path}`,
    noFile: (path: string): string => `The file ${path} doesn't exist.`,
    tooLarge: (file: string): string => `${file} is too large to open as a playground (over 5 MB).`,
    notText: (file: string): string => `${file} is not a text file.`,
    openFailed: (file: string, error: string): string => `Could not open ${file}: ${error}`,
    cannotUndo: 'Cannot be undone, and needs none: the tab is closed.',
  },
  save: {
    title: 'Save playground',
    titleAs: 'Save playground as…',
    dialog: 'Save playground',
    filter: 'Playgrounds',
    remember: (path: string): string => `remember the connection and the database of ${path}`,
    failed: (file: string, error: string): string => `Could not save ${file}: ${error}`,
    cannotUndo: 'Cannot be undone from the undo history, which holds writes to documents and keys.',
  },
  target: {
    title: 'Change playground connection…',
    connection: 'Playground connection',
    connectionLine: 'Connection the playground runs on',
    database: (connection: string): string => `Default database on ${connection}`,
    databaseLine: 'Used until the script calls use("…")',
    otherDatabase: 'Other database…',
    defaultDatabase: 'Default database',
    databaseName: 'Database name',
    required: 'Required',
    choose: 'Choose',
    current: 'current',
    connected: 'connected',
    readOnly: 'read-only',
    step: (title: string, connection: string, database: string): string =>
      `set the playground ${title} to ${connection} › ${database}`,
    notConnected: (connection: string, error: string): string => `Could not connect to ${connection}: ${error}`,
    cannotUndo: 'Cannot be undone, and needs none: it is chosen again.',
  },
  run: {
    title: 'Run playground',
    selection: 'Run selection',
    statement: 'Run statement',
    lines: (title: string, first: number, last: number): string =>
      first === last ? `${title} (line ${String(first)})` : `${title} (lines ${String(first)}–${String(last)})`,
    step: (title: string, connection: string, database: string): string =>
      `run ${title} on ${connection} › ${database}`,
    noPlayground: 'Open a playground to run it: New playground creates one.',
    running: 'A playground is already running.',
    notConnected: (connection: string, error: string): string => `Could not connect to ${connection}: ${error}`,
    cannotUndo: 'Cannot be undone: the writes of a playground are not recorded in the undo history.',
    work: (title: string): string => `Running ${title}…`,
    logStart: (title: string, connection: string, database: string): string =>
      `▶ ${title} on ${connection} › ${database}`,
    logFailed: (message: string, line: number | undefined): string =>
      line === undefined ? `✖ ${message}` : `✖ ${message} (line ${String(line)})`,
    syntaxError: (message: string): string => `SyntaxError: ${message}`,
  },
  stop: {
    title: 'Stop playground',
    step: (title: string): string => `stop the run of ${title}`,
    cannotUndo: 'Cannot be undone: the writes the script had already made stay, and are not in the undo history.',
  },
  writes: {
    readOnly: (method: string): string => `${method}() is not allowed: the connection is read-only.`,
    pipeline: (stage: string): string => `A pipeline with ${stage} is not allowed: the connection is read-only.`,
    command: (name: string): string => `The command ${name} is not allowed: the connection is read-only.`,
    dropCollection: (namespace: string): string => `Drop collection ${namespace}`,
    dropView: (namespace: string): string => `Drop view ${namespace}`,
    dropDatabase: (database: string): string => `Drop database ${database}`,
    dropsAt: (title: string, line: number): string => `The script of ${title} drops it at line ${String(line)}.`,
    deletesDocuments: (documents: number, indexes: number): string =>
      `Deletes ${counted(documents, 'document', 'documents')} and ${counted(indexes, 'index', 'indexes')}. This cannot be undone.`,
    deletesCollections: (collections: number): string =>
      `Deletes ${counted(collections, 'collection', 'collections')} with all their documents. This cannot be undone.`,
    viewNotAffected: 'The documents of its source collection are not affected. This cannot be undone.',
    cannotUndo: 'This cannot be undone.',
    typeToConfirm: (name: string): string => `Type ${name} to confirm`,
    drop: 'Drop',
    cancelledCollection: (namespace: string): string => `Dropping ${namespace} was cancelled.`,
    cancelledDatabase: (database: string): string => `Dropping the database ${database} was cancelled.`,
    confirmed: (step: string): string => `${step}: confirmed`,
    cancelled: (step: string): string => `${step}: cancelled`,
  },
  sessions: {
    transactionsAborted: (count: number, why: string): string =>
      count === 1
        ? `Note: The transaction still open was aborted ${why}: nothing of it was committed (session.commitTransaction() commits).`
        : `Note: The ${String(count)} transactions still open were aborted ${why}: nothing of them was committed (session.commitTransaction() commits).`,
    atTheEnd: 'at the end of the script',
    afterTheError: 'after the error',
    becauseCancelled: 'because the run was cancelled',
    sessionsEnded: (count: number): string =>
      count === 1 ? 'Note: a session left open was ended.' : `Note: ${String(count)} sessions left open were ended.`,
    cancelled: 'The run was cancelled.',
    databaseName: 'getDatabase(): the database name is a string',
    callback: 'withTransaction(): the first argument is a function',
    replicaSet: ' — transactions need a replica set or a sharded cluster (a single-node replica set is enough).',
  },
  runtime: {
    switched: (database: string): string => `switched to db ${database}`,
    useName: 'use(): the database name is a string',
    notOnCursor: (method: string): string => `cursor.${method}() is not available on this cursor`,
    cursor: '[cursor]',
    mongo: '[Mongo]',
    functionNamed: (name: string): string => `[Function ${name === '' ? 'anonymous' : name}]`,
  },
  commands: {
    open: 'New playground',
    openFile: 'Open playground…',
    save: 'Save playground',
    saveAs: 'Save playground as…',
    target: 'Change playground connection…',
    runAll: 'Run playground',
    runSelection: 'Run selection',
    runStatement: 'Run statement',
    stop: 'Stop playground',
  },
} as const;
