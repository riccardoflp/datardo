/**
 * What the tests of the document area start the features from: the collections `shop.people` and `shop.orders` on
 * Local (or on the read-only Production), the settings of the undo history, and readers of what a feature returns.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConnectionView } from '../../../src/shared/connection';
import type { Json } from '../../../src/shared/engine-request';
import type { Answers, Context, Outcome, Plan } from '../../../src/shared/feature';
import { featureId } from '../../../src/shared/ids';
import type { Question } from '../../../src/shared/question';
import { mongoConnection, stateWith } from '../connection/context';

/** Local, a MongoDB connection that writes and keeps its undo history. */
export const local = mongoConnection();

/** Production, a read-only MongoDB connection. */
export const production = mongoConnection({ name: 'Production', readOnly: true });

/** How a context differs from Local with the default settings. */
export interface ContextOptions {
  readonly connection?: ConnectionView;
  readonly collection?: string;
  /** The settings the user changed: `{ 'datardo.undo.enabled': false }`. */
  readonly settings?: Readonly<Record<string, Json>>;
}

/** A context of the feature on a collection of `shop` (`people` unless named), at a fixed time. */
export function contextOn(feature: string, options: ContextOptions = {}): Context {
  const saved = options.connection ?? local;
  const state = stateWith([saved]);
  return {
    feature: featureId(feature),
    now: Date.UTC(2026, 10, 18, 9),
    platform: 'windows',
    startedBy: 'user',
    target: { kind: 'collection', connection: saved.id, database: 'shop', collection: options.collection ?? 'people' },
    state: { ...state, settings: { stored: options.settings ?? {}, writable: true } },
  };
}

/** The answers of a feature started with these arguments, and the answers and reads given so far. */
export function started(args: Readonly<Record<string, Json>>, more: Answers = {}): Answers {
  return { args, ...more };
}

/** `Int32` as canonical Extended JSON. */
export function int(value: number): Json {
  return { $numberInt: String(value) };
}

/** `Double` as canonical Extended JSON. */
export function double(text: string): Json {
  return { $numberDouble: text };
}

/** `Int64` as canonical Extended JSON. */
export function long(text: string): Json {
  return { $numberLong: text };
}

/** An `ObjectId` as canonical Extended JSON. */
export function objectId(hex: string): Json {
  return { $oid: hex };
}

/** The plan of an outcome, which must be one. */
export function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
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

/** The code and message of a refusal, which the outcome must be. */
export function refusalOf(outcome: Outcome | { readonly kind: string }): { code: string; message: string } {
  if (outcome.kind !== 'refuse' || !('code' in outcome)) {
    throw new Error(`Expected a refusal, got ${JSON.stringify(outcome)}`);
  }
  return { code: outcome.code, message: outcome.message };
}

/** The texts of the steps of a plan. */
export function stepTexts(plan: Plan): readonly string[] {
  return plan.steps.map((step) => step.text);
}

/** The arguments of the first step of a plan, as they are sent. */
export function sentArguments(plan: Plan): readonly Json[] {
  const [step] = plan.steps;
  if (step?.kind !== 'engine' || step.request.engine !== 'mongodb') {
    throw new Error('Expected a MongoDB step');
  }
  return step.request.arguments;
}

/** A reply of MongoDB 8.2 recorded in `test/fixtures/replies` by `test/integration/document/record-replies.test.ts`. */
export function recorded(name: string): unknown {
  const path = join(import.meta.dirname, '..', '..', 'fixtures', 'replies', `mongodb-8.2-document-${name}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}
