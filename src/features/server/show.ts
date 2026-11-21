/**
 * Feature: server.show
 *
 * The Server page: one page tab per Redis connection that shows the state of its server, a section at a time, read
 * again with **Refresh** or by itself every few seconds. `view` says what the section bar and the toolbar show;
 * `readsOf` says what each section reads, when it is chosen, with **Refresh** and at an automatic refresh;
 * `isAutoRefreshDue` and the requests of each part say when a read is sent and which reply is kept; `plan` is what
 * the tree and Go to start: the tab of the page, on a section. The toolbar, the automatic refresh and its numbers are
 * Mongoster's server monitor's (`src/webview/monitor.ts › setAuto`).
 */
import type { ConnectionView } from '../../shared/connection';
import type { Json } from '../../shared/engine-request';
import type { Answers, Context, OperationFeature, Outcome, ReadFeature, ReadNeed } from '../../shared/feature';
import { run } from '../../shared/feature';
import { connectionId, featureId, type ConnectionId } from '../../shared/ids';
import { savedConnection } from '../../shared/state/connections';
import { targetConnection } from '../../shared/target';
import { appPlan } from '../nav/types';
import { connectionPageShows } from '../palette/sources';
import { runnerText } from '../runner/text';
import { planOf } from '../tab/open';
import { clientColumns, initialClientSort, type ClientSort } from './clients';
import { clientIdRequest, parseClientId } from './read-clients';
import type { SlowLogOrder } from './slow-log';
import { text } from './text';
import { isReadByAutoRefresh } from './unavailable';
import { clockText, serverSections, textArg, type PartRead, type ServerSection } from './types';

/** The intervals of **Auto**, in seconds; 0 is **Off**. */
export const autoIntervals = [0, 2, 5, 15] as const;

/** An interval of **Auto**. */
export type AutoInterval = (typeof autoIntervals)[number];

/** **Auto** to start with: 5 s. */
export const defaultAuto: AutoInterval = 5;

/** The section the page shows the first time it opens. */
export const firstSection: ServerSection = 'overview';

/** The page's name in a tab and in its path: **Server**. */
export const serverPage = 'server';

/** Why the page reads: the section was chosen, **Refresh** was pressed, or the automatic refresh came. */
export type ReadReason = 'chosen' | 'refresh' | 'auto';

/** The parts of the page whose replies are kept apart: a reply older than the last request of its part is dropped. */
export type ServerPart = 'info' | 'replication' | 'clients' | 'slow-log' | 'memory' | 'keyspace' | 'config';

/** The element of each section in the section bar, from the card of the section. */
const sectionElements = {
  overview: 'server.overview@section-bar',
  clients: 'server.clients@section-bar',
  'slow-log': 'server.slow-log@section-bar',
  memory: 'server.memory@section-bar',
  replication: 'server.replication@section-bar',
  configuration: 'server.config@section-bar',
} as const satisfies Record<ServerSection, string>;

/** What the reads of a section need to know: the connection, the page's own client, the last result of each part. */
export interface ReadsInput {
  readonly connection: ConnectionId;
  /** What `CLIENT ID` answered to the page. */
  readonly own?: string;
  /** The last result of the main read of each part: the entries of the slow log, the statistics of the memory. */
  readonly last: Partial<Readonly<Record<ServerPart, PartRead<unknown>>>>;
}

function need(key: ServerPart, read: string, args: Json): ReadNeed {
  return { key, read: featureId(read), args };
}

/**
 * The reads of a section, each under the name of its part. The threshold of the slow log, the advice of the memory,
 * the databases of the largest keys and the configuration are read only when the section is chosen and with
 * **Refresh**; a part refused for a permission or a command is not read again by the automatic refresh.
 */
export function readsOf(section: ServerSection, reason: ReadReason, input: ReadsInput): readonly ReadNeed[] {
  const connection = input.connection;
  const auto = reason === 'auto';
  const reads = ((): readonly ReadNeed[] => {
    switch (section) {
      case 'overview':
        return [need('info', 'server.read-info', { connection })];
      case 'replication':
        return [need('replication', 'server.read-info', { connection, part: 'replication' })];
      case 'clients':
        return [
          need('clients', 'server.read-clients', {
            connection,
            ...(input.own === undefined ? {} : { own: input.own }),
          }),
        ];
      case 'slow-log':
        return [
          need('slow-log', 'server.read-slow-log', { connection, part: auto ? 'entries' : 'entries-and-threshold' }),
        ];
      case 'memory':
        return [
          need('memory', 'server.read-memory', { connection, doctor: !auto }),
          ...(reason === 'chosen' ? [need('keyspace', 'server.read-info', { connection, part: 'keyspace' })] : []),
        ];
      case 'configuration':
        return auto ? [] : [need('config', 'server.read-config', { connection })];
    }
  })();
  return auto ? reads.filter((each) => isReadByAutoRefresh(input.last[each.key as ServerPart])) : reads;
}

/** When the page reads by itself. */
export interface AutoClock {
  readonly auto: AutoInterval;
  /** When the section was last read, in milliseconds since 1970. */
  readonly lastReadAt?: number;
  readonly tabActive: boolean;
  readonly windowVisible: boolean;
}

/**
 * Whether the automatic refresh reads now: only while the tab is the active tab and the window is visible, once the
 * interval has passed since the last read. Coming back to the tab reads at once when more than the interval passed.
 */
export function isAutoRefreshDue(clock: AutoClock, now: number): boolean {
  if (clock.auto === 0 || !clock.tabActive || !clock.windowVisible) {
    return false;
  }
  return clock.lastReadAt === undefined || now - clock.lastReadAt >= clock.auto * 1000;
}

/** The requests of each part: the number of the last one sent, and those not answered yet. */
export interface PartRequests {
  readonly sent: Partial<Readonly<Record<ServerPart, number>>>;
  readonly waiting: readonly ServerPart[];
}

/** No request sent yet. */
export const noRequests: PartRequests = { sent: {}, waiting: [] };

/** Whether a part is read now: a read that has not been answered yet is not sent again. */
export function isWaiting(requests: PartRequests, part: ServerPart): boolean {
  return requests.waiting.includes(part);
}

/** The requests once a read of a part is sent, and its number. */
export function sendRequest(requests: PartRequests, part: ServerPart): { requests: PartRequests; number: number } {
  const number = (requests.sent[part] ?? 0) + 1;
  return {
    requests: {
      sent: { ...requests.sent, [part]: number },
      waiting: requests.waiting.includes(part) ? requests.waiting : [...requests.waiting, part],
    },
    number,
  };
}

/**
 * Whether the reply of the request `number` of a part changes what is shown: a reply that arrives after a newer
 * request for the same part was sent is dropped.
 */
export function isLatestReply(requests: PartRequests, part: ServerPart, number: number): boolean {
  return requests.sent[part] === number;
}

/** The requests once the reply of the request `number` of a part arrived. */
export function replyArrived(requests: PartRequests, part: ServerPart, number: number): PartRequests {
  return isLatestReply(requests, part, number)
    ? { ...requests, waiting: requests.waiting.filter((each) => each !== part) }
    : requests;
}

/** What the page is drawn from, besides its section. */
export interface ServerPageState {
  readonly connection: ConnectionView;
  readonly section: ServerSection;
  readonly auto: AutoInterval;
  readonly lastReadAt?: number;
}

/** What the section bar and the toolbar of the page show, and the status line's **Read-only**. */
export interface ServerPageView {
  readonly title: string;
  readonly sectionBar: readonly {
    readonly section: ServerSection;
    readonly label: string;
    readonly chosen: boolean;
    readonly element: (typeof sectionElements)[ServerSection];
  }[];
  readonly toolbar: {
    readonly auto: {
      readonly label: string;
      readonly value: AutoInterval;
      readonly choices: readonly { readonly value: AutoInterval; readonly label: string }[];
    };
    readonly refresh: string;
    readonly lastRead?: string;
  };
  /** *The connection Cache production is read-only.*: the tooltip of **Disconnect…** and **Clear…**. */
  readonly readOnly?: string;
}

/** Feature: server.show — what the section bar and the toolbar show. */
export function view(state: ServerPageState): ServerPageView {
  return {
    title: text.page,
    sectionBar: serverSections.map((section) => ({
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
      ...(state.lastReadAt === undefined ? {} : { lastRead: clockText(state.lastReadAt) }),
    },
    ...(state.connection.readOnly ? { readOnly: runnerText.readOnly(state.connection.name) } : {}),
  };
}

/** The section asked for: the variant of the command (`server.show:slow-log`), or `args.section`. */
export function sectionAsked(args: unknown): ServerSection | undefined {
  const asked =
    typeof args === 'string'
      ? args
      : typeof args === 'object' && args !== null
        ? (args as Record<string, unknown>)['section']
        : undefined;
  return serverSections.find((section) => section === asked);
}

/** What the page keeps of its controls with its tab (`tab.restore`): **Auto**, the filters and the sorts. */
export interface ServerChoices {
  readonly auto: AutoInterval;
  readonly clientsFilter: string;
  /** **Idle ≤**, as typed. */
  readonly clientsIdle: string;
  readonly clientsSort: ClientSort;
  readonly slowLogFilter: string;
  /** **Slower than**, in milliseconds, as typed. */
  readonly slowerThan: string;
  readonly slowLogOrder: SlowLogOrder;
  readonly configFilter: string;
}

/** The choices of a page never shown: **Auto** at 5 s, no filter, the clients by **ID**, the slow log as the server's. */
export const initialChoices: ServerChoices = {
  auto: defaultAuto,
  clientsFilter: '',
  clientsIdle: '',
  clientsSort: initialClientSort,
  slowLogFilter: '',
  slowerThan: '0',
  slowLogOrder: 'server',
  configFilter: '',
};

function sortOfText(value: string | undefined): ClientSort {
  const [column, direction] = (value ?? '').split(' ');
  const known = clientColumns.find((each) => each === column);
  return known === undefined || (direction !== 'ascending' && direction !== 'descending')
    ? initialClientSort
    : { column: known, direction };
}

/** The choices kept with a tab, each one that is missing or not valid as it starts. */
export function choicesOf(kept: Readonly<Record<string, unknown>> | undefined): ServerChoices {
  const textOf = (name: keyof ServerChoices): string | undefined => {
    const value = kept?.[name];
    return typeof value === 'string' ? value : undefined;
  };
  const auto = autoIntervals.find((each) => String(each) === textOf('auto'));
  return {
    auto: auto ?? initialChoices.auto,
    clientsFilter: textOf('clientsFilter') ?? '',
    clientsIdle: textOf('clientsIdle') ?? '',
    clientsSort: sortOfText(textOf('clientsSort')),
    slowLogFilter: textOf('slowLogFilter') ?? '',
    slowerThan: textOf('slowerThan') ?? initialChoices.slowerThan,
    slowLogOrder: textOf('slowLogOrder') === 'duration' ? 'duration' : 'server',
    configFilter: textOf('configFilter') ?? '',
  };
}

/** The choices as the tab keeps them: text by name. */
export function choicesRecord(choices: ServerChoices): Readonly<Record<string, string>> {
  return {
    auto: String(choices.auto),
    clientsFilter: choices.clientsFilter,
    clientsIdle: choices.clientsIdle,
    clientsSort: `${choices.clientsSort.column} ${choices.clientsSort.direction}`,
    slowLogFilter: choices.slowLogFilter,
    slowerThan: choices.slowerThan,
    slowLogOrder: choices.slowLogOrder,
    configFilter: choices.configFilter,
  };
}

/** The choices asked to be kept with the tab: `args.choices`, made valid. */
function choicesAsked(args: unknown): Readonly<Record<string, string>> | undefined {
  const asked = typeof args === 'object' && args !== null ? (args as Record<string, unknown>)['choices'] : undefined;
  return typeof asked === 'object' && asked !== null
    ? choicesRecord(choicesOf(asked as Readonly<Record<string, unknown>>))
    : undefined;
}

/**
 * The plan that opens the page of a connection, or makes its tab active, on a section when one is asked for, keeping
 * the choices given with the tab.
 */
export function openPlan(
  context: Context,
  section: ServerSection | undefined,
  choices?: Readonly<Record<string, string>>,
): Outcome {
  const id = targetConnection(context.target) ?? context.state.nav.current;
  const connection = id === undefined ? undefined : savedConnection(context.state.connections, id);
  if (connection?.engine !== 'redis') {
    return run(appPlan(text.openPlan, []));
  }
  return planOf(context.state, {
    shows: connectionPageShows(connection.id, serverPage),
    background: false,
    ...(section === undefined ? {} : { section }),
    ...(choices === undefined ? {} : { memory: { choices } }),
  });
}

/**
 * Feature: server.show — the tree's **Server** and Go to's **Server**, **Server: Overview**, …: the tab of the page.
 * The page itself starts it with `{ section }` when a section is chosen and with `{ choices }` when **Auto**, a filter
 * or a sort changes, so that they are kept with the tab.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const args = answers['args'];
  return openPlan(context, sectionAsked(args), choicesAsked(args));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('server.show'), plan };

/** `server.show:client-id`: `CLIENT ID` on the connection's ordinary client, once when the page opens. */
export const clientIdRead: ReadFeature = {
  kind: 'read',
  id: featureId('server.show:client-id'),
  request: (_context, args) => ({
    kind: 'engine',
    requests: [{ connection: connectionId(textArg(args, 'connection')), request: clientIdRequest() }],
    failedRequests: 'are-replies',
  }),
  parse: (replies) => parseClientId(replies[0]) ?? null,
};
