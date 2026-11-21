/**
 * Feature: task.show — the Scheduled tasks page: the tasks with when they run, the next run and the last result,
 * and, for a task, its last 20 runs with what they wrote.
 */
import type { ConnectionColor, ConnectionView } from '../../shared/connection';
import type { OperationFeature } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { pathStep } from '../transfer/ask/choose-path';
import type { SettingsState } from '../../shared/state/settings';
import { groupThousands } from '../../shared/text-units';
import { nextTaskRun } from './due';
import { writesFolder } from './file-names';
import { describeSchedule, whenText } from './next-runs';
import { formatLabels, pageText } from './text';
import { keepsRunning } from './tray';
import type { PageMessage, RunStatus, ScheduledTask, TaskId, TaskRun, TaskState, TasksState } from './types';
import { argumentsOf, stateOf } from './types';

/** What the page is drawn from. */
export interface ShowState {
  readonly tasks: TasksState;
  /** The saved connections, for their names and colors. */
  readonly connections: readonly ConnectionView[];
  readonly settings: SettingsState;
  readonly now: number;
}

/** The source of a task: its connection's name and color, or that the connection was removed. */
export interface SourceView {
  readonly text: string;
  readonly color?: ConnectionColor;
  /** Shown in the error color. */
  readonly removed: boolean;
}

/** The last run as the list shows it. */
export interface LastRunView {
  /** `done`, `failed`…, `running`, or `never`. */
  readonly status: RunStatus | 'running' | 'never';
  readonly text: string;
  readonly when?: string;
  /** For a successful run its numbers, for a failed one its error, while running what it is doing. */
  readonly details?: string;
}

/** **Run now**, or **Cancel** while the task runs. */
export type RunButton =
  | { readonly kind: 'run'; readonly label: string; readonly tooltip: string; readonly element: 'task.run@list' }
  | { readonly kind: 'cancel'; readonly label: string; readonly tooltip: string; readonly element: 'task.cancel@list' };

/** A run in the details of a task. */
export interface RunRowView {
  readonly started: string;
  readonly how: string;
  readonly status: RunStatus;
  readonly result: string;
  readonly details: string;
  /** The file or folder it wrote: a link that shows it in the file manager, greyed once retention deleted it. */
  readonly output?: {
    readonly name: string;
    readonly path: string;
    readonly deleted: boolean;
    readonly tooltip?: string;
  };
}

/** The details of a task, shown while open. */
export interface DetailsView {
  readonly facts: readonly string[];
  /** *No runs yet.* when it has none. */
  readonly noRuns?: string;
  readonly runs: readonly RunRowView[];
}

/** One task of the list. */
export interface ItemView {
  readonly id: TaskId;
  readonly enabled: {
    readonly on: boolean;
    readonly tooltip: string;
    readonly element: 'task.enable@list';
  };
  /** Greyed while disabled. */
  readonly greyed: boolean;
  readonly name: string;
  /** `Backup, Archive (.agz)`, `Export, CSV`. */
  readonly kind: string;
  readonly source: SourceView;
  readonly schedule: string;
  readonly next: string;
  readonly last: LastRunView;
  readonly button: RunButton;
  readonly menu: readonly {
    readonly label: string;
    readonly element: 'task.edit@item-menu' | 'task.delete@item-menu';
    readonly tooltip?: string;
  }[];
  /** A double click edits the task. */
  readonly open: 'task.edit@list';
  readonly details?: DetailsView;
}

/** The Scheduled tasks page. */
export interface ShowView {
  readonly toolbar: {
    readonly summary: string;
    readonly newTask: { readonly label: string; readonly element: 'task.edit@toolbar' };
  };
  /** *Tasks run while Datardo is open.* with **Keep running in the tray**, which opens the setting. */
  readonly trayNote?: {
    readonly text: string;
    readonly link: string;
    readonly setting: 'datardo.task.keepRunningInTray';
  };
  readonly message?: PageMessage;
  /** The page without tasks. */
  readonly empty?: {
    readonly text: string;
    readonly newTask: { readonly label: string; readonly element: 'task.edit@empty-state' };
  };
  readonly items: readonly ItemView[];
}

/** A size as the cards write it: `512 B`, `1.5 KB`, `12 MB`. */
export function sizeText(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const shown = value < 10 && unit > 0 ? value.toFixed(1) : String(Math.round(value));
  return `${shown} ${units[unit] ?? 'B'}`;
}

/** A duration: `12.4 s`, `3 min 20 s`, `1 h 5 min`. */
export function durationText(milliseconds: number): string {
  const seconds = milliseconds / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  return minutes < 60
    ? `${String(minutes)} min ${String(Math.round(seconds % 60))} s`
    : `${String(Math.floor(minutes / 60))} h ${String(minutes % 60)} min`;
}

const plural = (count: number, what: string): string => `${groupThousands(count)} ${what}${count === 1 ? '' : 's'}`;

/** What a run did: `2 collections, 1,200 documents, 3.4 MB, 12.4 s` for a successful one, its error otherwise. */
export function runSummary(run: TaskRun): string {
  if (run.status !== 'done') {
    return run.error ?? '';
  }
  return [
    ...(run.collections === undefined ? [] : [plural(run.collections, 'collection')]),
    plural(run.documents ?? 0, 'document'),
    sizeText(run.size ?? 0),
    durationText(run.end - run.start),
  ].join(', ');
}

/** The source of a task: `Local › shop.orders`, `Local › shop (all collections)`, `Local › all databases`. */
export function sourceView(task: ScheduledTask, connections: readonly ConnectionView[]): SourceView {
  const what =
    task.collection !== undefined && task.database !== undefined
      ? `${task.database}.${task.collection}`
      : task.database !== undefined
        ? task.kind === 'backup'
          ? pageText.allCollections(task.database)
          : task.database
        : pageText.allDatabases;
  const connection = connections.find((each) => each.id === task.connection && each.engine === task.engine);
  if (connection === undefined) {
    return { text: `${pageText.removedConnection} › ${what}`, removed: true };
  }
  return {
    text: `${connection.name} › ${what}`,
    removed: false,
    ...(connection.color === undefined ? {} : { color: connection.color }),
  };
}

function lastRun(state: TaskState, progress: string | undefined, running: boolean, now: number): LastRunView {
  if (running) {
    return { status: 'running', text: pageText.running, details: progress ?? pageText.starting };
  }
  const last = state.runs[0];
  if (last === undefined) {
    return { status: 'never', text: pageText.never };
  }
  const details = runSummary(last);
  return {
    status: last.status,
    text: pageText.statuses[last.status],
    when: whenText(last.start, now),
    ...(details === '' ? {} : { details }),
  };
}

/** The facts at the top of the details of a task. */
export function facts(task: ScheduledTask): readonly string[] {
  const query = [
    ...(task.filter === undefined ? [] : [pageText.filter(task.filter)]),
    ...(task.projection === undefined ? [] : [pageText.projection(task.projection)]),
  ];
  const keeps =
    task.keep > 0
      ? writesFolder(task)
        ? pageText.keepsFolders(task.keep)
        : pageText.keepsFiles(task.keep)
      : pageText.keepsAll;
  return [
    pageText.writes(formatLabels[task.format], task.folder, task.pattern),
    ...(task.kind === 'export' && query.length > 0 ? [pageText.query(query.join(', '))] : []),
    keeps,
    ...(task.runMissed ? [pageText.missedRuns] : []),
  ];
}

function fileName(path: string): string {
  return path.split(/[\\/]/u).at(-1) ?? path;
}

function runRow(run: TaskRun, state: TaskState, now: number): RunRowView {
  const details = [
    runSummary(run),
    ...(run.deleted === undefined || run.deleted === 0 ? [] : [pageText.oldOutputs(run.deleted)]),
    ...(run.note === undefined ? [] : [run.note]),
  ]
    .filter((part) => part !== '')
    .join('. ');
  const output = run.output;
  const deleted = output !== undefined && !state.outputs.some((each) => each.path === output);
  return {
    started: whenText(run.start, now),
    how: pageText.triggers[run.trigger],
    status: run.status,
    result: pageText.statuses[run.status],
    details,
    ...(output === undefined
      ? {}
      : {
          output: {
            name: fileName(output),
            path: output,
            deleted,
            ...(deleted ? { tooltip: pageText.deletedByRetention } : {}),
          },
        }),
  };
}

function details(task: ScheduledTask, state: TaskState, now: number): DetailsView {
  return {
    facts: facts(task),
    ...(state.runs.length === 0 ? { noRuns: pageText.noRuns } : {}),
    runs: state.runs.map((each) => runRow(each, state, now)),
  };
}

function runButton(running: boolean): RunButton {
  return running
    ? { kind: 'cancel', label: pageText.cancel, tooltip: pageText.cancelTooltip, element: 'task.cancel@list' }
    : { kind: 'run', label: pageText.runNow, tooltip: pageText.runNowTooltip, element: 'task.run@list' };
}

function item(task: ScheduledTask, state: ShowState): ItemView {
  const taskState = stateOf(state.tasks, task.id);
  const progress = state.tasks.running[task.id];
  const running = progress !== undefined;
  const next = nextTaskRun(task, taskState);
  return {
    id: task.id,
    enabled: {
      on: task.enabled,
      tooltip: task.enabled ? pageText.enabledTooltip : pageText.disabledTooltip,
      element: 'task.enable@list',
    },
    greyed: !task.enabled,
    name: task.name,
    kind: pageText.kind(task.kind === 'backup' ? 'Backup' : 'Export', formatLabels[task.format]),
    source: sourceView(task, state.connections),
    schedule: describeSchedule(task.schedule),
    next: next === undefined || running ? pageText.noNextRun : whenText(next, state.now),
    last: lastRun(taskState, progress?.progress, running, state.now),
    button: runButton(running),
    menu: [
      { label: pageText.edit, element: 'task.edit@item-menu' },
      { label: pageText.delete, element: 'task.delete@item-menu', tooltip: pageText.deleteTooltip },
    ],
    open: 'task.edit@list',
    ...(state.tasks.open.includes(task.id) ? { details: details(task, taskState, state.now) } : {}),
  };
}

/** `1 task running`, `2 tasks running`, for the status line; empty when none runs. */
export function runningText(tasks: TasksState): string {
  const count = Object.keys(tasks.running).length;
  return count === 0 ? '' : pageText.tasksRunning(count);
}

/**
 * Feature: task.show — the page: the toolbar, the note about the tray, the last message, then the tasks in the order
 * they were created, or the empty state. A task of a connection that is not MongoDB is not listed.
 */
export function view(state: ShowState): ShowView {
  const tasks = state.tasks.tasks.filter((task) => task.engine === 'mongodb');
  const enabled = tasks.filter((task) => task.enabled).length;
  const showsNote = enabled > 0 && !keepsRunning(state.settings, tasks);
  return {
    toolbar: {
      summary: pageText.summary(tasks.length, enabled),
      newTask: { label: pageText.newTask, element: 'task.edit@toolbar' },
    },
    ...(showsNote
      ? { trayNote: { text: pageText.trayNote, link: pageText.trayLink, setting: 'datardo.task.keepRunningInTray' } }
      : {}),
    ...(state.tasks.message === undefined ? {} : { message: state.tasks.message }),
    ...(tasks.length === 0
      ? { empty: { text: pageText.empty, newTask: { label: pageText.newTask, element: 'task.edit@empty-state' } } }
      : {}),
    items: tasks.map((task) => item(task, state)),
  };
}

/**
 * Feature: task.show — opening the page: no step; what follows shows the one **Scheduled tasks** tab of the app. With
 * `args.reveal`, the output of a run (a link of the page, **Reveal** of a notification) is shown in the system's file
 * manager instead (`transfer.reveal-path`).
 */
export const open: OperationFeature = {
  kind: 'operation',
  id: featureId('task.show'),
  plan: (_context, answers) => {
    const reveal = argumentsOf(answers)['reveal'];
    const revealed = typeof reveal === 'string' && reveal !== '';
    return run({
      title: pageText.title,
      steps: revealed ? [pathStep('reveal', reveal)] : [],
      danger: noDanger,
      undo: { cannot: pageText.opensNothing },
      publishes: false,
      after: revealed ? [] : [{ kind: 'open', page: 'tasks' }],
    });
  },
};
