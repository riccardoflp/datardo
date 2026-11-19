/**
 * Feature: task.run — runs a task at its time, or now with **Run now**, without asking anything: a backup or an
 * export written as a new file or folder in the task's folder, then retention.
 *
 * The plan is made just before the run, from the task and its state in the app's state and from what the main
 * process found on disk (`answers.disk`). The main process records the run in the task's state as the steps run, with
 * {@link startedRun}, {@link finishedRun} and `afterRetention`.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Json } from '../../shared/engine-request';
import type { Answers, Context, FileStep, Outcome, Platform } from '../../shared/feature';
import { noDanger, refuse, run } from '../../shared/feature';
import { savedConnection } from '../../shared/state/connections';
import { addRun, dueRun } from './due';
import { freeName, outputExtension, outputName, writesFolder } from './file-names';
import { previousRun, timeText } from './next-runs';
import { retentionChoice, retentionSteps } from './retention';
import { planText } from './text';
import type { DiskFacts, RunInProgress, RunTrigger, ScheduledTask, TaskOutput, TaskRun, TaskState } from './types';
import { appStep, argumentTask, argumentsOf, diskFactsOf, isRunning, nothingToDo, stateOf, tasksOf } from './types';

const triggers: readonly RunTrigger[] = ['schedule', 'manual', 'missed'];

/** A path in a folder, with the separator of the system. */
export function pathIn(folder: string, name: string, platform: Platform): string {
  const separator = platform === 'windows' ? '\\' : '/';
  return /[\\/]$/u.test(folder) ? `${folder}${name}` : `${folder}${separator}${name}`;
}

/** The connection a task runs on, when it is still saved with the task's engine. */
function connectionOf(context: Context, task: ScheduledTask): ConnectionView | undefined {
  const connection = savedConnection(context.state.connections, task.connection);
  return connection?.engine === task.engine ? connection : undefined;
}

/** What the file step writes: the backup of `backup.create` or the export of `transfer.export`. */
function written(task: ScheduledTask): NonNullable<FileStep['content']> {
  const source = {
    task: task.id,
    connection: task.connection,
    database: task.database ?? null,
    collection: task.collection ?? null,
    format: task.format,
  };
  if (task.kind === 'backup') {
    return { writer: 'backup.create', args: source };
  }
  return {
    writer: 'transfer.export',
    args: { ...source, filter: task.filter ?? '', projection: task.projection ?? '', batchSize: 1000 },
  };
}

/** The scheduled time a run is for, or undefined when a run of the schedule is no longer due. */
function slotOf(task: ScheduledTask, state: TaskState, trigger: RunTrigger, now: number): number | null | undefined {
  if (trigger === 'manual') {
    return null;
  }
  const due = dueRun(task, state, now);
  const expected = trigger === 'schedule' ? 'run' : 'missed';
  return due.kind === expected ? due.slot : undefined;
}

/** Why a run of the task cannot start, or undefined when it can. */
function refusal(context: Context, task: ScheduledTask, disk: DiskFacts): Outcome | undefined {
  if (isRunning(tasksOf(context.state), task.id)) {
    return refuse('task.run/running', planText.alreadyRunning(task.name));
  }
  if (connectionOf(context, task) === undefined) {
    return refuse('task.run/no-connection', planText.connectionRemoved);
  }
  if (task.kind === 'export' && (task.database === undefined || task.collection === undefined)) {
    return refuse('task.run/invalid', planText.exportNeedsCollection);
  }
  if (disk.folder === 'missing') {
    return refuse('task.run/no-folder', planText.noFolder(task.folder));
  }
  return undefined;
}

/** The new output of a run that starts at `now`, named by `task.file-names`, with a number when the name exists. */
export function newOutput(context: Context, task: ScheduledTask, connectionName: string, disk: DiskFacts): TaskOutput {
  const taken = new Set(disk.taken ?? []);
  const name = freeName(outputName(task, context.now, connectionName), outputExtension(task.format), (candidate) =>
    taken.has(candidate),
  );
  return { path: pathIn(task.folder, name, context.platform), at: context.now, size: 0, folder: writesFolder(task) };
}

/**
 * The plan of a run of the task, started by `trigger`: also the plan `task.missed` runs late. Nothing to do when a
 * run of the schedule is no longer due.
 */
export function runPlan(context: Context, task: ScheduledTask, trigger: RunTrigger, disk: DiskFacts): Outcome {
  const refused = refusal(context, task, disk);
  if (refused !== undefined) {
    return refused;
  }
  const state = stateOf(tasksOf(context.state), task.id);
  const slot = slotOf(task, state, trigger, context.now);
  const connection = connectionOf(context, task);
  if (slot === undefined || connection === undefined) {
    return nothingToDo(planText.runTitle(task.name), planText.cannotUndoRun);
  }
  const output = newOutput(context, task, connection.name, disk);
  const record: Json = { task: task.id, trigger, slot, start: context.now, output: output.path, folder: output.folder };
  const write: FileStep = {
    kind: 'file',
    action: 'write',
    path: output.path,
    content: written(task),
    text: planText.write(output.path),
  };
  return run({
    title: planText.runTitle(task.name),
    steps: [
      appStep('task.start-run', { task: task.id, trigger, slot, start: context.now }, planText.startRun(task.name)),
      write,
      appStep('task.record-run', record, planText.recordRun(task.name)),
      ...retentionSteps(task, retentionChoice([...state.outputs, output], task.keep, disk)),
    ],
    danger: noDanger,
    undo: { cannot: planText.cannotUndoRun },
    publishes: false,
    after: [],
  });
}

/**
 * Feature: task.run — `args` is `{ task, trigger }`: the task, and `schedule` (the scheduler's check), `missed` (a run
 * missed, run late) or `manual` (**Run now**, the default). `answers.disk` is what the main process found on disk.
 * The plan: `start the run of "<name>"`, `write <folder>\<name>`, `record the run of "<name>"`, then retention.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const task = argumentTask(context.state, answers);
  if (task === undefined) {
    return nothingToDo(planText.runTitle(''), planText.cannotUndoRun);
  }
  const asked = argumentsOf(answers)['trigger'];
  const trigger = triggers.find((each) => each === asked) ?? 'manual';
  return runPlan(context, task, trigger, diskFactsOf(answers['disk']));
}

/**
 * The state when a run starts: the run in progress, and the scheduled time handled. A run still recorded in progress
 * was cut short when Datardo was closed: it is logged as failed with *Interrupted: Datardo was closed during the run*.
 * A run refused when it starts (`refusedRunStatus`) is recorded the same way, then ended with {@link finishedRun}.
 */
export function startedRun(state: TaskState, started: RunInProgress): TaskState {
  const logged =
    state.running === undefined
      ? state
      : addRun(state, {
          start: state.running.start,
          end: started.start,
          trigger: state.running.trigger,
          status: 'failed',
          error: planText.interrupted,
        });
  return {
    ...logged,
    ...(started.slot === undefined ? {} : { lastSlot: Math.max(started.slot, logged.lastSlot ?? started.slot) }),
    running: started,
  };
}

/** How a run ended, as the main process saw it. */
export type RunEnd =
  | {
      readonly kind: 'done';
      readonly output: TaskOutput;
      readonly documents: number;
      readonly collections?: number;
      readonly note?: string;
    }
  | { readonly kind: 'failed' | 'skipped'; readonly error: string }
  | { readonly kind: 'cancelled' };

function runOf(running: RunInProgress, ended: RunEnd, end: number): TaskRun {
  const base = { start: running.start, end, trigger: running.trigger };
  switch (ended.kind) {
    case 'done':
      return {
        ...base,
        status: 'done',
        output: ended.output.path,
        size: ended.output.size,
        documents: ended.documents,
        ...(ended.collections === undefined ? {} : { collections: ended.collections }),
        ...(ended.note === undefined ? {} : { note: ended.note }),
      };
    case 'failed':
    case 'skipped':
      return { ...base, status: ended.kind, error: ended.error };
    case 'cancelled':
      return { ...base, status: 'cancelled', error: planText.cancelled };
  }
}

/**
 * The state when a run ends at `end`: the run in the log, the output of a successful one in the list of outputs
 * (before retention), and the scheduled times that came while it ran handled, the run saying *The run due at <time>
 * was skipped: this one was still going*.
 */
export function finishedRun(task: ScheduledTask, state: TaskState, ended: RunEnd, end: number): TaskState {
  const running = state.running ?? { start: end, trigger: 'manual' };
  const latest = previousRun(task.schedule, end);
  const skipped =
    latest !== undefined && latest > running.start && latest > (state.lastSlot ?? Number.NEGATIVE_INFINITY);
  const logged = runOf(running, ended, end);
  const notes = [logged.note, skipped ? planText.skippedMeanwhile(timeText(latest)) : undefined].filter(
    (note): note is string => note !== undefined,
  );
  const { running: _ended, ...rest } = state;
  return addRun(
    {
      ...rest,
      ...(skipped ? { lastSlot: latest } : {}),
      outputs: ended.kind === 'done' ? [...state.outputs, ended.output] : state.outputs,
    },
    notes.length > 0 ? { ...logged, note: notes.join('. ') } : logged,
  );
}

/**
 * How a refusal of `task.run` is logged: as a skipped run when the connection was removed or cannot be reached, not
 * at all when the task is already running, and as a failed run otherwise.
 */
export function refusedRunStatus(code: string): 'failed' | 'skipped' | undefined {
  switch (code) {
    case 'task.run/running':
      return undefined;
    case 'task.run/no-connection':
    case 'task.run/not-connected':
      return 'skipped';
    default:
      return 'failed';
  }
}
