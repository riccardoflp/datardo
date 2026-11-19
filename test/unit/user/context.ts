/**
 * What the tests of the user area start the features from: the database `shop` of Local (or of the read-only
 * Production), the replies of MongoDB 8.2 recorded by `test/integration/user/record-replies.test.ts`, and readers of
 * what a feature returns.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConnectionView } from '../../../src/shared/connection';
import type { Json } from '../../../src/shared/engine-request';
import type { Answers, Context, EngineStep, Plan } from '../../../src/shared/feature';
import { featureId } from '../../../src/shared/ids';
import type { Target } from '../../../src/shared/target';
import { mongoConnection, stateWith } from '../connection/context';

export { planOf, questionOf, refusalOf, stepTexts } from '../document/context';

/** Local, a MongoDB connection that writes. */
export const local = mongoConnection();

/** Production, a read-only MongoDB connection. */
export const production = mongoConnection({ name: 'Production', readOnly: true });

/** A context of the feature on a database of the connection (`shop` unless named), at a fixed time. */
export function contextOn(feature: string, connection: ConnectionView = local, database = 'shop'): Context {
  const target: Target = { kind: 'database', connection: connection.id, database };
  return {
    feature: featureId(feature),
    now: Date.UTC(2026, 10, 18, 9),
    platform: 'windows',
    startedBy: 'user',
    target,
    state: stateWith([connection]),
  };
}

/** The answers of a feature started with these arguments, and the answers and reads given so far. */
export function started(args: Readonly<Record<string, Json>>, more: Answers = {}): Answers {
  return { args, ...more };
}

/** The arguments of a feature started on a user or a role of `shop` of Local. */
export function onShop(more: Readonly<Record<string, Json>> = {}): Readonly<Record<string, Json>> {
  return { connection: local.id, database: 'shop', ...more };
}

/** The engine steps of a plan. */
export function engineSteps(plan: Plan): readonly EngineStep[] {
  return plan.steps.filter((step): step is EngineStep => step.kind === 'engine');
}

/** The command a plan's only step sends, and the database it is sent to. */
export function sentCommand(plan: Plan): { readonly database: string; readonly command: Json } {
  const [step] = engineSteps(plan);
  if (step?.request.engine !== 'mongodb' || step.request.method !== 'runCommand') {
    throw new Error('Expected a command');
  }
  return { database: step.request.database, command: step.request.arguments[0] ?? null };
}

/** Who a connection signed in as `app@shop` is, as `user.signed-in` returns it. */
export const signedInAsApp = { users: [{ user: 'app', db: 'shop' }], roles: [{ role: 'readWrite', db: 'shop' }] };

/** A connection that did not sign in. */
export const notSignedIn = { users: [], roles: [] };

/** A reply of MongoDB 8.2 recorded in `test/fixtures/replies`. */
export function recorded(name: string): unknown {
  const path = join(import.meta.dirname, '..', '..', 'fixtures', 'replies', `mongodb-8.2-user-${name}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}
