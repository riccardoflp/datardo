/**
 * The text of the interface of the Monitor page, word for word as the cards of `docs/features/monitor.md` write it
 * (R10.1). The texts of the Stats, Replication and Sharding sections are in `parts/*-text.ts` and gathered here.
 */
import { replicationText } from './parts/replication-text';
import { shardingText } from './parts/sharding-text';
import { statisticsText } from './parts/statistics-text';
import { slowText } from './parts/slow-text';

/** The words of the Monitor page. */
export const text = {
  page: 'Monitor',
  openPlan: 'Open the Monitor page',
  sections: {
    operations: 'Operations',
    'slow-queries': 'Slow queries',
    stats: 'Stats',
    replication: 'Replication',
    sharding: 'Sharding',
  },
  commands: {
    show: 'Monitor',
    section: (section: string) => `Monitor: ${section}`,
  },
  toolbar: {
    auto: 'Auto',
    off: 'Off',
    seconds: (seconds: number) => `${String(seconds)} s`,
    refresh: 'Refresh',
  },
  readOnlyStatus: 'Read-only',
  copy: 'Copy',
  /** *The connection Production is read-only.* */
  readOnly: (connection: string) => `The connection ${connection} is read-only.`,
  /** The sentences of a command the server does not allow (`monitor.show`, "States"). */
  needsRole: (command: string, message: string) =>
    `${command} needs a role that allows it (clusterMonitor has it): ${message}`,
  notAllowed: (command: string, message: string) => `This server does not allow ${command}: ${message}`,
  operations: {
    filter: 'Filter by namespace, type, client or command',
    runningAtLeast: 'Running ≥',
    idle: 'Idle connections',
    system: 'System operations',
    count: (shown: string, read: string, noun: string, time: string) => `${shown} of ${read} ${noun} · ${time}`,
    one: 'operation',
    many: 'operations',
    columns: {
      opid: 'Opid',
      type: 'Type',
      namespace: 'Namespace',
      running: 'Running',
      client: 'Client',
      plan: 'Plan',
      command: 'Command',
    },
    waitingForLock: 'Waiting for a lock',
    idleRunning: 'idle',
    nothingRunning: 'No operations running.',
    nothingMatches: 'No operation matches the filters.',
    kill: 'Kill…',
  },
  kill: {
    title: (opid: string) => `Kill operation ${opid}?`,
    operation: (type: string, namespace: string, running: string) => `${type} ${namespace} — running ${running}`,
    warning: 'The operation is interrupted and its client receives an error. Writes already done are not undone.',
    button: 'Kill',
    cannotUndo: 'A killed operation cannot be started again, and what it wrote stays written.',
    killed: (opid: string) => `Killed operation ${opid}.`,
  },
  slow: slowText,
  statistics: statisticsText,
  replication: replicationText,
  sharding: shardingText,
} as const;
