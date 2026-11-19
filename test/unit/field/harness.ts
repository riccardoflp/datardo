/**
 * What the unit tests of the column actions build their contexts from: the connection Local (or Production, read-only),
 * the collection `shop.people`, the column, and the filter of the query bar as `query.parse` reads it.
 */
import type { Json } from '../../../src/shared/engine-request';
import type { Answers, Context, Outcome, Plan } from '../../../src/shared/feature';
import type { AppState } from '../../../src/shared/state';
import { contextOf, mongoConnection, stateWith } from '../connection/context';

/** The state with Local, and Production read-only; `stored` are the settings the user changed. */
export function stateOf(stored: Readonly<Record<string, Json>> = {}): AppState {
  const state = stateWith([
    mongoConnection(),
    mongoConnection({ id: 'c-production' as never, name: 'Production', readOnly: true }),
  ]);
  return { ...state, settings: { ...state.settings, stored } };
}

/** A context of a column action on `shop.people`. */
export function fieldContext(feature: string, stored: Readonly<Record<string, Json>> = {}): Context {
  return contextOf(feature, stateOf(stored), {
    kind: 'collection',
    connection: 'c-local' as never,
    database: 'shop',
    collection: 'people',
  });
}

/** What a column action is started with: the column, and the filter of the query bar. */
export interface Start {
  readonly field: string;
  readonly array?: string;
  readonly filter?: Json;
  readonly written?: string;
  readonly view?: boolean;
  readonly connection?: string;
}

/** The answers holding the arguments of the start, with what was answered or read since. */
export function started(start: Start, more: Answers = {}): Answers {
  const filter = start.filter === undefined ? { kind: 'empty' } : { kind: 'value', value: start.filter };
  return {
    args: {
      connection: start.connection ?? 'c-local',
      database: 'shop',
      collection: 'people',
      field: start.field,
      ...(start.array === undefined ? {} : { array: start.array }),
      ...(start.view === true ? { view: true } : {}),
      filter,
      ...(start.written === undefined ? {} : { written: start.written }),
    },
    ...more,
  };
}

/** The plan of an outcome that runs; fails the test otherwise. */
export function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${JSON.stringify(outcome)}.`);
  }
  return outcome.plan;
}

/** The arguments of the read an outcome asks for; fails the test otherwise. */
export function readOf(outcome: Outcome): { readonly key: string; readonly read: string; readonly args: Json } {
  if (outcome.kind !== 'read') {
    throw new Error(`Expected a read, got ${JSON.stringify(outcome)}.`);
  }
  return outcome.need;
}

/** A `{ $not: { $type: "array" } }` condition on `path`. */
export function notArray(path: string): Json {
  return { [path]: { $not: { $type: 'array' } } };
}
