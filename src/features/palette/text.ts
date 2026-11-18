/**
 * The text of the interface of Go to, word for word as its cards write it (R10.1).
 */

/** The text of Go to. */
export const text = {
  field: {
    label: 'Go to',
    placeholder: 'Go to',
    list: 'Results',
  },
  headings: {
    recent: 'Recent',
    keysOf: (connection: string, database: string) => `Keys of ${connection} · ${database}`,
  },
  /** The line that names the prefixes, each with its source. */
  prefixes: [
    { prefix: '>', source: 'commands' },
    { prefix: '@', source: 'connections' },
    { prefix: '#', source: 'collections' },
    { prefix: ':', source: 'keys' },
    { prefix: '/', source: 'pages' },
    { prefix: '?', source: 'saved queries' },
    { prefix: '=', source: 'open tabs' },
  ],
  firstUse: 'Type to find a collection, a key, a page, a connection, a saved query or a command.',
  nothingMatches: (typed: string) => `Nothing matches "${typed}".`,
  typeKeyName: "Type part of a key's name.",
  tooManyCollections: (connection: string) =>
    `${connection} has more than 10,000 collections. Use the tree to reach the others.`,
  keys: {
    looking: 'Looking for keys…',
    none: (database: string, typed: string) => `No key of ${database} holds "${typed}".`,
    stopped: (count: string, database: string) => `Looked at about ${count} keys of ${database}.`,
    scanAll: 'Scan all in Keys',
    failed: (error: string) => `Keys could not be read: ${error}`,
  },
  kinds: {
    tab: 'tab',
    collection: 'collection',
    view: 'view',
    bucket: 'GridFS bucket',
    key: 'key',
    page: 'page',
    connection: 'connection',
    savedQuery: 'saved query',
    command: 'command',
  },
  opened: 'opened',
  /** What a screen reader is told of the list. */
  results: (count: number) => `${String(count)} ${count === 1 ? 'result' : 'results'}`,
  appContext: 'Datardo',
  commands: {
    open: 'Go to…',
    openCommands: 'Show all commands',
    openTabs: 'Show open tabs',
  },
  plans: {
    open: 'Go to',
    runCommand: (title: string) => title,
    openResult: 'Open',
    rememberPlace: 'Remember a recent place',
  },
  steps: {
    openGoTo: 'open Go to',
    runCommand: (title: string) => `run the command ${title}`,
  },
  /** The pages of the app Go to finds, and the pages of a connection, as **Pages of** lists them (`tree.pages`). */
  pages: {
    home: 'Home',
    settings: 'Settings',
    undo: 'Undo history',
    tasks: 'Scheduled tasks',
    log: 'Log',
    overview: 'Overview',
    monitor: 'Monitor',
    users: 'Users and roles',
    advisor: 'Index advisor',
    search: 'Search documents',
    watch: 'Watch changes',
    playground: 'Playground',
    server: 'Server',
    console: 'Console',
    pubsub: 'Pub/Sub',
  },
  engines: { mongodb: 'MongoDB', redis: 'Redis' },
} as const;
