/**
 * `runner.run`: runs a plan. Around its steps, in this order: the read-only guard, the confirmation, recording what
 * the undo history keeps (`undo.record`), the steps one by one with what each says happens when it fails, saving the
 * record, publishing for redis-oplog (`oplog.publish`), then the limits of the undo history, what follows and the
 * notification, with **Undo** when the write was recorded (`undo.notification`).
 */
import { errorMessage } from '../features/runner/error';
import { stepText } from '../features/runner/step-text';
import { runnerText } from '../features/runner/text';
import { view as notificationView } from '../features/undo/notification';
import type { UndoEntry } from '../features/undo/types';
import type { IntentResult } from '../shared/bridge';
import type { After, Context, NotificationAction, Plan, StartedBy } from '../shared/feature';
import { featureId, type ConnectionId } from '../shared/ids';
import type { Confirmation, ConfirmStep } from '../shared/state/runner';
import { carryOutAfter } from './after';
import { writeLog } from './log';
import { notify, reportRefusal } from './notify';
import type { RunnerPorts } from './ports';
import { Publishing } from './publish';
import { isStillKept, recordAfter, recordBefore, undoLine, type Recorded } from './record';
import { endUndoing, revertStopped, startUndoing } from './revert';
import { runtimeOf } from './runtime';
import { fedRunOf, fedSummaryOf, recordFedRun } from './fed-record';
import { GuardRefusal, guardStep, runSteps, type StepObserver, type StepsOutcome } from './steps';
import { PlanWatch } from './watch';
import type { OperationId } from '../shared/state/undo';

/** How a plan is run: who started it, what else cancels it, and how a feature it starts after is started. */
export interface RunOptions {
  readonly startedBy: StartedBy;
  readonly signal?: AbortSignal;
  readonly startFeature: (after: Extract<After, { kind: 'start' }>) => Promise<unknown>;
}

/** Feature: runner.run. Runs a plan the feature returned, after the guard and the confirmation its danger asks for. */
export async function runPlan(
  ports: RunnerPorts,
  plan: Plan,
  context: Context,
  options: RunOptions,
): Promise<IntentResult> {
  const refused = plan.steps.map((step) => guardStep(ports, step)).find((refusal) => refusal !== undefined);
  if (refused !== undefined) {
    return refusedBy(ports, context, refused);
  }
  if (plan.danger.kind !== 'none') {
    const confirmed = await ports.dialogs.confirm(context.feature, confirmationOf(plan, context));
    if (!confirmed) {
      return { kind: 'cancelled' };
    }
  }
  const connections = engineConnections(plan);
  const ran = await runtimeOf(ports).queue.run(connections.length === 0 ? ['app'] : connections, () =>
    runConfirmed(ports, plan, context, options),
  );
  // What follows is carried out once the plan has left its queue: a feature it starts queues behind it otherwise.
  // The limits of the undo history come first, so that an operation they drop at once offers no Undo.
  await carryOutAfter(ports, context, ran.recorded.after, options.startFeature);
  const entry = isStillKept(ports, ran.recorded.entry) ? ran.recorded.entry : undefined;
  // A plan with fed steps ends with the message of its card, done, cancelled or failed, with Undo when it recorded.
  if (ran.summary !== undefined) {
    await carryOutAfter(ports, context, withUndo(ran.summary, entry, true), options.startFeature);
  }
  if (ran.result.kind === 'done') {
    await carryOutAfter(
      ports,
      context,
      ran.summary === undefined ? withUndo(plan.after, entry) : plan.after,
      options.startFeature,
    );
  }
  return ran.result;
}

/** What follows, with **Undo** first in the notification of a write that recorded an operation (`undo.notification`). */
function withUndo(afters: readonly After[], entry: UndoEntry | undefined, warnings = false): readonly After[] {
  if (entry === undefined) {
    return afters;
  }
  let added = false;
  return afters.map((after) => {
    const offered =
      after.kind === 'notify' &&
      (after.level === 'success' || after.level === 'info' || (warnings && after.level === 'warning'));
    if (added || after.kind !== 'notify' || !offered) {
      return after;
    }
    added = true;
    const shown = notificationView({ text: after.text, level: after.level, recorded: entry });
    return {
      ...after,
      actions: [...shown.actions, ...(after.actions ?? [])].slice(0, 2),
      ...(shown.element === undefined ? {} : { element: shown.element }),
    };
  });
}

/** What the confirmation shows of a plan (`runner.confirm`). */
export function confirmationOf(plan: Plan, context: Context): Confirmation {
  if (plan.danger.kind === 'none') {
    throw new Error('A plan whose danger is None is not confirmed.');
  }
  const steps = plan.steps.map((step): ConfirmStep => {
    const onFailure = step.onFailure;
    return {
      text: stepText(step, context.target),
      ...(step.group === undefined ? {} : { group: step.group }),
      ...(onFailure?.kind === 'instead'
        ? { instead: onFailure.steps.map((other) => stepText(other, context.target)) }
        : {}),
      ...(onFailure?.kind === 'go-on' ? { goOn: true } : {}),
    };
  });
  return {
    title: plan.title,
    danger: plan.danger,
    steps,
    undoLine: undoLine(plan, context),
    ...(plan.touches === undefined ? {} : { touches: plan.touches }),
  };
}

/** How a plan ran: its result, and what its record in the undo history gave. */
interface Ran {
  readonly result: IntentResult;
  readonly recorded: Recorded;
  /** The message that ends a plan with fed steps, which takes the place of the runner's own. */
  readonly summary?: readonly After[] | undefined;
}

/** The observer of a plan's steps and the tally of its fed steps, one after the other. */
function bothObservers(watch: StepObserver, tally: StepObserver): StepObserver {
  return {
    before: async (step, index) => {
      await watch.before(step, index);
      await tally.before(step, index);
    },
    after: async (step, index, ended) => {
      await watch.after(step, index, ended);
      await tally.after(step, index, ended);
    },
  };
}

async function runConfirmed(ports: RunnerPorts, plan: Plan, context: Context, options: RunOptions): Promise<Ran> {
  const connections = engineConnections(plan);
  const [first] = connections;
  const work = runtimeOf(ports).work.begin({
    feature: context.feature,
    title: plan.title,
    ...(first === undefined ? {} : { connection: first }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  const operation = startUndoing(ports, plan);
  try {
    const recording = await recordBefore(ports, plan, context, work.signal);
    if (recording.kind === 'cancelled') {
      work.end();
      return { result: { kind: 'cancelled' }, recorded: { after: [] } };
    }
    const publishing = Publishing.of(ports, plan, context, work.signal);
    const watch = new PlanWatch(publishing);
    const fed = fedRunOf(ports, plan, context);
    const observer = fed === undefined ? watch : bothObservers(watch, fed.tally);
    let outcome: StepsOutcome;
    try {
      outcome = await runSteps(
        { ports, context, work, observer, ...(fed === undefined ? {} : { tally: fed.tally }) },
        plan,
      );
    } finally {
      for (const connection of connections) {
        ports.state.dispatch({ slice: 'runner', type: 'refresh-asked', connection });
      }
    }
    const recorded = await recordAfter(recording, {
      failedIds: watch.failedIds(plan),
      insertedIds: [...watch.insertedIds(plan), ...(fed?.tally.insertedIds() ?? [])],
    });
    const fedRecorded = await recordFedRun(ports, context, plan, fed);
    await publishing?.publish();
    const recordedCount = (recorded.entry === undefined ? 0 : 1) + fedRecorded.length;
    const summary = fedSummaryOf(ports, { context, plan }, fed, { outcome, recorded: recordedCount });
    const result = ended(ports, { plan, context, operation, summary }, outcome);
    work.end(result.kind === 'failed' ? result.message : undefined);
    // Undo is offered in the message when one operation was recorded; several are undone from the Undo history.
    const fedEntries = fedRecorded.flatMap((each) => (each.entry === undefined ? [] : [each.entry]));
    const entry = recorded.entry ?? (fedEntries.length === 1 ? fedEntries[0] : undefined);
    const after = [...recorded.after, ...fedRecorded.flatMap((each) => each.after)];
    return { result, recorded: { ...(entry === undefined ? {} : { entry }), after }, summary };
  } catch (error: unknown) {
    work.end(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    endUndoing(ports, operation);
  }
}

/** A plan being run, what it was started on, and the operation it undoes, when it is an undo. */
interface PlanRun {
  readonly plan: Plan;
  readonly context: Context;
  readonly operation: OperationId | undefined;
  /** The message of the card that ends a plan with fed steps; the runner then says nothing of its own. */
  readonly summary?: readonly After[] | undefined;
}

function ended(ports: RunnerPorts, planRun: PlanRun, outcome: StepsOutcome): IntentResult {
  const { plan, context } = planRun;
  const quiet = planRun.summary !== undefined || ports.endsWithOwnMessage?.(plan) === true;
  if (outcome.cancelledAfter !== undefined) {
    const howFar = runnerText.stoppedAfter(outcome.cancelledAfter, plan.steps.length);
    writeLog(ports, [{ feature: context.feature, kind: 'info', text: `cancelled: ${howFar}` }]);
    if (!quiet) {
      notify(ports, { feature: context.feature, level: 'info', text: howFar });
    }
    return { kind: 'cancelled' };
  }
  if (outcome.failed !== undefined) {
    if (outcome.failed.error instanceof GuardRefusal) {
      return refusedBy(ports, context, outcome.failed.error);
    }
    return (
      revertStopped(ports, context, { plan, operation: planRun.operation }, outcome.failed) ??
      stopped(ports, { plan, context, quiet }, outcome.failed)
    );
  }
  if (outcome.failedOnTheWay.length > 0) {
    notify(ports, {
      feature: context.feature,
      level: 'warning',
      text: runnerText.stepsFailed(plan.title, outcome.failedOnTheWay),
    });
  }
  return { kind: 'done' };
}

/** A step failed and stopped the plan: *Stopped at step 3 of 5.* with the error, as a notification of the kind error. */
function stopped(
  ports: RunnerPorts,
  ran: { readonly plan: Plan; readonly context: Context; readonly quiet: boolean },
  failed: NonNullable<StepsOutcome['failed']>,
): IntentResult {
  const { plan, context, quiet } = ran;
  const step = plan.steps[failed.index];
  const connection = step?.kind === 'engine' ? step.connection : undefined;
  const shown = errorMessage(failed.error, {
    ...(connection === undefined ? {} : { connection: ports.connectionName(connection) }),
    ...(step?.kind === 'file' ? { path: step.path } : {}),
  });
  const message = `${runnerText.stoppedAt(failed.index + 1, plan.steps.length)} ${shown.message}`;
  if (quiet) {
    writeLog(ports, [{ feature: context.feature, kind: 'error', text: message }]);
    return { kind: 'failed', message, details: shown.details };
  }
  notify(ports, {
    feature: context.feature,
    level: 'error',
    text: message,
    details: shown.details,
    ...(shown.kind === 'not connected' && connection !== undefined ? { actions: [reconnect(connection)] } : {}),
  });
  return { kind: 'failed', message, details: shown.details };
}

/** **Reconnect**, offered with an error of the kind *not connected* (`runner.error`). */
export function reconnect(connection: ConnectionId): NotificationAction {
  return {
    label: runnerText.reconnect,
    feature: featureId('connection.connect'),
    target: { kind: 'connection', connection },
  };
}

function refusedBy(ports: RunnerPorts, context: Context, refusal: GuardRefusal): IntentResult {
  reportRefusal(ports, { feature: context.feature, code: refusal.code, message: refusal.message }, context.startedBy);
  return { kind: 'refused', code: refusal.code, message: refusal.message };
}

function engineConnections(plan: Plan): readonly ConnectionId[] {
  const all = plan.steps.flatMap((step) => {
    const instead = step.onFailure?.kind === 'instead' ? step.onFailure.steps : [];
    return [step, ...instead];
  });
  return [...new Set(all.flatMap((step) => (step.kind === 'engine' ? [step.connection] : [])))];
}
