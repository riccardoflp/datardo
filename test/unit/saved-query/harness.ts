/**
 * What the tests of the saved-query area start the features from: `shop.orders` on Local, whose queries folder is
 * `C:\repo\.mongoster\queries`, on Production, and on Bare, which has no queries folder; the queries of the
 * collection as `saved-query.list` reads them; and the arguments the window sends.
 */
import type { Json } from '../../../src/shared/engine-request';
import type { Answers, Context, FileStep, Outcome, Plan, Step } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import type { Question } from '../../../src/shared/question';
import type { AppState } from '../../../src/shared/state';
import type { CollectionQueries } from '../../../src/features/saved-query/list';
import {
  queryJson,
  type FindText,
  type FolderSavedQuery,
  type MySavedQuery,
  type PipelineText,
  type QueryText,
  type RecentQuery,
  type SavedQuery,
} from '../../../src/features/saved-query/types';
import { mongoConnection, stateWith } from '../connection/context';

/** The queries folder of Local. */
export const repoFolder = 'C:\\repo\\.mongoster\\queries';

/** Local, with its queries folder. */
export const local = mongoConnection({ queriesFolder: repoFolder });

/** Production, with the same queries folder. */
export const production = mongoConnection({
  id: connectionId('c-prod'),
  name: 'Production',
  queriesFolder: repoFolder,
});

/** Bare, with no queries folder. */
export const bare = mongoConnection({ id: connectionId('c-bare'), name: 'Bare' });

/** 18 November 2026, 09:00 UTC. */
export const now = Date.UTC(2026, 10, 18, 9);

/** The app's state with the three connections. */
export function appState(): AppState {
  return stateWith([local, production, bare]);
}

/** A context of the feature on `shop.orders` of a connection (Local by default). */
export function contextOn(feature: string, connection = local.id as string, state: AppState = appState()): Context {
  return {
    feature: featureId(feature),
    now,
    platform: 'windows',
    startedBy: 'user',
    target: { kind: 'collection', connection: connectionId(connection), database: 'shop', collection: 'orders' },
    state,
  };
}

/** A find. */
export function find(filter: string, sort = '', projection = ''): FindText {
  return { kind: 'find', filter, sort, projection };
}

/** A pipeline of stages `[name, body]` or `[name, body, enabled]`. */
export function pipeline(...stages: readonly (readonly [string, string, boolean?])[]): PipelineText {
  return {
    kind: 'pipeline',
    stages: stages.map(([name, body, enabled]) => ({ name, body, enabled: enabled ?? true })),
  };
}

/** A saved query for me of `shop.orders`. */
export function mine(
  name: string,
  query: QueryText = find('{ status: "paid" }'),
  more: Partial<MySavedQuery> = {},
): MySavedQuery {
  return { place: 'me', name, database: 'shop', collection: 'orders', query, at: now - 60_000, ...more };
}

/** A saved query in the folder of `shop.orders`, in the file `shop/orders/<file>`. */
export function inFolder(
  name: string,
  file: string,
  query: QueryText = find('{ status: "paid" }'),
  more: Partial<FolderSavedQuery> = {},
): FolderSavedQuery {
  return { place: 'folder', name, database: 'shop', collection: 'orders', query, file: `shop/orders/${file}`, ...more };
}

/** The queries of `shop.orders` on Local, as `saved-query.list` reads them. */
export function listOf(
  saved: readonly SavedQuery[] = [],
  recent: readonly RecentQuery[] = [],
  more: Partial<CollectionQueries> = {},
): CollectionQueries {
  return {
    connectionName: 'Local',
    database: 'shop',
    collection: 'orders',
    queriesFolder: repoFolder,
    saved,
    recent,
    files: saved.flatMap((each) => (each.place === 'folder' ? [each.file] : [])),
    skipped: [],
    ...more,
  };
}

/** The answers of a feature started on `shop.orders` of Local with `args`, once the list is read. */
export function answersWith(args: Readonly<Record<string, Json>>, more: Answers = {}): Answers {
  return { args: { connection: local.id, database: 'shop', collection: 'orders', ...args }, ...more };
}

/** The arguments of a query. */
export function queryArgs(query: QueryText): Readonly<Record<string, Json>> {
  return { query: queryJson(query) };
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

/** The texts of the steps of a plan. */
export function stepTexts(outcome: Outcome): readonly string[] {
  return planOf(outcome).steps.map((step) => step.text);
}

/** The arguments of the app step of a plan with this action. */
export function appArgs(outcome: Outcome, action: string): Readonly<Record<string, unknown>> {
  const step = planOf(outcome).steps.find((each) => each.kind === 'app' && each.action === action);
  if (step?.kind !== 'app') {
    throw new Error(`Expected the app step ${action}`);
  }
  return step.args as Readonly<Record<string, unknown>>;
}

/** The file steps of a plan. */
export function fileSteps(outcome: Outcome): readonly FileStep[] {
  return planOf(outcome).steps.filter((step: Step): step is FileStep => step.kind === 'file');
}

/** The text a file step writes. */
export function writtenText(step: FileStep | undefined): string {
  const args = step?.content?.args as { readonly text?: string } | undefined;
  return args?.text ?? '';
}
