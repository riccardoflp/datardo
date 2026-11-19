/**
 * What the tests of the compare area start the features from: `shop.orders` of Local on the left and of Production
 * (read-only unless said) on the right, values as canonical Extended JSON, and the replies recorded from MongoDB 8.2.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConnectionView } from '../../../src/shared/connection';
import type { Json } from '../../../src/shared/engine-request';
import type { Answers, Context, Outcome, Plan } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import type { Question } from '../../../src/shared/question';
import { mongoConnection, stateWith } from '../connection/context';

/** Local, a MongoDB connection that writes and keeps its undo history. */
export const local = mongoConnection();

/** Production, a MongoDB connection that writes; `productionReadOnly` is the same, read-only. */
export const production = mongoConnection({ id: connectionId('c-prod'), name: 'Production' });

/** Production, read-only. */
export const productionReadOnly = mongoConnection({ id: connectionId('c-prod'), name: 'Production', readOnly: true });

/** The left side: `shop.orders` of Local. */
export const leftSide = { connection: 'c-local', database: 'shop', collection: 'orders', view: false } as const;

/** The right side: `shop.orders` of Production. */
export const rightSide = { connection: 'c-prod', database: 'shop', collection: 'orders', view: false } as const;

/** A context of a feature with these connections saved, at a fixed time. */
export function contextWith(
  feature: string,
  saved: readonly ConnectionView[] = [local, production],
  settings: Readonly<Record<string, Json>> = {},
): Context {
  const state = stateWith(saved);
  return {
    feature: featureId(feature),
    now: Date.UTC(2026, 10, 18, 9),
    platform: 'windows',
    startedBy: 'user',
    target: { kind: 'collection', connection: local.id, database: 'shop', collection: 'orders' },
    state: { ...state, settings: { stored: settings, writable: true } },
  };
}

/** `Int32`. */
export function int(value: number): Json {
  return { $numberInt: String(value) };
}

/** `Double`. */
export function double(written: string): Json {
  return { $numberDouble: written };
}

/** `Int64`. */
export function long(written: string): Json {
  return { $numberLong: written };
}

/** `Decimal128`. */
export function decimal(written: string): Json {
  return { $numberDecimal: written };
}

/** `ObjectId`. */
export function objectId(hex: string): Json {
  return { $oid: hex };
}

/** The plan of an outcome, which must be one. */
export function planOf(outcome: unknown): Plan {
  const given = outcome as Outcome;
  if (given.kind !== 'run') {
    throw new Error(`Expected a plan, got ${JSON.stringify(outcome)}`);
  }
  return given.plan;
}

/** The text and button of the confirmation of a plan, which must have one. */
export function confirmOf(plan: Plan): { readonly text: string; readonly button: string } {
  if (plan.danger.kind === 'none') {
    throw new Error('Expected a confirmation');
  }
  return { text: plan.danger.text, button: plan.danger.button };
}

/** The question of an outcome, which must be one. */
export function questionOf(outcome: Outcome): Question {
  if (outcome.kind !== 'ask') {
    throw new Error(`Expected a question, got ${JSON.stringify(outcome)}`);
  }
  return outcome.question;
}

/** The code of a refusal, which the outcome must be. */
export function refusalOf(outcome: unknown): { readonly code: string; readonly message: string } {
  const given = outcome as Outcome;
  if (given.kind !== 'refuse') {
    throw new Error(`Expected a refusal, got ${JSON.stringify(outcome)}`);
  }
  return { code: given.code, message: given.message };
}

/** The answers of a feature started with these arguments, and the answers and reads given so far. */
export function started(args: Readonly<Record<string, Json>>, more: Answers = {}): Answers {
  return { args, ...more };
}

/** A reply of MongoDB 8.2 recorded by `test/integration/compare/record-replies.test.ts`. */
export function recorded(name: string): unknown {
  const path = join(import.meta.dirname, '..', '..', 'fixtures', 'replies', `mongodb-8.2-compare-${name}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}
