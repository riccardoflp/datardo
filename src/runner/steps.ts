/**
 * The steps of a plan, one by one (`runner.run`): the guard again before each step that writes, two lines in the Log
 * for each, and what each step says happens when it fails (D31).
 */
import { stepText } from '../features/runner/step-text';
import { runnerText } from '../features/runner/text';
import type { Context, EngineStep, Plan, Step } from '../shared/feature';
import type { RefusalCode } from '../shared/ids';
import { isConsoleAnswer } from '../shared/typed-reply';
import { isFedStep } from '../features/backup/types';
import { Cancelled } from './cancel';
import { FedTally, fedGroup, runFed } from './fed';
import { writeLog } from './log';
import type { ProgressReport, RunnerPorts } from './ports';
import type { RunningWork } from './work';

/** A step refused by the guard while the plan runs: the connection changed since the plan was confirmed. */
export class GuardRefusal extends Error {
  /** Made with the refusal's code, written whole where it is raised. */
  constructor(
    readonly code: RefusalCode,
    message: string,
  ) {
    super(message);
    this.name = 'GuardRefusal';
  }
}

/** How the steps of a plan ended. */
export interface StepsOutcome {
  /** The step that stopped the plan, counted from 0. */
  readonly failed?: { readonly index: number; readonly error: unknown };
  /** The plan was cancelled after this many steps. */
  readonly cancelledAfter?: number;
  /** What the step that was cancelled says of it, in place of how far the plan went (`Cancelled.said`). */
  readonly cancelledSaid?: string;
  /** The steps that failed while the plan went on: their texts. */
  readonly failedOnTheWay: readonly string[];
}

/** How a step of the plan ended: its reply, or the error it failed with. */
export type StepEnded =
  { readonly kind: 'done'; readonly reply: unknown } | { readonly kind: 'failed'; readonly error: unknown };

/** What watches the steps of a plan as they run: the reads before a write and what it did, for redis-oplog. */
export interface StepObserver {
  /** Before the step is sent; what it does is its own to handle, it never stops the plan. */
  readonly before: (step: Step, index: number) => Promise<void>;
  /** Once the step ended, done or failed. */
  readonly after: (step: Step, index: number, ended: StepEnded) => Promise<void>;
}

/** A plan being run: the runner's ports, its context, its work in progress, and what watches its steps. */
export interface Running {
  readonly ports: RunnerPorts;
  readonly context: Context;
  readonly work: RunningWork;
  readonly observer?: StepObserver;
  /** What counts the documents of fed steps; a plan without fed steps has none. */
  readonly tally?: FedTally;
}

/** The refusal the guard gives a step, or none: read-only, a view, not connected (R5.2). */
export function guardStep(ports: RunnerPorts, step: Step): GuardRefusal | undefined {
  if (step.kind !== 'engine' || !step.writes) {
    return undefined;
  }
  const name = ports.connectionName(step.connection);
  if (ports.isConnected?.(step.connection) === false) {
    return new GuardRefusal('runner.run/not-connected' as RefusalCode, runnerText.notConnected(name));
  }
  if (ports.isReadOnly(step.connection)) {
    return new GuardRefusal('runner.run/read-only' as RefusalCode, runnerText.readOnly(name));
  }
  const view = viewOf(ports, step);
  if (view !== undefined) {
    return new GuardRefusal('runner.run/view' as RefusalCode, runnerText.isView(view));
  }
  return undefined;
}

function viewOf(ports: RunnerPorts, step: EngineStep): string | undefined {
  const request = step.request;
  if (request.engine !== 'mongodb' || request.collection === undefined) {
    return undefined;
  }
  return ports.isView?.(step.connection, request.database, request.collection) === true
    ? request.collection
    : undefined;
}

/** Runs fed steps together, each between what its observer does before and after it. */
async function runFedSteps(running: Running, plan: Plan, indexes: readonly number[]): Promise<void> {
  const tally = running.tally ?? new FedTally(running.ports.now());
  for (const index of indexes) {
    const step = plan.steps[index];
    if (step !== undefined) {
      await running.observer?.before(step, index);
    }
  }
  let failure: { error: unknown } | undefined;
  try {
    await runFed(running, plan.steps, indexes, tally);
  } catch (error: unknown) {
    failure = { error };
  }
  for (const index of indexes) {
    const step = plan.steps[index];
    if (step !== undefined) {
      const ended =
        failure === undefined
          ? { kind: 'done' as const, reply: undefined }
          : { kind: 'failed' as const, error: failure.error };
      await running.observer?.after(step, index, ended);
    }
  }
  if (failure !== undefined) {
    throw failure.error;
  }
}

/** Runs one step, or the fed steps that are read with it; gives the indexes it ran. */
async function runAt(running: Running, plan: Plan, index: number): Promise<readonly number[]> {
  const step = plan.steps[index];
  if (step !== undefined && isFedStep(step)) {
    const group = fedGroup(plan.steps, index);
    await runFedSteps(running, plan, group);
    return group;
  }
  if (step !== undefined) {
    running.work.change({ done: index, total: plan.steps.length, unit: 'steps' });
    await observed(running, step, index, () => runStep(running, step, plan.steps.length === 1));
  }
  return [index];
}

/** Runs the steps in order, as each says when it fails; a group that fails stops only itself. */
export async function runSteps(running: Running, plan: Plan): Promise<StepsOutcome> {
  const failedOnTheWay: string[] = [];
  const failedGroups = new Set<string>();
  const ran = new Set<number>();
  for (const [index, step] of plan.steps.entries()) {
    if (running.work.signal.aborted) {
      return { cancelledAfter: index, failedOnTheWay };
    }
    if (ran.has(index) || (step.group !== undefined && failedGroups.has(step.group))) {
      continue;
    }
    try {
      for (const done of await runAt(running, plan, index)) {
        ran.add(done);
      }
    } catch (error: unknown) {
      if (error instanceof GuardRefusal || error instanceof Cancelled) {
        return error instanceof Cancelled
          ? {
              cancelledAfter: index,
              failedOnTheWay,
              ...(error.said === undefined ? {} : { cancelledSaid: error.said }),
            }
          : { failed: { index, error }, failedOnTheWay };
      }
      const handled = await afterFailure(running, step, error);
      if (handled === 'stopped' && step.group === undefined) {
        return { failed: { index, error }, failedOnTheWay };
      }
      failedOnTheWay.push(stepText(step, running.context.target));
      if (handled === 'stopped' && step.group !== undefined) {
        failedGroups.add(step.group);
      }
    }
  }
  return { failedOnTheWay };
}

/** Runs a step between what its observer does before and after it. */
async function observed(running: Running, step: Step, index: number, send: () => Promise<unknown>): Promise<void> {
  const observer = running.observer;
  await observer?.before(step, index);
  let reply: unknown;
  try {
    reply = await send();
  } catch (error: unknown) {
    await observer?.after(step, index, { kind: 'failed', error });
    throw error;
  }
  await observer?.after(step, index, { kind: 'done', reply });
}

async function afterFailure(running: Running, step: Step, error: unknown): Promise<'went-on' | 'stopped'> {
  const onFailure = step.onFailure ?? { kind: 'stop' };
  switch (onFailure.kind) {
    case 'stop':
      return 'stopped';
    case 'go-on':
      return 'went-on';
    case 'instead': {
      const code = (error as { code?: unknown }).code;
      if (onFailure.codes !== undefined && !onFailure.codes.includes(code as string | number)) {
        return 'stopped';
      }
      for (const other of onFailure.steps) {
        await runStep(running, other, false);
      }
      return 'went-on';
    }
  }
}

/** Runs one step, after the guard asks again for a step that writes (R5.2), with its two lines in the Log. */
async function runStep(running: Running, step: Step, onlyStep: boolean): Promise<unknown> {
  const { ports, context, work } = running;
  const refused = guardStep(ports, step);
  if (refused !== undefined) {
    throw refused;
  }
  const connection = step.kind === 'engine' ? ports.connectionName(step.connection) : undefined;
  const feature = context.feature;
  const where = connection === undefined ? {} : { connection };
  writeLog(ports, [{ feature, kind: 'step', text: stepText(step, context.target), ...where }]);
  // A file or an app step that takes long (a download, an upload) reads the signal itself, and stays cancellable.
  if (onlyStep && step.kind === 'engine') {
    work.change({ cannotCancel: runnerText.alreadySent });
  }
  const started = ports.now();
  let reply: unknown;
  try {
    reply = await carryOut(ports, step, work.signal, (change) => {
      work.change(change);
    });
  } catch (error: unknown) {
    const text = error instanceof Error ? error.message : String(error);
    writeLog(ports, [{ feature, kind: 'error', text: `failed: ${text}`, ...where }]);
    throw error;
  }
  writeLog(ports, [{ feature, kind: 'outcome', text: outcomeText(reply, ports.now() - started), ...where }]);
  return reply;
}

/**
 * `done in 12 ms`, or `3 changed in 12 ms` when the reply says how many; for a command of the console answered with
 * an error, which is its reply and not a failure, `error in 12 ms: WRONGTYPE`, its code alone (`console.run`): a reply
 * of the console is never written in the Log (D51).
 */
function outcomeText(reply: unknown, milliseconds: number): string {
  const count = changedCount(reply);
  const time = `in ${String(milliseconds)} ms`;
  if (isConsoleAnswer(reply) && reply.reply.kind === 'error') {
    return `error ${time}: ${reply.reply.message.split(' ', 1)[0] ?? ''}`;
  }
  return count === undefined ? `done ${time}` : `${String(count)} changed ${time}`;
}

/** How many documents or keys a reply says were changed: a Redis integer, or the counts of a MongoDB result. */
export function changedCount(reply: unknown): number | undefined {
  if (typeof reply === 'number' && Number.isInteger(reply)) {
    return reply;
  }
  if (typeof reply !== 'object' || reply === null) {
    return undefined;
  }
  const record = reply as Record<string, unknown>;
  const counts = ['insertedCount', 'modifiedCount', 'deletedCount', 'upsertedCount']
    .map((name) => record[name])
    .filter((value): value is number => typeof value === 'number');
  return counts.length === 0 ? undefined : counts.reduce((sum, value) => sum + value, 0);
}

async function carryOut(
  ports: RunnerPorts,
  step: Step,
  signal: AbortSignal,
  progress: ProgressReport,
): Promise<unknown> {
  switch (step.kind) {
    case 'engine':
      return ports.engines.send({ connection: step.connection, request: step.request }, signal);
    case 'file':
      await ports.files(step, signal, progress);
      return undefined;
    case 'app': {
      const action = ports.appActions.get(step.action);
      if (action === undefined) {
        throw new Error(`Datardo has no action named ${step.action}.`);
      }
      return action(step.args, signal, progress);
    }
  }
}
