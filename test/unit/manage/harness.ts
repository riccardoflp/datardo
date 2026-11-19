/**
 * What the unit tests of the manage area build their contexts from: the connection Local (or Production, read-only),
 * the database `shop`, the tabs open, the lists the reads give, and helpers to read an outcome.
 */
import type { Json } from '../../../src/shared/engine-request';
import type { Answers, Context, Outcome, Plan } from '../../../src/shared/feature';
import { tabId } from '../../../src/shared/ids';
import type { AppState } from '../../../src/shared/state';
import type { Tab, TabShows } from '../../../src/shared/state/tabs';
import type { Target } from '../../../src/shared/target';
import { contextOf, mongoConnection, stateWith } from '../connection/context';
import { mongoReply } from '../connection/replies';

/** The state with Local, and Production read-only, with the tabs given; the first is active. */
export function stateOf(tabs: readonly Tab[] = []): AppState {
  const state = stateWith([
    mongoConnection(),
    mongoConnection({ id: 'c-production' as never, name: 'Production', readOnly: true }),
  ]);
  const active = tabs[0]?.id;
  return { ...state, tabs: { ...state.tabs, tabs, ...(active === undefined ? {} : { active }) } };
}

/** A tab showing `shows`. */
export function tabOf(id: number, shows: TabShows): Tab {
  return { id: tabId(`t${String(id)}`), shows, lastActive: 0, loaded: true };
}

/** A collection tab of `shop` on Local. */
export function collectionTab(id: number, collection: string, view = false): Tab {
  return tabOf(id, {
    kind: 'collection',
    connection: 'c-local' as never,
    database: 'shop',
    collection,
    ...(view ? { view: true } : {}),
  });
}

/** A context of a manage feature, started on the connection Local by default. */
export function manageContext(feature: string, tabs: readonly Tab[] = [], target?: Target): Context {
  return contextOf(feature, stateOf(tabs), target ?? { kind: 'connection', connection: 'c-local' as never });
}

/** The answers holding the arguments of the start (Local, with what is given), and what was answered or read since. */
export function started(args: Readonly<Record<string, Json>>, more: Answers = {}): Answers {
  return { args: { connection: 'c-local', ...args }, ...more };
}

/** What `tree.list-collections` gives for these entries. */
export function listed(entries: readonly (readonly [string, string])[]): Json {
  return {
    buckets: [],
    entries: entries.map(([name, kind]) => ({ name, kind, system: name.startsWith('system.') })),
  };
}

/** The plan of an outcome that runs; fails the test otherwise. */
export function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${JSON.stringify(outcome)}.`);
  }
  return outcome.plan;
}

/** The read an outcome asks for; fails the test otherwise. */
export function readOf(outcome: Outcome): { readonly key: string; readonly read: string; readonly args: Json } {
  if (outcome.kind !== 'read') {
    throw new Error(`Expected a read, got ${JSON.stringify(outcome)}.`);
  }
  return outcome.need;
}

/** The question an outcome asks; fails the test otherwise. */
export function questionOf(outcome: Outcome): Extract<Outcome, { kind: 'ask' }>['question'] {
  if (outcome.kind !== 'ask') {
    throw new Error(`Expected a question, got ${JSON.stringify(outcome)}.`);
  }
  return outcome.question;
}

/** The texts of the steps of a plan. */
export function stepTexts(plan: Plan): readonly string[] {
  return plan.steps.map((step) => step.text);
}

/** A reply of `listCollections` recorded from MongoDB 8.2 (`test/integration/manage/record-replies.test.ts`). */
export function recordedOptions(name: 'view' | 'validator' | 'missing'): unknown {
  return mongoReply(`mongodb-8.2-manage-options-${name}`);
}
