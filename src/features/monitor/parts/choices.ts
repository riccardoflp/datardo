/**
 * The choices of the Monitor page that are kept with its tab and restored with it (`monitor.show`, "Refreshing"):
 * **Auto**, the toolbar of the Operations section (the filter, **Running ≥**, **Idle connections**, **System
 * operations**), that of the Slow queries section (**Source**, **Database**, **Since**, **By query** or **All**, the
 * filter, the sort of the groups), the database chosen in the Stats section and the sorts of its two tables, the
 * filter, **Operation** and **Last** of the oplog, and the filter and sort of the sharded collections with the filter
 * and **Show** of the recent events. A tab keeps them as text by name, as every tab keeps its memory.
 */
import {
  autoIntervals,
  defaultAuto,
  firstSince,
  sinceChoices,
  type AutoInterval,
  type Grouping,
  type SinceMinutes,
} from './intervals';
import type { OplogOperation } from '../read-oplog';
import type { EventScope } from '../read-sharding-events';
import { text } from '../text';
import type { SlowQuerySource } from '../types';
import type { GroupColumn } from './slow-query-rows';
import type { TableSort } from './tiles';

/** The columns of **Databases** of the Stats section. */
export type DatabaseColumn = keyof typeof text.statistics.databases.columns;

/** The columns of **Collections of …** of the Stats section. */
export type StatsCollectionColumn = keyof typeof text.statistics.collections.columns;

/** The columns of **Sharded collections**. */
export type ShardedColumn = keyof typeof text.sharding.collections.columns;

/** The choices of **Last** of the oplog. */
export const oplogLastChoices = [50, 200, 1000] as const;

/** A choice of **Last**. */
export type OplogLast = (typeof oplogLastChoices)[number];

/** The choices of **Operation** of the oplog, in the order of the list. */
export const oplogOperationChoices: readonly OplogOperation[] = [
  'all-but-noops',
  'insert',
  'update',
  'delete',
  'command',
  'noop',
  'everything',
];

/** What a Monitor page tab keeps of its controls. */
export interface MonitorChoices {
  readonly auto: AutoInterval;
  readonly operationsFilter: string;
  /** **Running ≥**, in seconds. */
  readonly runningAtLeast: number;
  readonly idle: boolean;
  readonly system: boolean;
  readonly source: SlowQuerySource;
  /** The database of **Database**; absent before one is chosen, and for **All databases** of the server log. */
  readonly database?: string;
  readonly since: SinceMinutes;
  readonly grouping: Grouping;
  readonly slowFilter: string;
  /** The sort of the groups, after a click on a header; absent, the largest total first. */
  readonly sort?: TableSort<GroupColumn>;
  /** The database chosen in the Stats section, whose collections are shown. */
  readonly statsDatabase?: string;
  readonly databaseSort?: TableSort<DatabaseColumn>;
  readonly collectionSort?: TableSort<StatsCollectionColumn>;
  readonly oplogText: string;
  readonly oplogOperation: OplogOperation;
  readonly oplogLast: OplogLast;
  /** The filter of **Sharded collections**. */
  readonly shardedFilter: string;
  readonly shardedSort?: TableSort<ShardedColumn>;
  readonly eventsText: string;
  readonly eventsScope: EventScope;
}

/**
 * The choices of a page never shown: **Auto** at 5 s, nothing filtered, the profiler, the last hour, by query, the
 * oplog's entries but no-ops, the last 50, and the migrations, splits and balancer rounds of the events.
 */
export function initialMonitorChoices(): MonitorChoices {
  return {
    auto: defaultAuto,
    operationsFilter: '',
    runningAtLeast: 0,
    idle: false,
    system: false,
    source: 'profiler',
    since: firstSince,
    grouping: 'by-query',
    slowFilter: '',
    oplogText: '',
    oplogOperation: 'all-but-noops',
    oplogLast: 50,
    shardedFilter: '',
    eventsText: '',
    eventsScope: 'balancer',
  };
}

const groupColumns: readonly GroupColumn[] = ['count', 'total', 'average', 'max', 'examined', 'last'];

function columnsOf<Column extends string>(labels: Readonly<Record<Column, string>>): readonly Column[] {
  return Object.keys(labels) as Column[];
}

function sortOfText<Column extends string>(
  kept: string | undefined,
  columns: readonly Column[],
): TableSort<Column> | undefined {
  const [column, direction] = (kept ?? '').split(' ');
  const known = columns.find((each) => each === column);
  return known === undefined ? undefined : { column: known, descending: direction !== 'ascending' };
}

function sortText<Column extends string>(sort: TableSort<Column> | undefined): string {
  return sort === undefined ? '' : `${sort.column} ${sort.descending ? 'descending' : 'ascending'}`;
}

function secondsOf(kept: string | undefined): number {
  const seconds = Number(kept);
  return kept === undefined || kept === '' || !Number.isFinite(seconds) || seconds < 0 ? 0 : seconds;
}

type KeptText = (name: keyof MonitorChoices) => string | undefined;

/** The choices of the Stats, Replication and Sharding sections kept with a tab; those missing are left out. */
function sectionChoicesOf(textOf: KeptText): Partial<MonitorChoices> {
  const database = textOf('statsDatabase');
  const databaseSort = sortOfText(textOf('databaseSort'), columnsOf(text.statistics.databases.columns));
  const collectionSort = sortOfText(textOf('collectionSort'), columnsOf(text.statistics.collections.columns));
  const shardedSort = sortOfText(textOf('shardedSort'), columnsOf(text.sharding.collections.columns));
  const operation = oplogOperationChoices.find((each) => each === textOf('oplogOperation'));
  const last = oplogLastChoices.find((each) => String(each) === textOf('oplogLast'));
  return {
    ...(database === undefined || database === '' ? {} : { statsDatabase: database }),
    ...(databaseSort === undefined ? {} : { databaseSort }),
    ...(collectionSort === undefined ? {} : { collectionSort }),
    ...(operation === undefined ? {} : { oplogOperation: operation }),
    ...(last === undefined ? {} : { oplogLast: last }),
    ...(shardedSort === undefined ? {} : { shardedSort }),
    oplogText: textOf('oplogText') ?? '',
    shardedFilter: textOf('shardedFilter') ?? '',
    eventsText: textOf('eventsText') ?? '',
    eventsScope: textOf('eventsScope') === 'every' ? 'every' : 'balancer',
  };
}

/** The choices kept with a tab, each one that is missing or not valid as it starts. */
export function monitorChoicesOf(kept: Readonly<Record<string, unknown>> | undefined): MonitorChoices {
  const textOf: KeptText = (name) => {
    const value = kept?.[name];
    return typeof value === 'string' ? value : undefined;
  };
  const auto = autoIntervals.find((each) => String(each) === textOf('auto'));
  const since = sinceChoices.find((each) => String(each) === textOf('since'));
  const database = textOf('database');
  const sort = sortOfText(textOf('sort'), groupColumns);
  const initial = initialMonitorChoices();
  return {
    ...initial,
    auto: auto ?? initial.auto,
    operationsFilter: textOf('operationsFilter') ?? '',
    runningAtLeast: secondsOf(textOf('runningAtLeast')),
    idle: textOf('idle') === 'true',
    system: textOf('system') === 'true',
    source: textOf('source') === 'log' ? 'log' : 'profiler',
    ...(database === undefined || database === '' ? {} : { database }),
    since: since ?? initial.since,
    grouping: textOf('grouping') === 'all' ? 'all' : 'by-query',
    slowFilter: textOf('slowFilter') ?? '',
    ...(sort === undefined ? {} : { sort }),
    ...sectionChoicesOf(textOf),
  };
}

/** The choices as the tab keeps them: text by name. */
export function monitorChoicesRecord(choices: MonitorChoices): Readonly<Record<string, string>> {
  return {
    auto: String(choices.auto),
    operationsFilter: choices.operationsFilter,
    runningAtLeast: String(choices.runningAtLeast),
    idle: String(choices.idle),
    system: String(choices.system),
    source: choices.source,
    database: choices.database ?? '',
    since: String(choices.since),
    grouping: choices.grouping,
    slowFilter: choices.slowFilter,
    sort: sortText(choices.sort),
    statsDatabase: choices.statsDatabase ?? '',
    databaseSort: sortText(choices.databaseSort),
    collectionSort: sortText(choices.collectionSort),
    oplogText: choices.oplogText,
    oplogOperation: choices.oplogOperation,
    oplogLast: String(choices.oplogLast),
    shardedFilter: choices.shardedFilter,
    shardedSort: sortText(choices.shardedSort),
    eventsText: choices.eventsText,
    eventsScope: choices.eventsScope,
  };
}

/** The choices asked to be kept with the tab: `args.choices`, made valid; `undefined` when none were asked. */
export function monitorChoicesAsked(args: unknown): Readonly<Record<string, string>> | undefined {
  const asked = typeof args === 'object' && args !== null ? (args as Record<string, unknown>)['choices'] : undefined;
  return typeof asked === 'object' && asked !== null
    ? monitorChoicesRecord(monitorChoicesOf(asked as Readonly<Record<string, unknown>>))
    : undefined;
}
