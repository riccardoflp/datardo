/**
 * What the tests of the index area share: a context on a collection of a saved connection, the replies of
 * `index.list` recorded from MongoDB 8.2 (`test/integration/index/record-replies.test.ts`), and helpers to read a plan.
 */
import { expect } from 'vitest';
import { parse } from '../../../src/features/index/list';
import type { IndexInfo, IndexList, ParsedText } from '../../../src/features/index/types';
import type { Json, MongoRequest } from '../../../src/shared/engine-request';
import type { Answers, Context, EngineStep, Outcome, Plan } from '../../../src/shared/feature';
import { featureId } from '../../../src/shared/ids';
import { initialState } from '../../../src/shared/state';
import { mongoConnection } from '../connection/context';
import { mongoReply } from '../connection/replies';

/** A context with the connection Local (or Production, read-only) saved. */
export function contextOn(readOnly = false, feature = 'index.create'): Context {
  const connection = mongoConnection(readOnly ? { name: 'Production', readOnly: true } : {});
  return {
    feature: featureId(feature),
    now: 1_795_100_000_000,
    platform: 'windows',
    startedBy: 'user',
    target: { kind: 'app' },
    state: { ...initialState, connections: { ...initialState.connections, saved: [connection] } },
  };
}

/** The answers a feature is started with: `{ connection, database, collection, … }`. */
export function started(more: Readonly<Record<string, Json>> = {}, collection = 'orders'): Answers {
  return { args: { connection: 'c-local', database: 'shop', collection, ...more } };
}

/** The recorded replies of `index.list`: `_id_`, `email_1` (unique), `createdAt_1` (TTL 1 day), a text index with a
 * weight of 3 on `body`, `status_1` (hidden), `total_-1` (partial) and `name_1` (collation). */
export function recordedReplies(): readonly unknown[] {
  return mongoReply('mongodb-8.2-index-list') as unknown as readonly unknown[];
}

/** The recorded list, parsed. */
export function recordedList(): IndexList {
  return parse(recordedReplies());
}

/** An index of the recorded list. */
export function recordedIndex(name: string): IndexInfo {
  const index = recordedList().indexes.find((each) => each.name === name);
  if (index === undefined) {
    throw new Error(`No recorded index ${name}.`);
  }
  return index;
}

/** A value read from mongosh syntax. */
export function value(json: Json): ParsedText {
  return { kind: 'value', value: json };
}

/** The plan of an outcome that runs. */
export function planOf(outcome: Outcome): Plan {
  expect(outcome.kind).toBe('run');
  if (outcome.kind !== 'run') {
    throw new Error('The outcome does not run.');
  }
  return outcome.plan;
}

/** A step to MongoDB. */
export type MongoStep = EngineStep & { readonly request: MongoRequest };

/** The engine steps of a plan, all to MongoDB in this area. */
export function engineSteps(plan: Plan): readonly MongoStep[] {
  return plan.steps.filter((step): step is MongoStep => step.kind === 'engine' && step.request.engine === 'mongodb');
}

/** The refusal of an outcome: its code and text. */
export function refusalOf(outcome: Outcome): { readonly code: string; readonly text: string } {
  expect(outcome.kind).toBe('refuse');
  if (outcome.kind !== 'refuse') {
    throw new Error('The outcome is not a refusal.');
  }
  return { code: outcome.code, text: outcome.message };
}

/** The notification texts of a plan's After. */
export function notices(plan: Plan): readonly string[] {
  return plan.after.flatMap((after) => (after.kind === 'notify' ? [after.text] : []));
}
