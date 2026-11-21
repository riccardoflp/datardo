/**
 * Feature: task.retention — after each successful run, deletes the older files or folders that this task wrote beyond
 * the number kept, and never anything else.
 *
 * An output is recognized by its recorded path and kind only: names, patterns and the content of the folder are
 * never looked at.
 */
import type { Answers, Context, Outcome, Step } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import { planText } from './text';
import type { DiskFacts, ScheduledTask, TaskOutput, TaskState } from './types';
import { appStep, argumentTask, diskOf, nothingToDo, stateOf, tasksOf } from './types';

/**
 * The outputs retention deletes: all but the `keep` newest by the time of their run, of two at the same time the one
 * recorded later being newer; none when `keep` is 0.
 */
export function outputsToDelete(outputs: readonly TaskOutput[], keep: number): readonly TaskOutput[] {
  if (!(keep > 0)) {
    return [];
  }
  const newestFirst = outputs
    .map((output, order) => ({ output, order }))
    .sort((first, second) => second.output.at - first.output.at || second.order - first.order);
  return newestFirst.slice(Math.floor(keep)).map(({ output }) => output);
}

/** The writer of the main process that carries out a `delete` of retention (`FileStep.content`). */
export const retentionWriter = 'task.retention';

/** What retention does with the outputs it chose: those it deletes, and those it only drops from the list. */
export interface RetentionChoice {
  readonly deletes: readonly TaskOutput[];
  /** No longer there, or now a folder where a file was recorded (or a file where a folder was): left alone. */
  readonly drops: readonly TaskOutput[];
}

/** The outputs chosen by {@link outputsToDelete}, split by what the disk holds at their paths. */
export function retentionChoice(outputs: readonly TaskOutput[], keep: number, disk: DiskFacts): RetentionChoice {
  const chosen = outputsToDelete(outputs, keep);
  const isAsRecorded = (output: TaskOutput): boolean => {
    const kind = disk.at?.[output.path];
    return kind === undefined || kind === (output.folder ? 'folder' : 'file');
  };
  return { deletes: chosen.filter(isAsRecorded), drops: chosen.filter((output) => !isAsRecorded(output)) };
}

/**
 * The steps of retention: `delete <path>` for each output deleted, each going on when it fails (the path stays in the
 * list and is tried again after the next run), then the list of outputs saved without them. The main process drops
 * from the list each path of `deleted` that is no longer there, and every path of `dropped`.
 */
export function retentionSteps(task: ScheduledTask, choice: RetentionChoice): readonly Step[] {
  if (choice.deletes.length === 0 && choice.drops.length === 0) {
    return [];
  }
  return [
    ...choice.deletes.map((output): Step => ({
      kind: 'file',
      action: 'delete',
      path: output.path,
      // The main process deletes a recorded output only while it is still of the kind recorded: a folder with
      // everything in it, or a file.
      content: { writer: retentionWriter, args: { task: task.id, folder: output.folder } },
      text: planText.delete(output.path),
      onFailure: { kind: 'go-on' },
    })),
    appStep(
      'task.forget-outputs',
      {
        task: task.id,
        deleted: choice.deletes.map((output) => output.path),
        dropped: choice.drops.map((output) => output.path),
      },
      planText.forgetOutputs(task.name),
    ),
  ];
}

/** A path that retention could not delete, and why. */
export interface DeleteError {
  readonly path: string;
  readonly error: string;
}

/** What retention did, as the main process saw it once its steps ran. */
export interface RetentionResult {
  /** The paths it deleted. */
  readonly deleted: readonly string[];
  /** The paths it dropped from the list without deleting them. */
  readonly dropped: readonly string[];
  readonly errors: readonly DeleteError[];
}

/**
 * The state once retention ran: the outputs deleted or dropped are no longer in the list (one that could not be
 * deleted stays), and the newest run says `<n> old outputs deleted` and *Could not delete <path>: <error>*.
 */
export function afterRetention(state: TaskState, result: RetentionResult): TaskState {
  const gone = new Set([...result.deleted, ...result.dropped]);
  const [newest, ...older] = state.runs;
  const outputs = state.outputs.filter((output) => !gone.has(output.path));
  if (newest === undefined) {
    return { ...state, outputs };
  }
  const notes = [
    ...(newest.note === undefined ? [] : [newest.note]),
    ...result.errors.map((each) => planText.couldNotDelete(each.path, each.error)),
  ];
  const run = {
    ...newest,
    ...(result.deleted.length > 0 ? { deleted: result.deleted.length } : {}),
    ...(notes.length > 0 ? { note: notes.join('. ') } : {}),
  };
  return { ...state, outputs, runs: [run, ...older] };
}

/**
 * Feature: task.retention — `args.task` is the task; `answers.disk` what is at each output's path. The plan deletes
 * the outputs beyond **Keep** and saves the list without them; nothing to do with **Keep** at 0.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const task = argumentTask(context.state, answers);
  if (task === undefined) {
    return nothingToDo(planText.retentionTitle(''), planText.cannotUndoRetention);
  }
  const state = stateOf(tasksOf(context.state), task.id);
  const steps = retentionSteps(task, retentionChoice(state.outputs, task.keep, diskOf(answers)));
  return run({
    title: planText.retentionTitle(task.name),
    steps,
    danger: noDanger,
    undo: { cannot: planText.cannotUndoRetention },
    publishes: false,
    after: [],
  });
}
