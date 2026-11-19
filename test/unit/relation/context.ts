/**
 * What the tests of the relation area build their inputs from: values as canonical Extended JSON, collections as
 * sampled, relations, contexts of the connection Local, and readers of what a feature returns.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fields } from '../../../src/features/relation/fields';
import type {
  ReferenceGraph,
  Relation,
  RelationKind,
  SampledCollection,
  SampledField,
} from '../../../src/features/relation/types';
import type { Json } from '../../../src/shared/engine-request';
import type { Context, Outcome, Plan } from '../../../src/shared/feature';
import type { Question } from '../../../src/shared/question';
import type { Target } from '../../../src/shared/target';
import { contextOf, mongoConnection, stateWith } from '../connection/context';

/** Local, a MongoDB connection. */
export const local = mongoConnection();

/** An `ObjectId` whose 24 digits end with `end`. */
export function oid(end: string): Json {
  return { $oid: end.padStart(24, '0') };
}

/** `Int32`. */
export function int(value: number): Json {
  return { $numberInt: String(value) };
}

/** `Int64`. */
export function long(value: string): Json {
  return { $numberLong: value };
}

/** A UUID of 16 bytes, from its hexadecimal digits. */
export function uuid(hex: string): Json {
  const bytes = hex.replace(/-/gu, '').match(/../gu) ?? [];
  const base64 = btoa(String.fromCharCode(...bytes.map((pair) => Number.parseInt(pair, 16))));
  return { $binary: { base64, subType: '04' } };
}

/** A collection sampled from these documents, with its unique fields. */
export function sampled(name: string, documents: readonly Json[], unique: readonly string[] = []): SampledCollection {
  return { name, view: false, sampled: documents.length, fields: fields(documents), unique };
}

/** A collection whose fields are named, one row each, with a sample of one document. */
export function withFields(name: string, paths: readonly string[], unique: readonly string[] = []): SampledCollection {
  const listed: SampledField[] = paths.map((path) => ({
    path,
    label: path,
    depth: path.split('.').length - 1,
    types: [path === '_id' ? 'objectId' : 'string'],
    share: 1,
    several: false,
    values: [],
    dbrefs: [],
  }));
  return { name, view: false, sampled: 1, fields: listed, unique };
}

/** A view of `on`. */
export function view(name: string, on: string): SampledCollection {
  return { name, view: true, viewOn: on, sampled: 0, fields: [], unique: [] };
}

/** A relation, a reference unless said. */
export function relation(
  from: string,
  to: string,
  more: Partial<Relation> & { readonly kind?: RelationKind } = {},
): Relation {
  const [fromCollection = '', ...fieldParts] = from.split('.');
  const [toCollection = '', ...toParts] = to.split('.');
  const field = fieldParts.join('.');
  return {
    from: fromCollection,
    field,
    fieldLabel: field,
    to: toCollection,
    toField: toParts.join('.') || '_id',
    several: false,
    kind: 'reference',
    found: 20,
    lookedUp: 20,
    ...more,
  };
}

/** The database of the worked examples of `relation.layout` and `relation.export-mermaid`, without `audit` and `logs`. */
export const shopGraph: ReferenceGraph = {
  database: 'shop',
  sample: 100,
  collections: [
    sampled('customers', [{ _id: oid('1'), name: 'Ada', email: 'ada@example.com' }], ['email']),
    sampled('orders', [{ _id: oid('2'), customerId: oid('1'), productId: 'P-1', total: { $numberDouble: '12.5' } }]),
    sampled('products', [{ _id: 'P-1', name: 'Lamp' }]),
  ],
  relations: [relation('orders.customerId', 'customers._id'), relation('orders.productId', 'products._id')],
};

/** The references of the worked examples of `relation.targets` and `relation.referrers`. */
export const shopReferences: readonly Relation[] = [
  relation('orders.customer', 'users._id'),
  relation('orders.customerEmail', 'users.email'),
  relation('orders.owner', 'users._id'),
  relation('orders.owner', 'admins._id'),
  relation('orders.tagIds', 'tags._id', { several: true }),
  relation('posts.tagIds', 'tags._id', { several: true }),
  relation('posts.author', 'users._id', { kind: 'dbref', found: 0, lookedUp: 0 }),
  relation('recent', 'orders', { kind: 'view', field: '', fieldLabel: '', toField: '' }),
];

/** The ObjectId of the worked examples, `65f1c0a2b3d4e5f6a7b8c9aa`. */
export const ada: Json = { $oid: '65f1c0a2b3d4e5f6a7b8c9aa' };

/** A context of the feature on Local, on a target. */
export function contextOn(feature: string, target?: Target): Context {
  return contextOf(feature, stateWith([local]), target ?? { kind: 'database', connection: local.id, database: 'shop' });
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

/** A reply of MongoDB 8.2 recorded by `test/integration/relation/record-replies.test.ts`. */
export function recorded(name: string): unknown {
  const path = join(import.meta.dirname, '..', '..', 'fixtures', 'replies', `mongodb-8.2-relation-${name}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}
