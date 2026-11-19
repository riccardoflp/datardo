/**
 * The text of the interface of the console area, word for word as its cards write it (R10.1).
 */
import { groupThousands } from '../../shared/text-units';

function keysText(count: number): string {
  return `${groupThousands(count)} ${count === 1 ? 'key' : 'keys'}`;
}

/** The text of the console area. */
export const text = {
  parseLine: {
    unclosed: (column: number): string => `The quote opened at column ${String(column)} is never closed.`,
    closingQuote: (column: number): string =>
      `The closing quote at column ${String(column)} must be followed by a space.`,
  },
  classify: {
    subscribe: (name: string): string =>
      `${name} would turn the console's connection into a subscriber, which runs no other command. Follow channels in the Pub/Sub page.`,
    openPubSub: 'Open Pub/Sub',
    monitor:
      'MONITOR sends every command the server runs, without end, and slows the server down. The console does not run it.',
    replicationStream: (name: string): string => `${name} starts a replication stream, which the console cannot read.`,
    connectionState: (title: string): string =>
      `${title} changes how the console's connection reads replies, so the console does not send it. Close the tab and open the console again to start afresh.`,
    readOnly: (connection: string, doing: string): string =>
      `The connection ${connection} is read-only. ${doing}, so the console did not send it.`,
    useToRead: (command: string): string => ` Use ${command} to read.`,
    writes: (title: string): string => `${title} writes`,
    mayWrite: (title: string): string => `${title} may write`,
    sendsMessage: (title: string): string => `${title} sends a message to other clients`,
    changesServer: (title: string): string => `${title} changes the server`,
    unknownCommand: (connection: string, title: string): string =>
      `The connection ${connection} is read-only, and Datardo cannot tell whether ${title} writes. The console did not send it.`,
    blocksForever: (name: string, example: string): string =>
      `${name} with the timeout 0 waits until another client pushes, however long, and holds the console's connection. Give it a timeout, for example ${example}.`,
  },
  confirm: {
    title: (command: string, connection: string): string => `Run ${command} on ${connection}?`,
    button: (command: string): string => `Run ${command}`,
    cannotUndo: 'This cannot be undone: commands run in the console are not recorded in the undo history.',
    flushAll: 'FLUSHALL deletes every key of every database of this server, for every client.',
    flushDb: (database: number): string => `FLUSHDB deletes every key of db${String(database)}, for every client.`,
    shutdown: 'The server stops and every client is disconnected. Datardo cannot start it again.',
    noSave: 'What changed since the last save is lost.',
    replicaOf: (address: string): string => `The server deletes its own keys and copies those of ${address}.`,
    functionFlush: 'FUNCTION FLUSH deletes every library of functions of this server.',
    debugStops: 'This command stops or restarts the server.',
    debug: 'DEBUG commands are made for developing Redis: some block the server or change its data.',
    swapDb: (first: string, second: string): string =>
      `Every client connected to db${first} sees the keys of db${second} at once, and the other way round.`,
    replicaOfNoOne: 'The server stops copying its master and accepts writes.',
    failover: 'A replica takes the place of this master; its clients must follow.',
    configSet:
      'The change applies at once, for every client. It is lost when the server restarts, unless CONFIG REWRITE saves it.',
    configRewrite: 'The server writes its current configuration over its configuration file.',
    configResetStat: 'The counters of INFO, the latency data and the statistics of the commands start again from zero.',
    scriptFlush:
      'Every cached script is removed: clients that call EVALSHA get NOSCRIPT until they load their scripts again.',
    functionDelete: 'Libraries of functions are deleted or replaced, for every client.',
    acl: 'This changes who may connect and what they may run. The user of this connection can lock itself out.',
    module: 'This loads code into the server, or removes it.',
    clientKill: 'The connections of other clients are closed.',
    clientPause: 'The server stops serving its clients for the time given.',
    migrate: 'The keys are deleted from this server once the other one has them.',
    save: 'The server serves no client until the whole dataset is written to disk.',
    keys: (database: number): string =>
      `KEYS reads every key of db${String(database)} in one command, and the server serves no other client meanwhile. The keys tab lists the same keys a page at a time.`,
    databaseKeys: keysText,
    serverKeys: (keys: number, databases: number): string =>
      `${keysText(keys)} in ${groupThousands(databases)} ${databases === 1 ? 'database' : 'databases'}`,
  },
  run: {
    busy: (name: string): string => `Wait for ${name} to answer, or stop it.`,
    tooManyLines: 'The console runs up to 500 lines at a time. To load many keys, use Import in the keys tab.',
    notConnected: (connection: string): string => `${connection} is not connected.`,
    closedBeforeReply: 'The connection closed before the reply arrived. The server may have run the command.',
  },
  session: {
    prompt: (database: number): string => `db${String(database)}>`,
    queued: (database: number, count: number): string => `db${String(database)} (MULTI, ${String(count)} queued)>`,
    rejected: (database: number): string => `db${String(database)} (MULTI, rejected)>`,
    watchedKeyChanged: 'The transaction did not run: a watched key changed.',
    connectedAgain: (database: number): string => `Connected again on db${String(database)}.`,
    transactionDiscarded: "The transaction was discarded: the console's connection closed.",
    closed: "The console's connection closed.",
  },
  connect: {
    title: (connection: string): string => `Open the console of ${connection}`,
    open: (hosts: string): string => `open a connection to ${hosts} for the console`,
    nothingWritten: 'Nothing is written. Closing the tab closes the connection.',
  },
  show: {
    title: 'Console',
    database: 'Database',
    clearOutput: 'Clear output',
    notice: 'Commands run here are not recorded in the undo history.',
    readOnlyNotice: 'This connection is read-only: commands that write are refused.',
    empty: 'Type a Redis command and press Enter. Up and Down go through the commands you ran before.',
    connecting: 'Connecting…',
    readOnly: 'Read-only',
    status: (database: number, protocol: number, took: string | undefined): string =>
      [`db${String(database)}`, `RESP${String(protocol)}`, ...(took === undefined ? [] : [took])].join(' · '),
  },
  input: {
    label: 'Command',
    placeholder: 'Type a command, for example GET orders:42',
    run: 'Run',
    stop: 'Stop',
  },
  output: {
    label: 'Output',
    copyReply: 'Copy reply',
    copyValue: 'Copy value',
    copyCommand: 'Copy command',
    runAgain: 'Run again',
    showMore: (count: number): string => `Show ${groupThousands(count)} more`,
    shownOf: (shown: number, total: number): string => `${groupThousands(shown)} of ${groupThousands(total)}`,
    showAll: 'Show all',
    cutAt: (kept: string, total: string): string => `Cut at ${kept} of ${total}.`,
    newest: 'Newest',
  },
  copy: {
    reply: (command: string): string => `copy the reply of ${command} to the clipboard`,
    value: (command: string): string => `copy a value of the reply of ${command} to the clipboard`,
    command: (command: string): string => `copy the command ${command} to the clipboard`,
    title: 'Copy',
    copied: 'Copied.',
    cannotUndo: 'It changes only the clipboard.',
  },
  clear: {
    title: 'Clear console output',
    step: (connection: string): string => `clear the output of the console of ${connection}`,
    cannotUndo: 'The replies are not kept anywhere else.',
  },
  clearHistory: {
    title: (connection: string): string => `Clear the console history of ${connection}?`,
    forgotten: (count: number): string =>
      `The ${groupThousands(count)} ${count === 1 ? 'command' : 'commands'} kept for this connection are forgotten.`,
    button: 'Clear history',
    step: (connection: string): string => `clear the console history of ${connection}`,
    cleared: (connection: string): string => `Cleared the console history of ${connection}.`,
    empty: (connection: string): string => `The console history of ${connection} is already empty.`,
    cannotUndo: 'The commands are kept nowhere else.',
  },
  stop: {
    title: 'Stop console command',
    close: (connection: string): string => `close the console's connection to ${connection}`,
    stopped: (took: string): string =>
      `Stopped after ${took}. The console's connection was closed and opened again; the server may still finish the command.`,
    alreadySent: 'Already sent to the server.',
    nothingToPutBack: 'There is nothing to put back. What the command had already written stays written.',
  },
  autocomplete: {
    deprecated: (since: string, replacedBy: string): string => `deprecated since ${since}: use ${replacedBy}`,
  },
  argumentHint: {
    since: (version: string): string => `Since ${version}`,
  },
  commands: {
    show: 'Console',
    run: 'Run console command',
    clear: 'Clear console output',
    clearHistory: 'Clear console history',
    stop: 'Stop console command',
    copyReply: 'Copy reply',
    copyValue: 'Copy value',
    copyCommand: 'Copy command',
  },
} as const;
