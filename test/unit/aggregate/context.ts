/**
 * What the tests of the aggregate area start the features from: the collection `shop.orders` on Local (or on the
 * read-only Production), and the arguments the window sends with the pipeline as it is.
 */
import type { Json } from '../../../src/shared/engine-request';
import type { Answers, Context, Outcome, Plan } from '../../../src/shared/feature';
import { featureId } from '../../../src/shared/ids';
import type { Question } from '../../../src/shared/question';
import { editorJson, type PipelineEditor, type Stage } from '../../../src/features/aggregate/types';
import { mongoConnection, stateWith } from '../connection/context';

/** Local, a MongoDB connection that writes. */
export const local = mongoConnection();

/** Production, a read-only MongoDB connection. */
export const production = mongoConnection({ name: 'Production', readOnly: true });

/** A context of the feature on `shop.orders` of Local, or of Production when `readOnly`. */
export function contextOn(feature: string, readOnly = false, collection = 'orders'): Context {
  const saved = readOnly ? production : local;
  return {
    feature: featureId(feature),
    now: Date.UTC(2026, 10, 18, 9),
    platform: 'windows',
    startedBy: 'user',
    target: { kind: 'collection', connection: saved.id, database: 'shop', collection },
    state: stateWith([saved]),
  };
}

/** An editor of these stages, with the stage shown (from 0) when given. */
export function editorOf(stages: readonly Stage[], shown?: number): PipelineEditor {
  return shown === undefined ? { stages } : { stages, shown };
}

/** The answers of a feature started with the pipeline `editor` and other arguments. */
export function withPipeline(editor: PipelineEditor, more: Readonly<Record<string, Json>> = {}): Answers {
  return { args: { pipeline: editorJson(editor), ...more } };
}

/** The plan of an outcome, which must be one. */
export function planOf(outcome: Outcome | { readonly kind: string }): Plan {
  if (outcome.kind !== 'run' || !('plan' in outcome)) {
    throw new Error(`Expected a plan, got ${JSON.stringify(outcome)}`);
  }
  return outcome.plan;
}

/** The question of an outcome, which must be one. */
export function questionOf(outcome: Outcome): Question {
  if (outcome.kind !== 'ask') {
    throw new Error(`Expected a question, got ${JSON.stringify(outcome)}`);
  }
  return outcome.question;
}

/** The pipeline the first app step of a plan sets. */
export function editorAfter(plan: Plan): PipelineEditor {
  const [step] = plan.steps;
  if (step?.kind !== 'app') {
    throw new Error('Expected an app step');
  }
  return (step.args as unknown as { readonly pipeline: PipelineEditor }).pipeline;
}

/** The text of the first step of a plan. */
export function stepTextOf(plan: Plan): string {
  return plan.steps[0]?.text ?? '';
}
