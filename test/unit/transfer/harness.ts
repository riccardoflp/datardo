/**
 * What the unit tests of the transfer and backup areas start from: the saved MongoDB connections Local, Production
 * (read-only) and Staging, a context on a target, the answers of a feature gathered one by one, and the bytes of
 * documents as stored.
 */
import { BSON } from 'mongodb';
import type { ConnectionView } from '../../../src/shared/connection';
import { noSecretsSaved } from '../../../src/shared/connection';
import type { Json, MongoRequest } from '../../../src/shared/engine-request';
import type { Answers, Context, Outcome, Step } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import { initialState, type AppState } from '../../../src/shared/state';
import { initialConnectionsState } from '../../../src/shared/state/connections';
import type { Target } from '../../../src/shared/target';

const { EJSON } = BSON;

/** A saved MongoDB connection. */
export function connection(id: string, name: string, more: Partial<ConnectionView> = {}): ConnectionView {
  return {
    id: connectionId(id),
    name,
    engine: 'mongodb',
    hosts: 'db1:27017',
    readOnly: false,
    keepsUndo: true,
    secrets: { ...noSecretsSaved, connectionString: true },
    ...more,
  };
}

export const local = connection('c-local', 'Local');
export const production = connection('c-prod', 'Production', { readOnly: true });
export const staging = connection('c-staging', 'Staging');

/** The app's state with the connections saved, each connected but those in `offline`, and the settings stored. */
export function stateWith(
  saved: readonly ConnectionView[] = [local, production, staging],
  settings: Readonly<Record<string, Json>> = {},
  offline: readonly ConnectionView[] = [],
): AppState {
  const live = Object.fromEntries(
    saved.filter((each) => !offline.includes(each)).map((each) => [each.id, { state: 'connected' as const }]),
  );
  return {
    ...initialState,
    connections: { ...initialConnectionsState, loaded: true, saved, live },
    settings: { ...initialState.settings, stored: settings },
  };
}

/** A context on a target, at a fixed time, on Windows. */
export function contextOn(target: Target, feature: string, state: AppState = stateWith()): Context {
  return { feature: featureId(feature), now: 1_793_000_000_000, platform: 'windows', startedBy: 'user', target, state };
}

/** The collection `shop.orders` on a connection. */
export function ordersOn(on: ConnectionView = local): Target {
  return { kind: 'collection', connection: on.id, database: 'shop', collection: 'orders' };
}

/** The outcome's question: its first field's key, or the read's key. */
export function next(outcome: Outcome): string {
  switch (outcome.kind) {
    case 'ask':
      return outcome.question.fields[0]?.key ?? '';
    case 'read':
      return `read:${outcome.need.key}`;
    case 'refuse':
      return `refuse:${outcome.code}`;
    case 'run':
      return 'run';
  }
}

/** The bytes of a document as stored, from Extended JSON text in canonical or relaxed form. */
export function stored(text: string): Uint8Array {
  return BSON.serialize(EJSON.parse(text, { relaxed: false }) as BSON.Document);
}

/** A document of canonical Extended JSON, as the engine gives it. */
export function canonicalOf(text: string): Json {
  return EJSON.serialize(EJSON.parse(text, { relaxed: false }), { relaxed: false });
}

/** The MongoDB request of a step, or a failure that shows what the step was. */
export function mongoOf(step: Step | undefined): MongoRequest {
  if (step?.kind !== 'engine' || step.request.engine !== 'mongodb') {
    throw new Error(`Expected a MongoDB step, got ${JSON.stringify(step)}`);
  }
  return step.request;
}

/** The plan of an outcome that runs, or a failure that shows what it was. */
export function planOf(outcome: Outcome) {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${JSON.stringify(outcome)}`);
  }
  return outcome.plan;
}

/** Answers with more answers. */
export function adding(answers: Answers, more: Answers): Answers {
  return { ...answers, ...more };
}
