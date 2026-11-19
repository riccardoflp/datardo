/**
 * The text of the interface of the Pub/Sub area, word for word as its cards write it (R10.1).
 */
import { groupThousands } from '../../shared/text-units';

function count(number: number, one: string, many: string): string {
  return `${groupThousands(number)} ${number === 1 ? one : many}`;
}

/** The text of the Pub/Sub area. */
export const text = {
  show: {
    title: 'Pub/Sub',
    nameField: 'Channel or pattern',
    kinds: { auto: 'Auto', channel: 'Channel', pattern: 'Pattern' },
    subscribe: 'Subscribe',
    filter: 'Filter messages',
    eventsOf: 'Events of',
    off: 'Off',
    export: 'Export…',
    publish: 'Publish…',
    listening: '● Listening',
    paused: '❚❚ Paused',
    pausedNew: (held: number): string => `❚❚ Paused · ${groupThousands(held)} new`,
    connecting: '○ Connecting…',
    disconnected: '■ Disconnected',
    retryingIn: (seconds: number): string => `■ Disconnected · trying again in ${String(seconds)} s`,
    notSubscribed: '■ Not subscribed',
    notConnected: '■ Not connected',
    connect: 'Connect',
    counts: (subscriptions: number, messages: string): string =>
      `${count(subscriptions, 'subscription', 'subscriptions')} · ${messages}`,
    readOnly: 'Read-only',
    readOnlyPublish: (connection: string): string => `The connection ${connection} is read-only.`,
    noPrefix: (mongo: string, redis: string): string =>
      `${mongo} has no channel prefix: the pattern * receives every message of ${redis}, not only the events of redis-oplog.`,
    nothingWritten: 'Nothing is written: the page only opens.',
  },
  subscribe: {
    title: (names: string): string => `Subscribe to ${names}`,
    question: 'Subscribe to a channel',
    kind: 'Kind',
    alreadySubscribed: (names: string): string => `Already subscribed to ${names}.`,
    tooMany: 'A Pub/Sub page holds up to 100 subscriptions. Use a pattern to follow many channels.',
    notConnected: (connection: string): string => `${connection} is not connected.`,
    open: (hosts: string): string => `open a connection to ${hosts} for Pub/Sub`,
    add: (names: string, connection: string): string =>
      `add ${names} to the subscriptions of the Pub/Sub page of ${connection}`,
    notAllowed: (names: string, message: string): string =>
      `The user of this connection may not subscribe to ${names}: ${message}`,
    nothingWritten:
      'Nothing is written: a subscription changes only what the server sends to Datardo’s own connection. Unsubscribe ends it.',
  },
  unsubscribe: {
    title: (names: string): string => `Unsubscribe from ${names}`,
    all: 'Unsubscribe from all',
    remove: (names: string, connection: string): string =>
      `remove ${names} from the subscriptions of the Pub/Sub page of ${connection}`,
    close: (connection: string): string => `close the Pub/Sub connection to ${connection}`,
    cannotUndo:
      'Nothing is written. Subscribing again starts it again; the messages published in between are not received.',
  },
  pause: {
    pause: 'Pause',
    resume: 'Resume',
    resumeHeld: (held: number): string => `Resume (${groupThousands(held)})`,
    pauseTitle: 'Pause Pub/Sub messages',
    resumeTitle: 'Resume Pub/Sub messages',
    pauseStep: (connection: string): string => `pause the messages of the Pub/Sub page of ${connection}`,
    resumeStep: (connection: string): string => `resume the messages of the Pub/Sub page of ${connection}`,
    cannotUndo: 'Nothing is written. Resume ends the pause.',
  },
  clear: {
    clear: 'Clear',
    title: 'Clear Pub/Sub messages',
    tooltip: 'Empty the list. The messages are not kept anywhere else.',
    step: (connection: string): string => `clear the messages of the Pub/Sub page of ${connection}`,
    cannotUndo: 'The messages are kept nowhere else, and Redis does not have them any more.',
  },
  copy: {
    message: 'Copy message',
    channel: 'Copy channel',
    json: 'Copy as JSON',
    command: 'Copy as PUBLISH command',
    copy: 'Copy',
    title: 'Copy messages',
    step: (messages: number): string => `copy ${count(messages, 'message', 'messages')} to the clipboard`,
    copied: (messages: number): string => `Copied ${count(messages, 'message', 'messages')}.`,
    cannotUndo: 'It changes only the clipboard.',
  },
  export: {
    title: (messages: number): string => `Export ${count(messages, 'message', 'messages')}`,
    question: 'Export Pub/Sub messages',
    button: 'Export',
    messages: 'Messages',
    selected: (rows: number): string => `The ${groupThousands(rows)} selected`,
    shown: (rows: number): string => `The ${groupThousands(rows)} shown by the filter`,
    all: (rows: number): string => `All ${groupThousands(rows)}`,
    format: 'Format',
    formats: { jsonl: 'JSON Lines', json: 'JSON', csv: 'CSV' },
    file: 'File',
    exported: (messages: number, file: string): string =>
      `Exported ${count(messages, 'message', 'messages')} to ${file}.`,
    empty: 'There are no messages to export.',
    cannotUndo: 'It writes a file, which the user can delete.',
  },
  publish: {
    question: 'Publish a message',
    button: 'Publish',
    channel: 'Channel',
    message: 'Message',
    sendAs: 'Send as',
    formats: { text: 'Text', json: 'JSON', hex: 'Hexadecimal' },
    takenBack: 'A published message cannot be taken back.',
    title: (channel: string): string => `Publish to ${channel}`,
    readOnly: (connection: string): string => `The connection ${connection} is read-only.`,
    noChannel: 'Type the channel to publish to.',
    invalidJson: (message: string): string => `The message is not valid JSON: ${message}.`,
    oddHex: (digits: number): string =>
      `Hexadecimal is pairs of the digits 0-9 and a-f: ${groupThousands(digits)} digits is not a whole number of bytes.`,
    notHex: (character: string): string => `Hexadecimal is pairs of the digits 0-9 and a-f: ${character} is not one.`,
    tooLarge: (size: string): string => `The message is ${size}: this form sends up to 1 MB.`,
    published: (channel: string, clients: number): string =>
      clients === 0
        ? `Published to ${channel}: no client is subscribed, so nobody received it.`
        : `Published to ${channel}: ${count(clients, 'client', 'clients')} received it.`,
    cannotUndo: 'A message that was delivered cannot be withdrawn, and Redis keeps no copy of it.',
  },
  reconnect: {
    banner: (time: string): string =>
      `The Pub/Sub connection closed at ${time}. Messages published since then are not received: Redis does not keep them.`,
    reconnectNow: 'Reconnect now',
    title: 'Subscribe again',
    gap: (from: string, to: string): string =>
      `Disconnected from ${from} to ${to}: messages published in between were not received.`,
    cannotUndo: 'Nothing is written.',
  },
  follow: {
    title: (mongo: string): string => `Follow the events of ${mongo}`,
    followEvents: 'Follow events',
    openPage: (redis: string): string => `open the Pub/Sub page of ${redis}`,
    showEvents: (mongo: string): string => `show the events of ${mongo}`,
    offTitle: 'Show every message',
    offStep: (redis: string): string => `show every message as its own row on the Pub/Sub page of ${redis}`,
    noLink: (mongo: string): string => `${mongo} has no linked Redis connection. Link one in its connection form.`,
    notConnected: (redis: string): string => `${redis} is not connected.`,
    cannotUndo: 'Nothing is written. Events of › Off and Unsubscribe end it.',
  },
  subscriptions: {
    header: 'Subscriptions',
    unsubscribeAll: 'Unsubscribe from all',
    kinds: { channel: 'channel', pattern: 'pattern' },
    subscribing: 'Subscribing…',
    unsubscribe: 'Unsubscribe',
    showOnly: 'Show only its messages',
    publishTo: 'Publish to this channel…',
    copyName: 'Copy name',
    none: 'No subscriptions.',
  },
  channels: {
    header: 'Active channels',
    refresh: 'Refresh',
    filter: 'Filter channels',
    subscribe: 'Subscribe',
    publishTo: 'Publish to this channel…',
    copyName: 'Copy name',
    thisPage: '(this page too)',
    more: (shown: number, all: number): string => `${groupThousands(shown)} of ${count(all, 'channel', 'channels')}`,
    patterns: (patterns: number): string => `${count(patterns, 'pattern', 'patterns')} subscribed on the server`,
    none: 'No active channels: nobody is subscribed to a channel by name.',
    notAllowed: (message: string): string => `PUBSUB CHANNELS needs a user that may run it: ${message}`,
    unknown: (message: string): string => `This server does not allow PUBSUB CHANNELS: ${message}`,
  },
  messages: {
    time: 'Time',
    channel: 'Channel',
    message: 'Message',
    operation: 'Operation',
    collection: 'Collection',
    document: 'Document',
    fields: 'Fields',
    throughPattern: (pattern: string): string => `through the pattern ${pattern}`,
    dropped: (rows: number): string =>
      rows === 1
        ? 'The list keeps the last 10,000 messages: 1 older one was dropped.'
        : `The list keeps the last 10,000 messages: ${groupThousands(rows)} older ones were dropped.`,
    publishAgain: 'Publish again…',
    subscribeTo: 'Subscribe to this channel',
    selected: (rows: number): string => `${groupThousands(rows)} selected`,
    clearSelection: 'Clear selection',
    newRows: (rows: number): string => `${groupThousands(rows)} new`,
    announce: (rows: number): string => count(rows, 'new message', 'new messages'),
    notSubscribed:
      'Subscribe to a channel or to a pattern to see its messages. A message published before you subscribe is not shown: Redis does not keep it.',
    listening: 'Listening. No message has arrived yet.',
    noMatch: 'No message matches the filter.',
  },
  inspect: {
    received: 'Received',
    through: 'Through',
    throughChannel: (channel: string): string => `the channel ${channel}`,
    throughPattern: (pattern: string): string => `the pattern ${pattern}`,
    size: 'Size',
    bytes: (bytes: number): string => count(bytes, 'byte', 'bytes'),
    operation: 'Operation',
    collection: 'Collection',
    document: 'Document',
    fields: 'Fields',
    channels: 'Channels',
    formats: { text: 'Text', json: 'JSON', hex: 'Hexadecimal' },
  },
  commands: {
    show: 'Pub/Sub',
    subscribe: 'Subscribe to a channel…',
    unsubscribe: 'Unsubscribe',
    unsubscribeAll: 'Unsubscribe from all channels',
    pause: 'Pause Pub/Sub messages',
    resume: 'Resume Pub/Sub messages',
    clear: 'Clear Pub/Sub messages',
    copyMessage: 'Copy message',
    copyChannel: 'Copy channel',
    copyJson: 'Copy as JSON',
    copyCommand: 'Copy as PUBLISH command',
    export: 'Export Pub/Sub messages…',
    publish: 'Publish a message…',
    follow: 'Follow redis-oplog events',
  },
} as const;
