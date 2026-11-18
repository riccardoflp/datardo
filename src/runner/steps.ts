/**
 * The steps of a plan, one by one (`runner.run`): the guard again before each step that writes, two lines in the Log
 * for each, and what each step says happens when it fails (D31).
 */
import { stepText } from '../features/runner/step-text';
import { runnerText } from '../features/runner/text';
import type { Context, EngineStep, Plan, Step } from '../shared/feature';
import type { RefusalCode } from '../shared/ids';
import { Cancelled } from './cancel';
import { writeLog } from './log';
import type { RunnerPorts } from './ports';
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
  /** The steps that failed while the plan went on: their texts. */
  readonly failedOnTheWay: readonly string[];
}

/** A plan being run: the runner's ports, its context, and its work in progress. */
export interface Running {
  readonly ports: RunnerPorts;
  readonly context: Context;
  readonly work: RunningWork;
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

/** Runs the steps in order, as each says when it fails; a group that fails stops only itself. */
export async function runSteps(running: Running, plan: Plan): Promise<StepsOutcome> {
  const failedOnTheWay: string[] = [];
  const failedGroups = new Set<string>();
  for (const [index, step] of plan.steps.entries()) {
    if (running.work.signal.aborted) {
      return { cancelledAfter: index, failedOnTheWay };
    }
    if (step.group !== undefined && failedGroups.has(step.group)) {
      continue;
    }
    running.work.change({ done: index, total: plan.steps.length, unit: 'steps' });
    try {
      await runStep(running, step, plan.steps.length === 1);
    } catch (error: unknown) {
      if (error instanceof GuardRefusal || error instanceof Cancelled) {
        return error instanceof Cancelled
          ? { cancelledAfter: index, failedOnTheWay }
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
async function runStep(running: Running, step: Step, onlyStep: boolean): Promise<void> {
  const { ports, context, work } = running;
  const refused = guardStep(ports, step);
  if (refused !== undefined) {
    throw refused;
  }
  const connection = step.kind === 'engine' ? ports.connectionName(step.connection) : undefined;
  const feature = context.feature;
  const where = connection === undefined ? {} : { connection };
  writeLog(ports, [{ feature, kind: 'step', text: stepText(step, context.target), ...where }]);
  if (onlyStep) {
    work.change({ cannotCancel: runnerText.alreadySent });
  }
  const started = ports.now();
  let reply: unknown;
  try {
    reply = await carryOut(ports, step, work.signal);
  } catch (error: unknown) {
    const text = error instanceof Error ? error.message : String(error);
    writeLog(ports, [{ feature, kind: 'error', text: `failed: ${text}`, ...where }]);
    throw error;
  }
  writeLog(ports, [{ feature, kind: 'outcome', text: outcomeText(reply, ports.now() - started), ...where }]);
}

/** `done in 12 ms`, or `3 changed in 12 ms` when the reply says how many. */
function outcomeText(reply: unknown, milliseconds: number): string {
  const count = changedCount(reply);
  const time = `in ${String(milliseconds)} ms`;
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

async function carryOut(ports: RunnerPorts, step: Step, signal: AbortSignal): Promise<unknown> {
  switch (step.kind) {
    case 'engine':
      return ports.engines.send({ connection: step.connection, request: step.request }, signal);
    case 'file':
      await ports.files(step, signal);
      return undefined;
    case 'app': {
      const action = ports.appActions.get(step.action);
      if (action === undefined) {
        throw new Error(`Datardo has no action named ${step.action}.`);
      }
      return action(step.args, signal);
    }
  }
}
