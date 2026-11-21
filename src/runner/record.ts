/**
 * Recording a plan in the undo history (`runner.run`, step 3; `undo.record`): before the first step the runner calls
 * `undo.record`, which reads what the plan keeps and may ask whether to go on without undo; after the last step it
 * calls it again with the same answers and what failed, and carries out the plan that saves the operation. A failure to
 * save warns and leaves the write done (R4.5).
 */
import { undoNote } from '../features/undo/note';
import {
  announced,
  recordArgsFor,
  recordArgsJson,
  recordedEntry,
  writeTarget,
} from '../features/undo/plans/record-args';
import { recordText } from '../features/undo/text';
import { entryById } from '../features/undo/state/history';
import { keepsOf, operationId, undoSettings, type UndoEntry } from '../features/undo/types';
import { runnerText } from '../features/runner/text';
import type { Json } from '../shared/engine-request';
import type { After, Answers, AppStep, Context, Plan } from '../shared/feature';
import { featureId } from '../shared/ids';
import { savedConnection } from '../shared/state/connections';
import { targetConnection } from '../shared/target';
import { decide, type Hook } from './decide';
import { writeLog } from './log';
import { notify } from './notify';
import type { RunnerPorts } from './ports';

/** The feature the runner calls around a plan that keeps something. */
const recordFeature = featureId('undo.record');

/** What recording learned before the steps. */
export type Recording =
  | { readonly kind: 'off' }
  | { readonly kind: 'on'; readonly hook: Hook; readonly answers: Answers }
  | { readonly kind: 'cancelled' };

/** What saving the record after the steps gave: the operation added, and what follows it (`undo.limits`). */
export interface Recorded {
  readonly entry?: UndoEntry;
  readonly after: readonly After[];
}

let made = 0;

/** A new operation's identifier: the time in base 36 and a count, which also names its file. */
function newOperationId(now: number): string {
  made = (made + 1) % 1296;
  return `${now.toString(36)}-${made.toString(36).padStart(2, '0')}`;
}

/** The line on undo of a plan's confirmation (`undo.note`): its reason when it cannot be undone, and otherwise the note. */
export function undoLine(plan: Plan, context: Context): string {
  if ('cannot' in plan.undo) {
    return plan.undo.cannot;
  }
  const id = writeTarget(plan)?.connection ?? targetConnection(context.target);
  const connection = id === undefined ? undefined : savedConnection(context.state.connections, id);
  const keeps = keepsOf(plan.undo.keeps);
  if (connection === undefined || keeps === undefined) {
    return runnerText.canBeUndone;
  }
  return undoNote(connection, plan.undo, announced(keeps), undoSettings(context.state.settings)).line;
}

/**
 * Before the first step: the reads of `undo.record`, its question when what is kept is too large, and whether the
 * plan is recorded. Closing the question cancels the plan, with nothing written.
 */
export async function recordBefore(
  ports: RunnerPorts,
  plan: Plan,
  context: Context,
  signal: AbortSignal,
): Promise<Recording> {
  const args = recordArgsFor(plan, operationId(newOperationId(ports.now())));
  if (args === undefined || !ports.features.has(recordFeature)) {
    return { kind: 'off' };
  }
  const hook: Hook = {
    ports,
    context: { ...context, target: writeTarget(plan) ?? context.target, state: ports.state.get() },
    signal,
    // The question is the only one `undo.record` asks: an answer to it is a yes to going on without undo.
    answered: (answers) => ({ ...answers, withoutUndo: true }),
  };
  const decided = await decide(hook, recordFeature, { args: recordArgsJson(args) });
  if (decided.kind !== 'plan') {
    return { kind: 'cancelled' };
  }
  return 'keeps' in decided.plan.undo ? { kind: 'on', hook, answers: decided.answers } : { kind: 'off' };
}

/** After the steps: the plan that saves the operation, carried out; a failure warns and the write stays done. */
export async function recordAfter(
  recording: Recording,
  wrote: { readonly failedIds: readonly Json[]; readonly insertedIds: readonly Json[] },
): Promise<Recorded> {
  if (recording.kind !== 'on') {
    return { after: [] };
  }
  const { hook } = recording;
  const ports = hook.ports;
  try {
    const decided = await decide(
      { ...hook, context: { ...hook.context, now: ports.now(), state: ports.state.get() } },
      recordFeature,
      { ...recording.answers, wrote: { failedIds: [...wrote.failedIds], insertedIds: [...wrote.insertedIds] } },
    );
    if (decided.kind !== 'plan' || decided.plan.steps.length === 0) {
      return { after: [] };
    }
    const size = await saveSteps(ports, decided.plan.steps);
    const entry = recordedEntry(decided.plan, size);
    return { ...(entry === undefined ? {} : { entry }), after: decided.plan.after };
  } catch (error: unknown) {
    const text = error instanceof Error ? error.message : String(error);
    writeLog(ports, [{ feature: recordFeature, kind: 'error', text: `failed: ${text}` }]);
    notify(ports, { feature: recordFeature, level: 'warning', text: recordText.notSaved(text) });
    return { after: [] };
  }
}

/** Carries out the app steps of the saving plan, each with its two lines in the Log; gives the size of the file. */
async function saveSteps(ports: RunnerPorts, steps: Plan['steps']): Promise<number> {
  let size = 0;
  for (const step of steps as readonly AppStep[]) {
    const action = ports.appActions.get(step.action);
    if (action === undefined) {
      throw new Error(`Datardo has no action named ${step.action}.`);
    }
    writeLog(ports, [{ feature: recordFeature, kind: 'step', text: step.text }]);
    const reply = await action(step.args, new AbortController().signal);
    if (typeof reply === 'number') {
      size = reply;
    }
    writeLog(ports, [{ feature: recordFeature, kind: 'outcome', text: 'done' }]);
  }
  return size;
}

/** Whether the operation recorded is still in the history once the limits ran: one too large is dropped at once. */
export function isStillKept(ports: RunnerPorts, entry: UndoEntry | undefined): entry is UndoEntry {
  return entry !== undefined && entryById(ports.state.get().undo, entry.id) !== undefined;
}
