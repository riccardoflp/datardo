/**
 * Carries out an intent (architecture, "From an action to its effect"): builds the context, calls the feature again
 * and again with what has been learned, asks, reads, refuses or runs, as the feature says.
 */
import { errorMessage } from '../features/runner/error';
import { runnerText } from '../features/runner/text';
import type { Intent, IntentResult } from '../shared/bridge';
import type {
  After,
  Answers,
  Context,
  OperationFeature,
  Outcome,
  ReadFeature,
  ReadNeed,
  ReadRequest,
  StartedBy,
} from '../shared/feature';
import type { Json } from '../shared/engine-request';
import type { RefusalCode } from '../shared/ids';
import { carryOutAfter } from './after';
import { Cancelled, unlessCancelled } from './cancel';
import { writeLog } from './log';
import { notify, reportRefusal } from './notify';
import type { ProgressReport, RunnerPorts } from './ports';
import { runPlan } from './run';
import { sendRead } from './read';
import { runtimeOf } from './runtime';

/** How many times a feature may ask or read before the runner stops it, so that a mistake cannot loop forever. */
const mostRounds = 50;

/** The intent of a feature started by what follows a plan or a read: its target and its arguments. */
function startedAfter(after: Extract<After, { kind: 'start' }>): Intent {
  return { feature: after.feature, target: after.target, ...(after.args === undefined ? {} : { args: after.args }) };
}

/** Who starts the feature, and what else cancels it. */
export interface StartOptions {
  readonly startedBy?: StartedBy;
  readonly signal?: AbortSignal;
}

/** Starts the feature an intent names and carries it out to its end. */
export async function start(ports: RunnerPorts, intent: Intent, options: StartOptions = {}): Promise<IntentResult> {
  const feature = ports.features.get(intent.feature);
  if (feature === undefined) {
    return { kind: 'failed', message: `Datardo has no feature named ${intent.feature}.` };
  }
  const context: Context = {
    feature: intent.feature,
    now: ports.now(),
    platform: ports.platform,
    startedBy: options.startedBy ?? 'user',
    target: intent.target,
    state: ports.state.get(),
    ...(intent.place === undefined ? {} : { place: intent.place }),
  };
  const session: Session = { ports, context, ...(options.signal === undefined ? {} : { signal: options.signal }) };
  try {
    if (feature.kind === 'read') {
      return await startRead(session, feature, intent.args ?? null, 'with-after');
    }
    return await startOperation(session, feature, intent.args ?? null);
  } catch (error: unknown) {
    return failed(session, error);
  }
}

/** A feature being carried out: the runner's ports, its context, and what else cancels it. */
interface Session {
  readonly ports: RunnerPorts;
  readonly context: Context;
  readonly signal?: AbortSignal;
}

function failed(session: Session, error: unknown): IntentResult {
  const { ports, context } = session;
  if (error instanceof Cancelled) {
    writeLog(ports, [{ feature: context.feature, kind: 'info', text: 'cancelled' }]);
    return { kind: 'cancelled' };
  }
  const shown = errorMessage(error);
  writeLog(ports, [{ feature: context.feature, kind: 'error', text: shown.details }]);
  // The MCP server answers its tool with the error; a scheduled task's run notifies by `task.notify`.
  if (context.startedBy === 'user') {
    notify(ports, { feature: context.feature, level: 'error', text: shown.message, details: shown.details });
  }
  return { kind: 'failed', message: shown.message, details: shown.details };
}

async function startOperation(session: Session, feature: OperationFeature, args: Json): Promise<IntentResult> {
  let answers: Answers = { args };
  for (let round = 0; round < mostRounds; round += 1) {
    const outcome = feature.plan(session.context, answers);
    const next = await follow(session, outcome);
    if (next.kind === 'result') {
      return next.result;
    }
    answers = { ...answers, ...next.learned };
  }
  return { kind: 'failed', message: `${feature.id} asked more than ${String(mostRounds)} times.` };
}

type Followed =
  { readonly kind: 'result'; readonly result: IntentResult } | { readonly kind: 'learned'; readonly learned: Answers };

async function follow(session: Session, outcome: Outcome): Promise<Followed> {
  const { ports, context } = session;
  switch (outcome.kind) {
    case 'refuse':
      reportRefusal(
        ports,
        { feature: context.feature, code: outcome.code, message: outcome.message },
        context.startedBy,
      );
      return { kind: 'result', result: { kind: 'refused', code: outcome.code, message: outcome.message } };
    case 'ask':
      return ask(session, outcome.question);
    case 'read': {
      const result = await readNeed(session, outcome.need);
      return result.kind === 'read'
        ? { kind: 'learned', learned: { [outcome.need.key]: result.result } }
        : { kind: 'result', result };
    }
    case 'run': {
      const result = await runPlan(ports, outcome.plan, context, {
        startedBy: context.startedBy,
        ...(session.signal === undefined ? {} : { signal: session.signal }),
        startFeature: (after) => start(ports, startedAfter(after)),
      });
      return { kind: 'result', result };
    }
  }
}

/** `runner.ask`: the question in a dialog, or a refusal when a tool of the MCP server asked. */
async function ask(session: Session, question: Extract<Outcome, { kind: 'ask' }>['question']): Promise<Followed> {
  const { ports, context } = session;
  if (context.startedBy === 'mcp') {
    const code = 'runner.ask/needs-a-person' as RefusalCode;
    reportRefusal(ports, { feature: context.feature, code, message: runnerText.needsAPerson }, 'mcp');
    return { kind: 'result', result: { kind: 'refused', code, message: runnerText.needsAPerson } };
  }
  const answered = await ports.dialogs.ask(context.feature, question);
  return answered === undefined
    ? { kind: 'result', result: { kind: 'cancelled' } }
    : { kind: 'learned', learned: answered };
}

async function readNeed(session: Session, need: ReadNeed): Promise<IntentResult> {
  const feature = session.ports.features.get(need.read);
  if (feature?.kind !== 'read') {
    return { kind: 'failed', message: `Datardo has no read named ${need.read}.` };
  }
  const context = { ...session.context, feature: need.read };
  return startRead({ ...session, context }, feature, need.args, 'without-after');
}

async function startRead(
  session: Session,
  feature: ReadFeature,
  args: Json,
  after: 'with-after' | 'without-after',
): Promise<IntentResult> {
  const { ports, context } = session;
  const request = feature.request(context, args);
  if (isOutcome(request)) {
    const followed = await follow(session, request);
    return followed.kind === 'result' ? followed.result : { kind: 'failed', message: `${feature.id} cannot ask here.` };
  }
  const work = runtimeOf(ports).work.begin({
    feature: context.feature,
    title: context.feature,
    ...(session.signal === undefined ? {} : { signal: session.signal }),
  });
  let result: unknown;
  try {
    const progress: ProgressReport = (change) => {
      work.change(change);
    };
    result = feature.parse(await unlessCancelled(sendRead(ports, request, work.signal, progress), work.signal), args);
  } finally {
    work.end();
  }
  if (after === 'with-after' && feature.after !== undefined) {
    await carryOutAfter(ports, context, feature.after(result, context), (next) => start(ports, startedAfter(next)));
  }
  return { kind: 'read', result };
}

function isOutcome(value: ReadRequest | Outcome): value is Outcome {
  return value.kind !== 'engine' && value.kind !== 'app';
}
