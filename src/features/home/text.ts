/**
 * The text of the interface of the Home page, word for word as its cards write it (R10.1).
 */

/** The text of Home. */
export const text = {
  title: 'Home',
  welcome: {
    title: 'Welcome to Datardo',
    line: 'A client for MongoDB and Redis. Add a connection to begin.',
  },
  addConnection: 'Add connection',
  importConnections: 'Import connections…',
  exportConnections: 'Export connections…',
  more: 'More',
  filter: {
    placeholder: 'Filter connections',
    label: 'Filter connections',
    engines: 'Engines',
    engine: { all: 'All', mongodb: 'MongoDB', redis: 'Redis' },
    count: (engine: string, count: number) => `${engine} ${String(count)}`,
    noMatch: (typed: string) => `No connection matches "${typed}".`,
    clear: 'Clear filter',
  },
  jumpBackIn: {
    heading: 'Jump back in',
    clear: 'Clear',
    remove: 'Remove from Jump back in',
    menu: (title: string) => `Menu of ${title}`,
  },
  connections: {
    heading: 'Connections',
    folder: (name: string, count: number) => `${name} ${String(count)}`,
    folderMenu: (name: string) => `Menu of the folder ${name}`,
  },
  card: {
    engines: { mongodb: 'MongoDB', redis: 'Redis' },
    version: (engine: string, version: string) => `${engine} ${version}`,
    marks: { readOnly: 'Read-only', ssh: 'SSH', oplog: 'redis-oplog' },
    states: {
      connecting: 'Connecting…',
      connected: 'Connected',
      reconnecting: 'Reconnecting…',
      failed: 'Failed',
    },
    connect: 'Connect',
    cancel: 'Cancel',
    goTo: 'Go to',
    menu: (name: string) => `Menu of ${name}`,
  },
  plans: {
    show: 'Home',
    forget: 'Remove from Jump back in',
    clear: 'Clear Jump back in',
    engine: 'Filter connections by engine',
    collapse: (folder: string) => `Collapse ${folder}`,
    expand: (folder: string) => `Expand ${folder}`,
  },
  steps: {
    forget: (name: string) => `forget ${name} as a recent place`,
    forgetAll: 'forget every recent place',
    engine: (engine: string) => `show the connections of ${engine} on Home`,
    collapse: (folder: string) => `collapse the folder ${folder} on Home`,
    expand: (folder: string) => `expand the folder ${folder} on Home`,
  },
  commands: {
    show: 'Home',
  },
} as const;
