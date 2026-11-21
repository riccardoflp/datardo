/**
 * The text of the interface of the nav area, word for word as its cards write it (R10.1).
 */

/** The names of the pages of the app, as the scope bar and the rail write them. */
export const pageTitles: Readonly<Record<string, string>> = {
  home: 'Home',
  settings: 'Settings',
  log: 'Log',
  undo: 'Undo history',
  tasks: 'Scheduled tasks',
};

/** The name of a page of the app: its title, or its name when it has none yet. */
export function pageTitle(page: string): string {
  return pageTitles[page] ?? page.charAt(0).toUpperCase() + page.slice(1);
}

/** The text of the nav area. */
export const text = {
  rail: {
    label: 'Rail',
    home: 'Home',
    explorer: 'Explorer',
    search: 'Search',
    undo: 'Undo history',
    tasks: 'Scheduled tasks',
    settings: 'Settings',
    searchNeedsConnection: 'Choose a connection first.',
  },
  islands: {
    explorer: 'Explorer',
    connectionIsland: 'Connection',
    treeIsland: 'Tree',
    mainIsland: 'Main',
    inspector: 'Inspector',
    statusLine: 'Status line',
    resizeExplorer: 'Resize explorer',
    resizeInspector: 'Resize inspector',
  },
  connection: {
    noConnectionsYet: 'No connections yet',
    addConnection: 'Add connection',
    chooseConnection: 'Choose a connection',
    notConnected: 'Not connected',
    connecting: 'Connecting…',
    reconnecting: 'Reconnecting…',
    failed: 'Failed',
    connect: 'Connect',
    cancel: 'Cancel',
    retry: 'Retry',
    reconnect: 'Reconnect',
    edit: 'Edit',
    readOnly: 'Read-only',
    menu: 'Connection menu',
    switcher: 'Switch connection',
  },
  engines: { mongodb: 'MongoDB', redis: 'Redis' },
  states: {
    'not-connected': 'not connected',
    connecting: 'connecting…',
    connected: 'connected',
    reconnecting: 'reconnecting…',
    failed: 'failed',
  },
  linked: {
    receives: (mongo: string) => `Receives the writes of ${mongo} for redis-oplog.`,
    publishes: (redis: string) => `Publishes its writes to ${redis}.`,
    more: (count: number) => `and ${String(count)} more`,
  },
  switcher: {
    filter: 'Filter connections',
    none: 'No connections yet.',
    noMatch: (typed: string) => `No connection matches "${typed}".`,
    question: 'Switch connection',
    button: 'Switch',
    which: 'Connection',
  },
  tree: {
    pinned: 'Pinned',
    noConnectionSaved: 'Your databases and keys will be listed here.',
    noConnectionCurrent: 'Choose a connection to see what it holds.',
    gone: 'No longer exists.',
  },
  scopeBar: {
    label: 'Scope bar',
    back: 'Back',
    forward: 'Forward',
    copyPath: 'Copy path',
    pin: 'Pin',
    unpin: 'Unpin',
    openOnAnother: 'Open on another connection',
    path: 'Path',
    hidden: 'Hidden segments',
  },
  pin: {
    tooMany: (connection: string, limit: number) =>
      `${connection} already has ${String(limit)} pinned items. Unpin one first.`,
    moveUp: 'Move up',
    moveDown: 'Move down',
  },
  copyPath: { copied: (text: string) => `Copied ${text}` },
  another: {
    question: 'Open on which connection?',
    button: 'Open',
    noOther: (engine: string) => `No other ${engine} connection.`,
    noDatabase: (connection: string, database: string) => `${connection} has no database ${database}.`,
    noCollection: (connection: string, collection: string, database: string) =>
      `${connection} has no collection ${collection} in ${database}.`,
    noKey: (connection: string, key: string, database: string) => `${connection} has no key ${key} in ${database}.`,
  },
  inspector: {
    hide: 'Hide inspector',
    nothingSelected: 'Nothing selected',
    selected: (count: number) => `${String(count)} selected`,
    retry: 'Retry',
    loading: 'Loading',
  },
  statusLine: {
    noConnection: 'No connection',
    running: (count: number) => `${String(count)} running`,
    tasksRunning: (count: number) => `${String(count)} ${count === 1 ? 'task' : 'tasks'} running`,
    cancel: 'Cancel',
    readOnlyTip: (connection: string) => `Datardo sends no writes through ${connection}.`,
    zoomReset: 'Reset zoom',
  },
  ping: { noAnswer: 'no answer' },
  commands: {
    toggleExplorer: 'Show or hide the explorer',
    showExplorer: 'Show explorer',
    hideExplorer: 'Hide explorer',
    toggleInspector: 'Show or hide the inspector island',
    showInspector: 'Show inspector',
    hideInspector: 'Hide inspector',
    resetWidths: 'Reset island widths',
    focusNext: 'Focus next island',
    focusPrevious: 'Focus previous island',
    back: 'Back',
    forward: 'Forward',
    switchConnection: 'Switch connection…',
    pin: 'Pin',
    copyPath: 'Copy path',
    openOnAnother: 'Open on another connection…',
  },
} as const;
