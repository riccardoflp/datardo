/**
 * Feature: monitor.slow-queries
 *
 * The Slow queries section of the Monitor page: the slow operations a server recorded, from the profiler of one
 * database or from the server log, as one row per query shape (**By query**) or one per operation (**All**). `view`
 * says what the toolbar, the line of what is recorded, the controls of the profiler or of the threshold, the table
 * and the inspector island show, from what `monitor.read-slow-queries` read and the choices of the toolbar. Ported
 * from Mongoster's `src/webview/monitor.ts › renderProfile`, `renderGroups`, `renderOperations`, `profileDetail`.
 */
import type { Json } from '../../shared/engine-request';
import { groupKey, slowQueryGroups, type SlowQueryGroup } from './group-slow-queries';
import type { PartRead } from './parts/failure';
import { inspectorOf, type SlowQueryInspector } from './parts/slow-query-inspector';
import {
  firstGroupSort,
  groupMatches,
  groupRow,
  operationMatches,
  operationRow,
  sortedGroups,
  type GroupColumn,
  type GroupRow,
  type OperationRow,
} from './parts/slow-query-rows';
import type { SectionControl, TableSort } from './parts/tiles';
import { countText } from './parts/units';
import {
  defaultSlowMs,
  mostProfilerOperations,
  type ProfilerState,
  type SlowQueriesList,
  type SlowQueriesRead,
} from './read-slow-queries';
import { errorLineOf } from './show';
import { text } from './text';
import type { SlowQuery, SlowQuerySource } from './types';

/** The choices of **Since**, in minutes, in their order; 0 is **All**. */
export const sinceChoices = [15, 60, 1440, 0] as const;

/** A choice of **Since**. */
export type SinceMinutes = (typeof sinceChoices)[number];

/** **Since** to start with: 1 hour. */
export const firstSince: SinceMinutes = 60;

/** **By query** or **All**. */
export type Grouping = 'by-query' | 'all';

/** The databases the profiler is not chosen on to start with. */
const serverDatabases = new Set(['admin', 'local', 'config']);

/** What the section is drawn from. */
export interface SlowQueriesState {
  readonly connection: {
    readonly id: string;
    readonly name: string;
    readonly readOnly: boolean;
    readonly mongos: boolean;
  };
  /** The server's version, as connecting found it: the server log is read from 4.4. */
  readonly version?: string;
  readonly source: SlowQuerySource;
  /** The database chosen; absent for **All databases** of the server log. */
  readonly database?: string;
  /** The databases of the **Database** list, as read when the page opened. */
  readonly databases: readonly string[];
  readonly since: SinceMinutes;
  readonly grouping: Grouping;
  readonly filter: string;
  readonly sort?: TableSort<GroupColumn>;
  /** What the last read gave, and the arguments it was sent with. */
  readonly read?: SlowQueriesRead;
  readonly readArgs?: Json;
  /** The namespaces that are views. */
  readonly views?: readonly string[];
  /** The selected row: a group by its key, or an operation by its place in what was read. */
  readonly selected?: { readonly group: string } | { readonly operation: number };
}

/** A list of the toolbar. */
export interface Choice<Value> {
  readonly label: string;
  readonly value: Value;
  readonly choices: readonly { readonly value: Value; readonly label: string }[];
}

/** What the section shows. */
export interface SlowQueriesView {
  readonly toolbar: {
    readonly source: Choice<SlowQuerySource> & { readonly note?: string };
    readonly database: Choice<string | undefined>;
    readonly since: Choice<SinceMinutes>;
    readonly grouping: Choice<Grouping>;
    readonly filter: { readonly placeholder: string; readonly value: string };
  };
  /** The line of what is recorded and found. */
  readonly recording?: string;
  readonly profiler?: ProfilerControls;
  readonly logThreshold?: LogThresholdControl;
  /** *The server log lists slow queries in a form Datardo reads from MongoDB 4.4: use the profiler.* */
  readonly note?: string;
  readonly columns: readonly string[];
  readonly groups?: readonly GroupRow[];
  readonly operations?: readonly OperationRow[];
  readonly empty?: string;
  readonly error?: string;
  readonly inspector?: SlowQueryInspector;
}

/** The controls of the profiler: **Profile** with its levels, the threshold, **Apply** and **Clear**. */
export interface ProfilerControls {
  readonly label: string;
  readonly levels: readonly { readonly value: 0 | 1 | 2; readonly label: string }[];
  readonly level: number;
  readonly slowerThan: string;
  readonly slowMs: number;
  readonly unit: string;
  /** `monitor.set-profiler`, with the values read: the view of the section puts the chosen ones in. */
  readonly apply: SectionControl;
  readonly clear: SectionControl;
}

/** The control of the threshold of the server log. */
export interface LogThresholdControl {
  readonly label: string;
  readonly slowMs: number;
  readonly unit: string;
  /** `monitor.set-log-threshold`, with the threshold read. */
  readonly apply: SectionControl;
}

/** The database chosen to start with: for the profiler the first that is not `admin`, `local` or `config`. */
export function firstDatabase(source: SlowQuerySource, databases: readonly string[]): string | undefined {
  return source === 'log' ? undefined : databases.find((name) => !serverDatabases.has(name));
}

/** Whether a server's version is older than 4.4. */
export function isOlderThan44(version: string | undefined): boolean {
  const [major, minor] = (version ?? '').split('.').map(Number);
  if (major === undefined || minor === undefined || Number.isNaN(major) || Number.isNaN(minor)) {
    return false;
  }
  return major < 4 || (major === 4 && minor < 4);
}

function toolbarOf(state: SlowQueriesState): SlowQueriesView['toolbar'] {
  const words = text.slow;
  const sources = state.connection.mongos
    ? [{ value: 'log' as const, label: words.serverLog }]
    : [
        { value: 'profiler' as const, label: words.profiler },
        { value: 'log' as const, label: words.serverLog },
      ];
  const databases = state.databases.map((name) => ({ value: name, label: name }));
  return {
    source: {
      label: words.source,
      value: state.source,
      choices: sources,
      ...(state.connection.mongos ? { note: words.mongos } : {}),
    },
    database: {
      label: words.database,
      value: state.database,
      choices: state.source === 'log' ? [{ value: undefined, label: words.allDatabases }, ...databases] : databases,
    },
    since: {
      label: words.since,
      value: state.since,
      choices: sinceChoices.map((value) => ({ value, label: words.sinceChoices[value] })),
    },
    grouping: {
      label: '',
      value: state.grouping,
      choices: [
        { value: 'by-query', label: words.byQuery },
        { value: 'all', label: words.all },
      ],
    },
    filter: { placeholder: words.filter, value: state.filter },
  };
}

function recordingStart(source: SlowQuerySource, profiler: ProfilerState): string {
  const ms = countText(profiler.slowMs);
  if (source === 'log') {
    return text.slow.recording.log(ms);
  }
  if (profiler.level === 0) {
    return text.slow.recording.off;
  }
  return profiler.level === 2 ? text.slow.recording.every : text.slow.recording.slower(ms);
}

/** The line of what is recorded and found: *Recording operations slower than 100 ms · 42 operations · 7 queries*. */
export function recordingLine(
  read: SlowQueriesRead,
  grouping: Grouping,
  groups: readonly SlowQueryGroup[],
): string | undefined {
  if (read.profiler.kind !== 'read') {
    return undefined;
  }
  const parts = [recordingStart(read.source, read.profiler.value)];
  if (read.operations?.kind === 'read') {
    const list = read.operations.value;
    parts.push(text.slow.operations(list.operations.length));
    if (grouping === 'by-query') {
      parts.push(text.slow.queries(groups.length));
    }
    if (list.more) {
      parts.push(text.slow.latest(countText(mostProfilerOperations)));
    }
    if (list.olderLinesDropped) {
      parts.push(text.slow.olderLines);
    }
  }
  return parts.join(' · ');
}

function readOnlyText(state: SlowQueriesState): string | undefined {
  return state.connection.readOnly ? text.readOnly(state.connection.name) : undefined;
}

function disabled(reason: string | undefined): object {
  return reason === undefined ? {} : { disabledBecause: reason };
}

function profilerControls(state: SlowQueriesState, profiler: ProfilerState): ProfilerControls | undefined {
  const words = text.slow.profile;
  const database = state.database;
  if (state.source !== 'profiler' || database === undefined || state.connection.mongos) {
    return undefined;
  }
  const readOnly = readOnlyText(state);
  const connection = state.connection.id;
  return {
    label: words.label,
    levels: [
      { value: 0, label: words.off },
      { value: 1, label: words.slow },
      { value: 2, label: words.every },
    ],
    level: profiler.level,
    slowerThan: words.slowerThan,
    slowMs: profiler.slowMs,
    unit: words.ms,
    apply: {
      label: words.apply,
      element: 'monitor.set-profiler@toolbar',
      feature: 'monitor.set-profiler',
      args: { connection, database, level: profiler.level, slowMs: profiler.slowMs },
      ...disabled(readOnly),
    },
    clear: {
      label: words.clear,
      element: 'monitor.clear-profiler@toolbar',
      feature: 'monitor.clear-profiler',
      args: { connection, database },
      ...disabled(readOnly),
    },
  };
}

function logThresholdControl(state: SlowQueriesState, profiler: ProfilerState): LogThresholdControl | undefined {
  if (state.source !== 'log') {
    return undefined;
  }
  return {
    label: text.slow.logThreshold.label,
    slowMs: profiler.slowMs,
    unit: text.slow.profile.ms,
    apply: {
      label: text.slow.profile.apply,
      element: 'monitor.set-log-threshold@toolbar',
      feature: 'monitor.set-log-threshold',
      args: { connection: state.connection.id, slowMs: profiler.slowMs },
      ...disabled(readOnlyText(state)),
    },
  };
}

/** The empty sentence when no row is shown: the filter, the server log, the profiler off, or nothing recorded. */
export function emptyText(state: SlowQueriesState, read: SlowQueriesRead, list: SlowQueriesList): string {
  const words = text.slow.empty;
  if (list.operations.length > 0) {
    return words.filtered;
  }
  const since = words.since[state.since];
  const profiler = read.profiler.kind === 'read' ? read.profiler.value : undefined;
  if (read.source === 'log') {
    return words.log(countText(profiler?.slowMs ?? defaultSlowMs), since);
  }
  return profiler?.level === 0 ? words.profilerOff : words.nothing(since);
}

function errorOf(read: SlowQueriesRead): string | undefined {
  const command = read.source === 'log' || read.database === undefined ? 'getLog' : 'find';
  if (read.operations?.kind === 'failed') {
    return errorLineOf(command, read.operations.failure);
  }
  return read.profiler.kind === 'failed' ? errorLineOf('profile', read.profiler.failure) : undefined;
}

/** The operations read, or none. */
function listOf(read: PartRead<SlowQueriesList> | undefined): SlowQueriesList {
  return read?.kind === 'read' ? read.value : { operations: [], more: false, olderLinesDropped: false };
}

function selectedInspector(
  state: SlowQueriesState,
  operations: readonly SlowQuery[],
  groups: readonly SlowQueryGroup[],
): SlowQueryInspector | undefined {
  const selected = state.selected;
  if (selected === undefined) {
    return undefined;
  }
  const input = {
    connection: state.connection.id,
    ...(state.connection.readOnly ? { readOnly: text.readOnly(state.connection.name) } : {}),
    views: state.views ?? [],
    reread: state.readArgs ?? null,
  };
  if ('group' in selected) {
    const group = groups.find((each) => each.key === selected.group);
    return group === undefined ? undefined : inspectorOf(group.example, group, true, input);
  }
  const operation = operations[selected.operation];
  if (operation === undefined) {
    return undefined;
  }
  const key = groupKey(operation);
  return inspectorOf(
    operation,
    groups.find((each) => each.key === key),
    false,
    input,
  );
}

/** Feature: monitor.slow-queries — the toolbar, the line, the controls, the rows and the selected row. */
export function view(state: SlowQueriesState): SlowQueriesView {
  const read = state.read;
  const list = listOf(read?.operations);
  const groups = slowQueryGroups(list.operations);
  const byQuery = state.grouping === 'by-query';
  const shownGroups = sortedGroups(
    groups.filter((group) => groupMatches(group, state.filter)),
    state.sort ?? firstGroupSort,
  );
  const shownOperations = list.operations.flatMap((operation, index) =>
    operationMatches(operation, state.filter) ? [operationRow(operation, index)] : [],
  );
  const shown = byQuery ? shownGroups.length : shownOperations.length;
  const profiler = read?.profiler.kind === 'read' ? read.profiler.value : undefined;
  const controls = profiler === undefined ? {} : controlsOf(state, profiler);
  const recording = read === undefined ? undefined : recordingLine(read, state.grouping, groups);
  const error = read === undefined ? undefined : errorOf(read);
  const inspector = selectedInspector(state, list.operations, groups);
  const readList = read?.operations?.kind === 'read';
  return {
    toolbar: toolbarOf(state),
    ...(recording === undefined ? {} : { recording }),
    ...controls,
    ...(state.source === 'log' && isOlderThan44(state.version) ? { note: text.slow.tooOld } : {}),
    columns: Object.values(byQuery ? text.slow.groupColumns : text.slow.operationColumns),
    ...(byQuery ? { groups: shownGroups.map(groupRow) } : { operations: shownOperations }),
    ...(read !== undefined && readList && shown === 0 ? { empty: emptyText(state, read, list) } : {}),
    ...(error === undefined ? {} : { error }),
    ...(inspector === undefined ? {} : { inspector }),
  };
}

function controlsOf(
  state: SlowQueriesState,
  profiler: ProfilerState,
): Pick<SlowQueriesView, 'profiler' | 'logThreshold'> {
  const forProfiler = profilerControls(state, profiler);
  const forLog = logThresholdControl(state, profiler);
  return {
    ...(forProfiler === undefined ? {} : { profiler: forProfiler }),
    ...(forLog === undefined ? {} : { logThreshold: forLog }),
  };
}
