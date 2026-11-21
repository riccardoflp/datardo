/**
 * Feature: monitor.show
 *
 * The Monitor page: one page tab per MongoDB connection that shows what its server is doing, a section at a time,
 * read again with **Refresh** or by itself every few seconds. `view` says what the section bar, the toolbar and the
 * status line show; `readsOf` says what each section reads when it is chosen, with **Refresh** and at an automatic
 * refresh; `isAutoRefreshDue` and the requests of each part say when a read is sent and which reply is kept; `plan` is
 * what the tree, Go to and the tool `open_monitor` start: the tab of the page, on a section. Ported from Mongoster's
 * `src/monitor.ts › MonitorPanel` and `src/webview/monitor.ts` (`setTab`, `refresh`, `setAuto`).
 */
import type { Json } from '../../shared/engine-request';
import {
  run,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
  type ReadNeed,
} from '../../shared/feature';
import { featureId, type ConnectionId } from '../../shared/ids';
import { savedConnection } from '../../shared/state/connections';
import { targetConnection } from '../../shared/target';
import { appPlan } from '../nav/types';
import { connectionPageShows } from '../palette/sources';
import { planOf } from '../tab/open';
import { monitorChoicesAsked } from './parts/choices';
import { autoIntervals, type AutoInterval } from './parts/intervals';
import { recordOf } from './parts/ejson';
import { refusalKindOf, type Failure } from './parts/failure';
import { text } from './text';
import { monitorSections, type MonitorSection } from './types';

export { autoIntervals, defaultAuto, type AutoInterval } from './parts/intervals';

/** The section the page shows the first time it opens. */
export const firstSection: MonitorSection = 'operations';

/**
 * The sections that are built, in the order of the section bar: all five since M31. A section asked for that is not
 * among them shows the first.
 */
export const builtSections: readonly MonitorSection[] = monitorSections;

/** The page's name in a tab and in its path. */
export const monitorPage = 'monitor';

/** Why the page reads: the page opened, the section was chosen, **Refresh** was pressed, or the automatic refresh. */
export type ReadReason = 'opened' | 'chosen' | 'refresh' | 'auto';

/** The parts of the page whose replies are kept apart: a reply older than the last request of its part is dropped. */
export type MonitorPart =
  | 'databases'
  | 'operations'
  | 'slow-queries'
  | 'server-status'
  | 'database-stats'
  | 'collection-stats'
  | 'replication'
  | 'oplog'
  | 'sharding'
  | 'sharding-events';

/** The element of each section in the section bar, from the card of the section. */
const sectionElements = {
  operations: 'monitor.operations@section-bar',
  'slow-queries': 'monitor.slow-queries@section-bar',
  stats: 'monitor.stats@section-bar',
  replication: 'monitor.replication@section-bar',
  sharding: 'monitor.sharding@section-bar',
} as const satisfies Record<MonitorSection, string>;

/** What the reads of a section are given: the connection and the arguments each section's controls choose. */
export interface ReadsInput {
  readonly connection: ConnectionId;
  /** The arguments of the operations' read (`monitor.read-operations`): `idle` when **Idle connections** is on. */
  readonly operations?: Json;
  /** The arguments of the slow operations' read (`monitor.read-slow-queries`), from the section's toolbar. */
  readonly slowQueries?: Json;
  /** The database chosen in the Stats section, whose collections are read. */
  readonly statsDatabase?: string;
  /** The arguments of the oplog's read (`monitor.read-oplog`): text, operation, last. */
  readonly oplog?: Json;
  /** The arguments of the events' read (`monitor.read-sharding-events`): text, show. */
  readonly events?: Json;
}

function need(key: MonitorPart, read: string, args: Json): ReadNeed {
  return { key, read: featureId(read), args };
}

function withConnection(connection: ConnectionId, args: Json | undefined): Json {
  return { ...recordOf(args), connection };
}

function statsReads(reason: ReadReason, input: ReadsInput): readonly ReadNeed[] {
  const { connection } = input;
  const status = need('server-status', 'monitor.read-server-status', { connection });
  if (reason === 'auto') {
    return [status];
  }
  const database = input.statsDatabase;
  return [
    status,
    need('database-stats', 'monitor.read-database-stats', { connection, step: 'list' }),
    ...(database === undefined
      ? []
      : [need('collection-stats', 'monitor.read-collection-stats', { connection, database, step: 'list' })]),
  ];
}

/**
 * The reads of a section, each under the name of its part (`monitor.show`, "Refreshing"). The databases of the
 * **Database** lists are read once, when the page opens. The statistics of the databases and of the collections are
 * read only when the section is chosen and with **Refresh**; the sharded cluster is read in full then, and without
 * the commands run once per collection at an automatic refresh.
 */
export function readsOf(section: MonitorSection, reason: ReadReason, input: ReadsInput): readonly ReadNeed[] {
  const { connection } = input;
  const opening =
    reason === 'opened' ? [need('databases', 'monitor.read-database-stats', { connection, step: 'list' })] : [];
  const reads = ((): readonly ReadNeed[] => {
    switch (section) {
      case 'operations':
        return [need('operations', 'monitor.read-operations', withConnection(connection, input.operations))];
      case 'slow-queries':
        return [need('slow-queries', 'monitor.read-slow-queries', withConnection(connection, input.slowQueries))];
      case 'stats':
        return statsReads(reason, input);
      case 'replication':
        return [
          need('replication', 'monitor.read-replication', { connection, step: 'hello' }),
          need('oplog', 'monitor.read-oplog', withConnection(connection, input.oplog)),
        ];
      case 'sharding':
        return [
          need('sharding', 'monitor.read-sharding', { connection, step: 'hello', full: reason !== 'auto' }),
          need('sharding-events', 'monitor.read-sharding-events', withConnection(connection, input.events)),
        ];
    }
  })();
  return [...opening, ...reads];
}

/** When the page reads by itself. */
export interface AutoClock {
  readonly auto: AutoInterval;
  /** When the section was last read, in milliseconds since 1970. */
  readonly lastReadAt?: number;
  readonly tabActive: boolean;
  readonly windowVisible: boolean;
}

/** Whether the automatic refresh reads now: only while the tab is active and the window visible, once due. */
export function isAutoRefreshDue(clock: AutoClock, now: number): boolean {
  if (clock.auto === 0 || !clock.tabActive || !clock.windowVisible) {
    return false;
  }
  return clock.lastReadAt === undefined || now - clock.lastReadAt >= clock.auto * 1000;
}

/** The number of the last request sent for each part. */
export type PartRequests = Partial<Readonly<Record<MonitorPart, number>>>;

/** The requests once a read of a part is sent, and its number. */
export function sendRequest(requests: PartRequests, part: MonitorPart): { requests: PartRequests; number: number } {
  const number = (requests[part] ?? 0) + 1;
  return { requests: { ...requests, [part]: number }, number };
}

/** Whether the reply of the request `number` of a part changes what is shown: an older one is dropped. */
export function isLatestReply(requests: PartRequests, part: MonitorPart, number: number): boolean {
  return requests[part] === number;
}

/**
 * The error line of a part, by the server's error: *getLog needs a role that allows it (clusterMonitor has it): …*
 * for the code 13, *This server does not allow getLog: …* for the codes 8000, 115 and 59, the message otherwise.
 */
export function errorLineOf(command: string, failure: Failure): string {
  switch (refusalKindOf(failure)) {
    case 'needs-role':
      return text.needsRole(command, failure.message);
    case 'not-allowed':
      return text.notAllowed(command, failure.message);
    case 'other':
      return failure.message;
  }
}

/** Whether the controls that need a command are disabled by its failure: a missing role or a command not allowed. */
export function isCommandRefused(failure: Failure | undefined): boolean {
  return failure !== undefined && refusalKindOf(failure) !== 'other';
}

/** What the page is drawn from, besides its section. */
export interface MonitorPageState {
  readonly connection: { readonly name: string; readonly readOnly: boolean };
  readonly section: MonitorSection;
  readonly auto: AutoInterval;
  /** Whether a read is in progress: the section keeps what it showed. */
  readonly loading: boolean;
}

/** What the section bar, the toolbar and the status line show. */
export interface MonitorPageView {
  readonly title: string;
  readonly sectionBar: readonly {
    readonly section: MonitorSection;
    readonly label: string;
    readonly chosen: boolean;
    readonly element: (typeof sectionElements)[MonitorSection];
  }[];
  readonly toolbar: {
    readonly auto: {
      readonly label: string;
      readonly value: AutoInterval;
      readonly choices: readonly { readonly value: AutoInterval; readonly label: string }[];
    };
    readonly refresh: string;
  };
  /** **Read-only** in the status line, on a read-only connection. */
  readonly status?: string;
  /** *The connection Production is read-only.*: the tooltip of every writing control of the page. */
  readonly readOnly?: string;
  readonly loading: boolean;
}

/** Feature: monitor.show — what the section bar, the toolbar and the status line show. */
export function view(state: MonitorPageState): MonitorPageView {
  return {
    title: text.page,
    sectionBar: monitorSections.map((section) => ({
      section,
      label: text.sections[section],
      chosen: section === state.section,
      element: sectionElements[section],
    })),
    toolbar: {
      auto: {
        label: text.toolbar.auto,
        value: state.auto,
        choices: autoIntervals.map((value) => ({
          value,
          label: value === 0 ? text.toolbar.off : text.toolbar.seconds(value),
        })),
      },
      refresh: text.toolbar.refresh,
    },
    ...(state.connection.readOnly
      ? { status: text.readOnlyStatus, readOnly: text.readOnly(state.connection.name) }
      : {}),
    loading: state.loading,
  };
}

/** The section asked for: the variant of the command (`monitor.show:replication`), or `args.section`. */
export function sectionAsked(args: unknown): MonitorSection | undefined {
  const asked = typeof args === 'string' ? args : recordOf(args)['section'];
  return monitorSections.find((section) => section === asked);
}

/**
 * Feature: monitor.show — **Monitor** of the tree, Go to and `open_monitor`: the tab of the page, on a section. The
 * page itself starts it with `{ section }` when a section is chosen and with `{ choices }` when **Auto**, a filter, a
 * choice of a toolbar or a sort changes, so that they are kept with the tab (`parts/choices.ts`).
 */
export function plan(context: Context, answers: Answers): Outcome {
  const id = targetConnection(context.target) ?? context.state.nav.current;
  const connection = id === undefined ? undefined : savedConnection(context.state.connections, id);
  if (connection?.engine !== 'mongodb') {
    return run(appPlan(text.openPlan, []));
  }
  const section = sectionAsked(answers['args']);
  const choices = monitorChoicesAsked(answers['args']);
  return planOf(context.state, {
    shows: connectionPageShows(connection.id, monitorPage),
    background: false,
    ...(section === undefined ? {} : { section }),
    ...(choices === undefined ? {} : { memory: { choices } }),
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('monitor.show'), plan };
