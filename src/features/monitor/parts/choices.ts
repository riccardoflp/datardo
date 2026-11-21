/**
 * The choices of the Monitor page that are kept with its tab and restored with it (`monitor.show`, "Refreshing"):
 * **Auto**, the toolbar of the Operations section (the filter, **Running ≥**, **Idle connections**, **System
 * operations**) and that of the Slow queries section (**Source**, **Database**, **Since**, **By query** or **All**,
 * the filter, the sort of the groups). A tab keeps them as text by name, as every tab keeps its memory.
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
import type { SlowQuerySource } from '../types';
import type { GroupColumn } from './slow-query-rows';
import type { TableSort } from './tiles';

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
}

/** The choices of a page never shown: **Auto** at 5 s, nothing filtered, the profiler, the last hour, by query. */
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
  };
}

const groupColumns: readonly GroupColumn[] = ['count', 'total', 'average', 'max', 'examined', 'last'];

function sortOfText(kept: string | undefined): TableSort<GroupColumn> | undefined {
  const [column, direction] = (kept ?? '').split(' ');
  const known = groupColumns.find((each) => each === column);
  return known === undefined ? undefined : { column: known, descending: direction !== 'ascending' };
}

function secondsOf(kept: string | undefined): number {
  const seconds = Number(kept);
  return kept === undefined || kept === '' || !Number.isFinite(seconds) || seconds < 0 ? 0 : seconds;
}

/** The choices kept with a tab, each one that is missing or not valid as it starts. */
export function monitorChoicesOf(kept: Readonly<Record<string, unknown>> | undefined): MonitorChoices {
  const textOf = (name: keyof MonitorChoices): string | undefined => {
    const value = kept?.[name];
    return typeof value === 'string' ? value : undefined;
  };
  const auto = autoIntervals.find((each) => String(each) === textOf('auto'));
  const since = sinceChoices.find((each) => String(each) === textOf('since'));
  const database = textOf('database');
  const sort = sortOfText(textOf('sort'));
  const initial = initialMonitorChoices();
  return {
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
    sort:
      choices.sort === undefined
        ? ''
        : `${choices.sort.column} ${choices.sort.descending ? 'descending' : 'ascending'}`,
  };
}

/** The choices asked to be kept with the tab: `args.choices`, made valid; `undefined` when none were asked. */
export function monitorChoicesAsked(args: unknown): Readonly<Record<string, string>> | undefined {
  const asked = typeof args === 'object' && args !== null ? (args as Record<string, unknown>)['choices'] : undefined;
  return typeof asked === 'object' && asked !== null
    ? monitorChoicesRecord(monitorChoicesOf(asked as Readonly<Record<string, unknown>>))
    : undefined;
}
