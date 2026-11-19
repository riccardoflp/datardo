/**
 * What the tests of the structure area build their databases and contexts from: collections, views and indexes as
 * `structure.read` gives them (values as canonical Extended JSON), the connections Dev and the read-only Production,
 * and readers of what a feature returns.
 */
import type { ConnectionView } from '../../../src/shared/connection';
import type { Json } from '../../../src/shared/engine-request';
import type { Answers, Context, Outcome, Plan } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import type { Question } from '../../../src/shared/question';
import type {
  CollectionStructure,
  DatabaseStructure,
  IndexDefinition,
  JsonObject,
  StructureDifference,
} from '../../../src/features/structure/types';
import { diffStructure } from '../../../src/features/structure/steps';
import { mongoConnection, stateWith } from '../connection/context';

/** `Int32` as canonical Extended JSON. */
export function int(value: number): Json {
  return { $numberInt: String(value) };
}

/** A database with these collections, without search and not sharded unless said. */
export function database(
  collections: readonly CollectionStructure[],
  more: Partial<DatabaseStructure> = {},
): DatabaseStructure {
  return { collections, search: 'unsupported', sharded: false, ...more };
}

/** A collection. */
export function collection(name: string, more: Partial<CollectionStructure> = {}): CollectionStructure {
  return { name, type: 'collection', options: {}, indexes: [], ...more };
}

/** A view on `viewOn`. */
export function view(name: string, viewOn: string, pipeline: readonly Json[] = []): CollectionStructure {
  return { name, type: 'view', options: { viewOn, pipeline }, indexes: [] };
}

/** An index. */
export function index(name: string, keys: JsonObject, options: JsonObject = {}): IndexDefinition {
  return { name, keys, options };
}

/** The difference of an object of a collection. */
export function differenceOf(
  differences: readonly StructureDifference[],
  collectionName: string,
  object: string,
  name?: string,
): StructureDifference {
  const found = differences.find(
    (each) =>
      each.collection === collectionName && each.object === object && (name === undefined || each.name === name),
  );
  if (found === undefined) {
    throw new Error(`No difference ${collectionName} ${object} ${name ?? ''}`);
  }
  return found;
}

/** The worked example of the card: `dev › shop` on the left, `prod › shop` on the right. */
export function workedExample(): readonly StructureDifference[] {
  const left = database([
    collection('orders', { indexes: [index('status_1', { status: int(1) })] }),
    collection('users'),
    view('recent', 'orders', [{ $sort: { date: int(-1) } }]),
    view('big', 'recent', [{ $match: { total: { $gt: int(100) } } }]),
  ]);
  const right = database([
    collection('orders', { indexes: [index('old_1', { old: int(1) })] }),
    collection('legacy'),
    collection('users', { options: { validator: { name: { $exists: true } } } }),
  ]);
  return diffStructure(left, right).differences;
}

/** Dev, a MongoDB connection that writes. */
export const dev = mongoConnection({ id: connectionId('c-dev'), name: 'Dev' });

/** Production, a read-only MongoDB connection. */
export const production = mongoConnection({ id: connectionId('c-prod'), name: 'Production', readOnly: true });

/** Production that writes. */
export const writableProduction = mongoConnection({ id: connectionId('c-prod'), name: 'Production' });

/** A context of a feature of the area with these connections saved, at a fixed time. */
export function contextWith(feature: string, saved: readonly ConnectionView[] = [dev, writableProduction]): Context {
  return {
    feature: featureId(feature),
    now: Date.UTC(2026, 10, 19, 9),
    platform: 'windows',
    startedBy: 'user',
    target: { kind: 'database', connection: dev.id, database: 'shop' },
    state: stateWith(saved),
  };
}

/** `shop` of Dev, the left side of the tests. */
export const devShop = { connection: 'c-dev', database: 'shop' };

/** `shop` of Production, the right side of the tests. */
export const prodShop = { connection: 'c-prod', database: 'shop' };

/**
 * The answers of an operation of the page started on Dev › shop and Production › shop after a comparison that found
 * these differences, with more arguments (`drops`, `chosen`, `difference`, …) and more answers.
 */
export function pageStart(
  differences: readonly StructureDifference[],
  more: Readonly<Record<string, unknown>> = {},
  answers: Answers = {},
): Answers {
  const comparison = { left: devShop, right: prodShop, differences };
  return { args: { left: devShop, right: prodShop, comparison, ...more }, ...answers };
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
export function refusalOf(outcome: Outcome): { code: string; message: string } {
  if (outcome.kind !== 'refuse') {
    throw new Error(`Expected a refusal, got ${JSON.stringify(outcome)}`);
  }
  return { code: outcome.code, message: outcome.message };
}
