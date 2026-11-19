/**
 * The text of the interface of the Replication section of the Monitor page and of its Reads and Operations, word for
 * word as their cards write it (`monitor.replication`, `monitor.read-oplog`, `monitor.step-down`); `text.ts` gathers
 * it with the rest of the area's (R10.1).
 */

/** The words of this part of the Monitor page. */
export const replicationText = {
  tiles: {
    replicaSet: 'Replica set',
    termLine: (term: string, protocol: string) => `term ${term} · protocol v${protocol}`,
    primary: 'Primary',
    none: 'none',
    connectedTo: (host: string, state: string) => `connected to ${host} (${state})`,
    members: 'Members',
    healthy: (healthy: number, total: number) => `${String(healthy)} / ${String(total)} healthy`,
    lag: 'Replication lag',
    upToDate: 'every member is up to date',
    delayedLeftOut: 'delayed members left out',
    oplogWindow: 'Oplog window',
    oplogLine: (size: string, maxSize: string, entries: string, since: string) =>
      `${size} of ${maxSize} · ${entries} entries · since ${since}`,
    elections: 'Elections',
    timeout: (seconds: string) => `${seconds} timeout`,
    heartbeat: (seconds: string) => `heartbeat every ${seconds}`,
    chainingAllowed: 'chaining allowed',
    chainingNotAllowed: 'chaining not allowed',
  },
  members: {
    title: 'Members',
    asOf: (time: string) => `as of ${time}`,
    stepDown: 'Step down…',
    noPrimary: 'There is no primary',
    columns: {
      member: 'Member',
      state: 'State',
      lag: 'Lag',
      lastApplied: 'Last applied',
      heartbeat: 'Heartbeat',
      ping: 'Ping',
      syncSource: 'Sync source',
      priority: 'Priority',
      votes: 'Votes',
      notes: 'Notes',
      uptime: 'Uptime',
    },
    down: '(down)',
    ago: (time: string) => `${time} ago`,
    milliseconds: (count: string) => `${count} ms`,
    missing: '—',
    hidden: 'hidden',
    delayed: (span: string) => `delayed ${span}`,
    neverPrimary: 'never primary',
    noIndexBuilds: 'no index builds',
  },
  oplog: {
    title: 'Oplog',
    filter: 'Database or collection (shop, shop.users)',
    operation: 'Operation',
    operations: {
      'all-but-noops': 'All but no-ops',
      insert: 'Insert',
      update: 'Update',
      delete: 'Delete',
      command: 'Command / transaction',
      noop: 'No-op',
      everything: 'Everything',
    },
    last: 'Last',
    mostRecent: (count: string) => `the ${count} most recent entries, newest first`,
    allMatching: (count: string) => `all ${count} most recent matching entries, newest first`,
    columns: { time: 'Time', op: 'Op', namespace: 'Namespace', id: '_id', change: 'Change' },
    empty: 'The oplog is empty.',
    nothingMatches: 'No entry matches.',
  },
  standalone: (server: string) =>
    `${server} is a standalone server: it is not part of a replica set, so there is no replication and no oplog.`,
  thisServer: 'This server',
  mongos:
    'Connected to a mongos (sharded cluster): add a connection to a shard to see its replica set and oplog. The Sharding section shows the cluster.',
  needsClusterMonitor: (message: string) => `Member details need the clusterMonitor role: ${message}`,
  oplogFailed: (message: string) => `Oplog: ${message}`,
  oplogTooSlow: (message: string) =>
    `Few entries match and the oplog is long: reading it took more than 10 s. ${message}`,
  stepDown: {
    title: (primary: string, set: string) => `Step down the primary ${primary} of ${set}`,
    question: (primary: string, set: string) => `Step down the primary ${primary} of ${set}?`,
    warning:
      'The members elect a new primary: writes fail until then (usually a few seconds). The current primary can not be elected again for 60 seconds.',
    button: 'Step down',
    cannotUndo: 'The election is the replica set’s: it cannot be undone.',
    done: (primary: string) => `${primary} stepped down: a new primary is being elected.`,
    noPrimary: 'There is no primary to step down.',
  },
} as const;
