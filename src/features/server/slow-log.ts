/**
 * Feature: server.slow-log
 *
 * The Slow log section of the Server page: the threshold of the server, the commands that took longer, the newest
 * first, with a filter, **Slower than** and **Clear…**. The commands hold no password: `server.read-slow-log` masked
 * them in the main process.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Answers, Context, OperationFeature, Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { characters, groupThousands } from '../../shared/text-units';
import { runnerText } from '../runner/text';
import { commandLine, type SlowLogEntries, type SlowLogEntry, type SlowLogThreshold } from './read-slow-log';
import { openPlan } from './show';
import { text } from './text';
import {
  clockText,
  connectionTarget,
  dayText,
  holdsWithoutCase,
  isSameDay,
  numberOfText,
  sentenceOf,
  startControl,
  valueOf,
  type Inspection,
  type PartRead,
  type ServerControl,
} from './types';

/** A command is cut after 300 characters, as the commands of the Monitor page. */
export const longestCommand = 300;

/** A duration in microseconds: `12.345 ms`; from one second, `1.24 s`. */
export function durationText(microseconds: number): string {
  return microseconds >= 1_000_000
    ? `${(microseconds / 1_000_000).toFixed(2)} s`
    : `${(microseconds / 1000).toFixed(3)} ms`;
}

function trimmed(value: number): string {
  return String(Number(value.toFixed(3)));
}

/** The threshold as a time: `10 ms`, `1.5 ms`, `2 s`. */
export function thresholdTime(microseconds: number): string {
  return microseconds >= 1_000_000 ? `${trimmed(microseconds / 1_000_000)} s` : `${trimmed(microseconds / 1000)} ms`;
}

/** The line of the threshold, or *The threshold is not known:* with the sentence of `server.unavailable`. */
export function thresholdLine(threshold: PartRead<SlowLogThreshold | undefined> | undefined): string | undefined {
  if (threshold?.kind === 'unavailable') {
    return text.slowLog.notKnown(threshold.unavailable.sentence);
  }
  const microseconds = threshold?.value?.microseconds;
  if (microseconds === undefined) {
    return undefined;
  }
  if (microseconds < 0) {
    return text.slowLog.off(String(microseconds));
  }
  return microseconds === 0
    ? text.slowLog.logsEvery
    : text.slowLog.logsSlower(thresholdTime(microseconds), String(microseconds));
}

/** A command on one line, cut at 300 characters with `…`. */
export function cutCommand(command: string): string {
  const units = characters(command);
  return units.length <= longestCommand ? command : `${units.slice(0, longestCommand).join('')}…`;
}

/** The time of an entry: `14:05:09`, with the day for another day than now's, `11-16 14:05:09`. */
export function entryTime(entry: SlowLogEntry, now: number): string {
  const at = entry.time * 1000;
  return isSameDay(at, now) ? clockText(at) : `${dayText(at)} ${clockText(at)}`;
}

/** Whether an entry is shown with the filter and **Slower than** (in milliseconds; empty or 0 for every entry). */
export function isEntryShown(entry: SlowLogEntry, filter: string, slowerThanMs: string): boolean {
  const most = numberOfText(slowerThanMs.trim()) ?? 0;
  if (entry.microseconds <= most * 1000 && most > 0) {
    return false;
  }
  const needle = filter.trim();
  return (
    needle === '' ||
    [entry.command, entry.client, entry.clientName].some((each) => each !== undefined && holdsWithoutCase(each, needle))
  );
}

/** The order of the table: the server's (the newest first), or by **Duration**, the slowest first. */
export type SlowLogOrder = 'server' | 'duration';

/** What the Slow log section is drawn from. */
export interface SlowLogState {
  readonly connection: ConnectionView;
  readonly entries?: PartRead<SlowLogEntries>;
  readonly threshold?: PartRead<SlowLogThreshold | undefined>;
  readonly readAt?: number;
  readonly now: number;
  readonly filter: string;
  /** **Slower than**, in milliseconds, as typed. */
  readonly slowerThanMs: string;
  readonly order: SlowLogOrder;
  /** The id of the entry selected. */
  readonly selected?: number;
  /** Whether **Clear…** runs. */
  readonly clearing: boolean;
}

/** A row of the table. */
export interface SlowLogRow {
  readonly id: number;
  readonly time: string;
  readonly duration: string;
  readonly command: string;
  readonly client: string;
  readonly name: string;
  readonly selected: boolean;
}

/** What the Slow log section shows. */
export interface SlowLogView {
  readonly threshold: { readonly line?: string; readonly toChange: string; readonly openConsole: ServerControl };
  readonly toolbar: {
    readonly filter: { readonly placeholder: string; readonly value: string };
    readonly slowerThan: { readonly label: string; readonly value: string };
    readonly count?: string;
    readonly clear: ServerControl;
  };
  readonly error?: string;
  readonly table?: {
    readonly columns: typeof text.slowLog.columns;
    readonly sortedByDuration: boolean;
    readonly rows: readonly SlowLogRow[];
  };
  /** What is shown in place of the table when the slow log is empty, or when no entry matches. */
  readonly empty?: string;
  readonly note: string;
  readonly inspector?: Inspection & { readonly lines: readonly string[]; readonly copy: ServerControl };
}

function emptyText(threshold: SlowLogThreshold | undefined): string {
  if (threshold === undefined || threshold.microseconds === 0) {
    return text.slowLog.emptyEvery;
  }
  return threshold.microseconds < 0
    ? text.slowLog.nothingLogged
    : text.slowLog.empty(thresholdTime(threshold.microseconds));
}

function countText(read: SlowLogEntries, shown: number, readAt: number): string {
  const length = read.length;
  return length !== undefined && length > read.entries.length
    ? text.slowLog.countOfMore(shown, read.entries.length, length)
    : text.slowLog.count(shown, read.entries.length, clockText(readAt));
}

function clearControl(state: SlowLogState): ServerControl {
  const refused = sentenceOf(state.entries);
  return startControl(text.slowLog.clear, 'server.slow-log-reset@toolbar', 'server.slow-log-reset', {
    target: connectionTarget(state.connection.id),
    disabledBecause: state.connection.readOnly ? runnerText.readOnly(state.connection.name) : refused,
    busy: state.clearing,
  });
}

function inspection(entry: SlowLogEntry): NonNullable<SlowLogView['inspector']> {
  const fields = text.slowLog.fields;
  return {
    title: String(entry.id),
    fields: [
      [fields.id, String(entry.id)],
      [fields.time, `${dayText(entry.time * 1000)} ${clockText(entry.time * 1000)}`],
      [fields.duration, text.slowLog.microseconds(groupThousands(entry.microseconds))],
      [fields.client, entry.client ?? text.missing],
      [fields.name, entry.clientName || text.missing],
    ],
    lines: entry.arguments.map((argument) => commandLine([argument])),
    copy: { kind: 'copy', label: text.slowLog.copyCommand, text: entry.command },
  };
}

function row(entry: SlowLogEntry, state: SlowLogState): SlowLogRow {
  return {
    id: entry.id,
    time: entryTime(entry, state.now),
    duration: durationText(entry.microseconds),
    command: cutCommand(entry.command),
    client: entry.client ?? text.missing,
    name: entry.clientName || text.missing,
    selected: entry.id === state.selected,
  };
}

/** The entries shown, in the order of the table. */
export function shownEntries(state: SlowLogState): readonly SlowLogEntry[] {
  const entries = (valueOf(state.entries)?.entries ?? []).filter((entry) =>
    isEntryShown(entry, state.filter, state.slowerThanMs),
  );
  return state.order === 'duration' ? entries.toSorted((one, other) => other.microseconds - one.microseconds) : entries;
}

/** Feature: server.slow-log — Go to's **Server: Slow log**: the Server page of the connection, on this section. */
export function plan(context: Context, _answers: Answers): Outcome {
  return openPlan(context, 'slow-log');
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('server.slow-log'), plan };

/** Feature: server.slow-log — what the Slow log section shows. */
export function view(state: SlowLogState): SlowLogView {
  const read = valueOf(state.entries);
  const shown = shownEntries(state);
  const selected = read?.entries.find((entry) => entry.id === state.selected);
  const error = sentenceOf(state.entries);
  const line = thresholdLine(state.threshold);
  const empty =
    read === undefined
      ? undefined
      : read.entries.length === 0
        ? emptyText(valueOf(state.threshold))
        : shown.length === 0
          ? text.slowLog.noMatch
          : undefined;
  return {
    threshold: {
      ...(line === undefined ? {} : { line }),
      toChange: text.slowLog.toChange,
      openConsole: startControl(text.slowLog.openConsole, undefined, 'console.show', {
        target: connectionTarget(state.connection.id),
      }),
    },
    toolbar: {
      filter: { placeholder: text.slowLog.filter, value: state.filter },
      slowerThan: { label: text.slowLog.slowerThan, value: state.slowerThanMs },
      ...(read === undefined || state.readAt === undefined
        ? {}
        : { count: countText(read, shown.length, state.readAt) }),
      clear: clearControl(state),
    },
    ...(error === undefined ? {} : { error }),
    ...(read === undefined || read.entries.length === 0
      ? {}
      : {
          table: {
            columns: text.slowLog.columns,
            sortedByDuration: state.order === 'duration',
            rows: shown.map((entry) => row(entry, state)),
          },
        }),
    ...(empty === undefined ? {} : { empty }),
    note: text.slowLog.note,
    ...(selected === undefined ? {} : { inspector: inspection(selected) }),
  };
}
