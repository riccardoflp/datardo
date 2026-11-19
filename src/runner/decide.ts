/**
 * Carries out a feature the runner calls by itself around a plan (`undo.record`, `oplog.publish`): calls it again and
 * again with what it learned, sends its reads and asks its questions, until it returns a plan, which is given back to
 * the caller to run as it must, or refuses.
 */
import { runnerText } from '../features/runner/text';
import type { Answers, Context, Outcome, Plan, ReadNeed } from '../shared/feature';
import type { FeatureId, RefusalCode } from '../shared/ids';
import { sendRead } from './read';
import type { RunnerPorts } from './ports';

/** How many times a hook may ask or read before the runner stops it. */
const mostRounds = 50;

/** What a hook ended with: its plan and the answers that made it, a question closed, or a refusal. */
export type Decided =
  | { readonly kind: 'plan'; readonly plan: Plan; readonly answers: Answers }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'refused'; readonly code: RefusalCode; readonly message: string };

/** A hook being decided: the ports, its context, what cancels its reads, and what an answered question adds. */
export interface Hook {
  readonly ports: RunnerPorts;
  readonly context: Context;
  readonly signal: AbortSignal;
  /** What the answers of a question become before the feature is called again. */
  readonly answered?: (answers: Answers) => Answers;
}

/** Calls the hook's feature until it returns a plan or a refusal; a question closed ends it. */
export async function decide(hook: Hook, feature: FeatureId, given: Answers): Promise<Decided> {
  const found = hook.ports.features.get(feature);
  if (found?.kind !== 'operation') {
    throw new Error(`Datardo has no operation named ${feature}.`);
  }
  const context = { ...hook.context, feature };
  let answers = given;
  for (let round = 0; round < mostRounds; round += 1) {
    const outcome = found.plan(context, answers);
    const next = await follow(hook, context, outcome);
    if (next.kind !== 'learned') {
      return next.kind === 'plan' ? { kind: 'plan', plan: next.plan, answers } : next;
    }
    answers = { ...answers, ...next.learned };
  }
  throw new Error(`${feature} asked more than ${String(mostRounds)} times.`);
}

type Followed =
  | { readonly kind: 'learned'; readonly learned: Answers }
  | { readonly kind: 'plan'; readonly plan: Plan }
  | Exclude<Decided, { kind: 'plan' }>;

async function follow(hook: Hook, context: Context, outcome: Outcome): Promise<Followed> {
  switch (outcome.kind) {
    case 'run':
      return { kind: 'plan', plan: outcome.plan };
    case 'refuse':
      return { kind: 'refused', code: outcome.code, message: outcome.message };
    case 'read':
      return { kind: 'learned', learned: { [outcome.need.key]: await readFor(hook, context, outcome.need) } };
    case 'ask': {
      if (context.startedBy === 'mcp') {
        return { kind: 'refused', code: 'runner.ask/needs-a-person' as RefusalCode, message: runnerText.needsAPerson };
      }
      const answers = await hook.ports.dialogs.ask(context.feature, outcome.question);
      return answers === undefined
        ? { kind: 'cancelled' }
        : { kind: 'learned', learned: hook.answered?.(answers) ?? answers };
    }
  }
}

async function readFor(hook: Hook, context: Context, need: ReadNeed): Promise<unknown> {
  const read = hook.ports.features.get(need.read);
  if (read?.kind !== 'read') {
    throw new Error(`Datardo has no read named ${need.read}.`);
  }
  const request = read.request({ ...context, feature: need.read }, need.args);
  if (request.kind !== 'engine' && request.kind !== 'app') {
    throw new Error(`${need.read} cannot refuse or ask here.`);
  }
  return read.parse(await sendRead(hook.ports, request, hook.signal), need.args);
}
