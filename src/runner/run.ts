/**
 * `runner.run`: runs a plan. Around its steps, in this order: the read-only guard, the confirmation, the steps one by
 * one with what each says happens when it fails, then what follows and the notification. Recording for the undo
 * history and publishing for redis-oplog are added by the milestone that brings them (M11).
 */
import { errorMessage } from '../features/runner/error';
import { stepText } from '../features/runner/step-text';
import { runnerText } from '../features/runner/text';
import type { IntentResult } from '../shared/bridge';
import type { After, Context, NotificationAction, Plan, StartedBy } from '../shared/feature';
import { featureId, type ConnectionId } from '../shared/ids';
import type { Confirmation, ConfirmStep } from '../shared/state/runner';
import { carryOutAfter } from './after';
import { writeLog } from './log';
import { notify, reportRefusal } from './notify';
import type { RunnerPorts } from './ports';
import { runtimeOf } from './runtime';
import { GuardRefusal, guardStep, runSteps, type StepsOutcome } from './steps';

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
  return runtimeOf(ports).queue.run(connections.length === 0 ? ['app'] : connections, () =>
    runConfirmed(ports, plan, context, options),
  );
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
    undoLine: 'cannot' in plan.undo ? plan.undo.cannot : runnerText.canBeUndone,
    ...(plan.touches === undefined ? {} : { touches: plan.touches }),
  };
}

async function runConfirmed(
  ports: RunnerPorts,
  plan: Plan,
  context: Context,
  options: RunOptions,
): Promise<IntentResult> {
  const connections = engineConnections(plan);
  const [first] = connections;
  const work = runtimeOf(ports).work.begin({
    feature: context.feature,
    title: plan.title,
    ...(first === undefined ? {} : { connection: first }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  let outcome: StepsOutcome;
  try {
    outcome = await runSteps({ ports, context, work }, plan);
  } finally {
    for (const connection of connections) {
      ports.state.dispatch({ slice: 'runner', type: 'refresh-asked', connection });
    }
  }
  const result = await ended(ports, { plan, context, options }, outcome);
  work.end(result.kind === 'failed' ? result.message : undefined);
  return result;
}

/** A plan being run, with what it was started with. */
interface PlanRun {
  readonly plan: Plan;
  readonly context: Context;
  readonly options: RunOptions;
}

async function ended(ports: RunnerPorts, planRun: PlanRun, outcome: StepsOutcome): Promise<IntentResult> {
  const { plan, context, options } = planRun;
  if (outcome.cancelledAfter !== undefined) {
    const howFar = runnerText.stoppedAfter(outcome.cancelledAfter, plan.steps.length);
    writeLog(ports, [{ feature: context.feature, kind: 'info', text: `cancelled: ${howFar}` }]);
    notify(ports, { feature: context.feature, level: 'info', text: howFar });
    return { kind: 'cancelled' };
  }
  if (outcome.failed !== undefined) {
    if (outcome.failed.error instanceof GuardRefusal) {
      return refusedBy(ports, context, outcome.failed.error);
    }
    return stopped(ports, plan, context, outcome.failed);
  }
  if (outcome.failedOnTheWay.length > 0) {
    notify(ports, {
      feature: context.feature,
      level: 'warning',
      text: runnerText.stepsFailed(plan.title, outcome.failedOnTheWay),
    });
  }
  await carryOutAfter(ports, context, plan.after, options.startFeature);
  return { kind: 'done' };
}

/** A step failed and stopped the plan: *Stopped at step 3 of 5.* with the error, as a notification of the kind error. */
function stopped(
  ports: RunnerPorts,
  plan: Plan,
  context: Context,
  failed: NonNullable<StepsOutcome['failed']>,
): IntentResult {
  const step = plan.steps[failed.index];
  const connection = step?.kind === 'engine' ? step.connection : undefined;
  const shown = errorMessage(failed.error, {
    ...(connection === undefined ? {} : { connection: ports.connectionName(connection) }),
    ...(step?.kind === 'file' ? { path: step.path } : {}),
  });
  const message = `${runnerText.stoppedAt(failed.index + 1, plan.steps.length)} ${shown.message}`;
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
