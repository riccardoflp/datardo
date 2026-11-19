/**
 * What the unit tests of the undo history and of redis-oplog start from: the system's time zone set to Europe/Rome
 * (the cards' examples are in it), the saved connections Local (MongoDB) and Cache local (Redis), operations of the
 * undo history, and the app's state that holds them.
 */
import { afterAll } from 'vitest';
import type { ConnectionView } from '../../../src/shared/connection';
import { noSecretsSaved } from '../../../src/shared/connection';
import type { Answers, Context, Outcome, Plan, Step } from '../../../src/shared/feature';
import type { Place } from '../../../src/shared/ids';
import { connectionId, featureId } from '../../../src/shared/ids';
import { initialState, type AppState } from '../../../src/shared/state';
import { initialConnectionsState } from '../../../src/shared/state/connections';
import type { SettingsState } from '../../../src/shared/state/settings';
import type { Target } from '../../../src/shared/target';
import { plan as revertPlan } from '../../../src/features/undo/revert';
import type { UndoState } from '../../../src/features/undo/state/history';
import { initialUndoState } from '../../../src/features/undo/state/history';
import type { UndoEntry, UndoSettings } from '../../../src/features/undo/types';
import { megabyte, operationId } from '../../../src/features/undo/types';

const zone = process.env['TZ'];
process.env['TZ'] = 'Europe/Rome';
afterAll(() => {
  if (zone === undefined) {
    delete process.env['TZ'];
  } else {
    process.env['TZ'] = zone;
  }
});

/** A local time in Europe/Rome: year, month from 1, day, then hours, minutes and seconds when given. */
export function at(...parts: readonly number[]): number {
  const [year = 2026, month = 1, day = 1, hours = 0, minutes = 0, seconds = 0] = parts;
  return new Date(year, month - 1, day, hours, minutes, seconds).getTime();
}

/** A saved connection. */
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

export const localConnection = connection('c-local', 'Local');
export const cacheConnection = connection('c-cache', 'Cache local', { engine: 'redis', hosts: 'cache:6379' });

/** The `datardo.undo` settings with their defaults. */
export const defaultUndo: UndoSettings = {
  enabled: true,
  maxDocumentsPerOperation: 10_000,
  maxOperationBytes: 20 * megabyte,
  maxBytes: 100 * megabyte,
  maxDays: 7,
  maxEntries: 200,
};

/** An operation of the undo history on `shop.orders` of Local, recorded at noon on 19 November 2026. */
export function entry(overrides: Partial<UndoEntry> = {}): UndoEntry {
  return {
    id: operationId('op-1'),
    time: at(2026, 11, 19, 12),
    connection: localConnection.id,
    connectionName: 'Local',
    title: 'Update many in shop.orders',
    inserted: 0,
    updated: 3,
    deleted: 0,
    size: 2048,
    engine: 'mongodb',
    database: 'shop',
    collection: 'orders',
    ...overrides,
  } as UndoEntry;
}

/** An operation on the keys of `db0` of Cache local. */
export function keyEntry(overrides: Partial<UndoEntry> = {}): UndoEntry {
  return {
    id: operationId('op-k'),
    time: at(2026, 11, 19, 12),
    connection: cacheConnection.id,
    connectionName: 'Cache local',
    title: 'Delete the key orders:42',
    inserted: 0,
    updated: 0,
    deleted: 1,
    size: 512,
    engine: 'redis',
    database: 0,
    ...overrides,
  } as UndoEntry;
}

/** The undo part of the state with these operations, newest first. */
export function undoWith(entries: readonly UndoEntry[], more: Partial<UndoState> = {}): UndoState {
  return { ...initialUndoState, entries, ...more };
}

/** The settings with these stored values. */
export function settingsWith(stored: Readonly<Record<string, unknown>>, base: SettingsState): SettingsState {
  return { ...base, stored: { ...base.stored, ...stored } } as SettingsState;
}

/** The app's state with the undo part, other parts given, and the saved connections. */
export function appStateWith(
  undo: UndoState = initialUndoState,
  connections: readonly ConnectionView[] = [localConnection, cacheConnection],
  more: Readonly<Record<string, unknown>> = {},
): AppState {
  return {
    ...initialState,
    connections: { ...initialConnectionsState, loaded: true, saved: connections },
    undo,
    ...more,
  };
}

/** The app's state with these stored settings. */
export function withSettings(state: AppState, stored: Readonly<Record<string, unknown>>): AppState {
  return { ...state, settings: settingsWith(stored, state.settings) };
}

/** A context of the feature at `now`. */
export function contextOf(
  feature: string,
  state: AppState,
  now: number = at(2026, 11, 19, 14),
  target: Target = { kind: 'app' },
): Context {
  return { feature: featureId(feature), now, platform: 'windows', startedBy: 'user', target, state };
}

/** The target `shop.orders` of Local. */
export const ordersTarget: Target = {
  kind: 'collection',
  connection: localConnection.id,
  database: 'shop',
  collection: 'orders',
};

/** The target `db0` of Cache local. */
export const keysTarget: Target = { kind: 'redis-database', connection: cacheConnection.id, database: 0 };

/** The plan of an outcome; throws when it is not one. */
export function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${outcome.kind}: ${JSON.stringify(outcome)}`);
  }
  return outcome.plan;
}

/** The steps of a plan, or none when the outcome is not a plan. */
export function stepsOf(outcome: Outcome): readonly Step[] {
  return outcome.kind === 'run' ? outcome.plan.steps : [];
}

/** The texts of the steps of a plan. */
export function stepTexts(outcome: Outcome): readonly string[] {
  return stepsOf(outcome).map((step) => step.text);
}

/** Answers with these arguments. */
export function withArgs(args: unknown, more: Answers = {}): Answers {
  return { args, ...more };
}

/**
 * `undo.revert` started on an operation (none: one removed in the meantime), with the history holding it and the
 * answers given, from a place, with the saved connections and the stored settings given.
 */
export function revert(
  operation: UndoEntry | undefined,
  answers: Answers = {},
  place?: Place,
  more: { readonly connections?: readonly ConnectionView[]; readonly stored?: Readonly<Record<string, unknown>> } = {},
): Outcome {
  const connections = more.connections ?? [localConnection, cacheConnection];
  const undo = undoWith(operation === undefined ? [] : [operation]);
  const state = withSettings(appStateWith(undo, connections), more.stored ?? {});
  const context = { ...contextOf('undo.revert', state), ...(place === undefined ? {} : { place }) };
  return revertPlan(context, { ...answers, args: { operation: operation?.id ?? 'op-gone' } });
}
