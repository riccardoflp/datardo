/**
 * Feature: relation.detect
 *
 * Decides, from the candidates and from what a lookup of their sampled values found, which fields refer to which
 * collection; adds the DBRefs, which name their collection, and the views, which read one. ObjectIds and UUIDs do not
 * repeat by chance, so 20% found is enough; strings and numbers do, so 60% and at least 2 are needed.
 */
import { referenceKey } from './model/values';
import { text } from './text';
import {
  compareText,
  type Candidate,
  type FoundValues,
  type ReferenceType,
  type Relation,
  type SampledCollection,
} from './types';

/** The collections and views of a database, with the fields of their samples. */
export interface SampledDatabase {
  readonly database: string;
  readonly collections: readonly SampledCollection[];
}

/** Whether enough of the values looked up were found for a candidate of this type to be a reference. */
export function isReference(type: ReferenceType, found: number, lookedUp: number): boolean {
  if (found === 0 || lookedUp === 0) {
    return false;
  }
  if (type === 'objectId' || type === 'uuid') {
    return found / lookedUp >= 0.2;
  }
  return found / lookedUp >= 0.6 && (lookedUp < 3 || found >= 2);
}

/** The text a relation is sorted by: `orders.customerId→customers._id`. */
export function relationKey(relation: Relation): string {
  return `${relation.from}.${relation.field}→${relation.to}.${relation.toField}`;
}

function foundKeys(found: readonly FoundValues[]): ReadonlyMap<string, ReadonlySet<string>> {
  const keys = new Map<string, Set<string>>();
  for (const each of found) {
    const at = `${each.collection}\u0000${each.field}`;
    const set = keys.get(at) ?? new Set<string>();
    each.values.forEach((value) => set.add(referenceKey(value)));
    keys.set(at, set);
  }
  return keys;
}

function references(candidates: readonly Candidate[], found: readonly FoundValues[]): readonly Relation[] {
  const keys = foundKeys(found);
  const kept = new Map<string, Relation>();
  for (const candidate of candidates) {
    for (const target of candidate.targets) {
      const there = keys.get(`${target.collection}\u0000${target.field}`) ?? new Set<string>();
      const count = candidate.values.filter((value) => there.has(referenceKey(value))).length;
      if (!isReference(candidate.type, count, candidate.values.length)) {
        continue;
      }
      const relation: Relation = {
        from: candidate.collection,
        field: candidate.field.path,
        fieldLabel: candidate.field.label,
        to: target.collection,
        toField: target.field,
        several: candidate.field.several,
        kind: 'reference',
        found: count,
        lookedUp: candidate.values.length,
      };
      const key = relationKey(relation);
      const before = kept.get(key);
      if (before === undefined || before.found / before.lookedUp < count / candidate.values.length) {
        kept.set(key, relation);
      }
    }
  }
  return [...kept.values()].sort((left, right) => compareText(relationKey(left), relationKey(right)));
}

function dbrefRelations(database: SampledDatabase): readonly Relation[] {
  const names = new Set(database.collections.map((collection) => collection.name));
  const found = database.collections.flatMap((collection) =>
    collection.fields.flatMap((field) =>
      field.dbrefs
        .filter((named) => named.database === undefined || named.database === database.database)
        .filter((named) => names.has(named.collection))
        .map((named): Relation => ({
          from: collection.name,
          field: field.path,
          fieldLabel: field.label,
          to: named.collection,
          toField: '_id',
          several: field.several,
          kind: 'dbref',
          found: 0,
          lookedUp: 0,
        })),
    ),
  );
  const unique = new Map(found.map((relation) => [relationKey(relation), relation] as const));
  return [...unique.values()].sort((left, right) => compareText(relationKey(left), relationKey(right)));
}

function viewRelations(database: SampledDatabase): readonly Relation[] {
  const names = new Set(database.collections.map((collection) => collection.name));
  return database.collections
    .filter((collection) => collection.view && collection.viewOn !== undefined && names.has(collection.viewOn))
    .map((view) => ({
      from: view.name,
      field: '',
      fieldLabel: '',
      to: view.viewOn ?? '',
      toField: '',
      several: false,
      kind: 'view' as const,
      found: 0,
      lookedUp: 0,
    }))
    .sort((left, right) => compareText(left.from, right.from));
}

/**
 * Feature: relation.detect — the relations of the database: the references sorted by `from.field→to.field`, then the
 * DBRefs, then the views.
 */
export function relations(
  database: SampledDatabase,
  candidates: readonly Candidate[],
  found: readonly FoundValues[],
): readonly Relation[] {
  return [...references(candidates, found), ...dbrefRelations(database), ...viewRelations(database)];
}

/** How a relation is described in the list of the diagram, in tooltips and by the tool `describe_relations`. */
export function relationText(relation: Relation): string {
  if (relation.kind === 'view') {
    return text.relation.view(relation.from, relation.to);
  }
  const how = relation.several ? text.relation.manyToMany : text.relation.manyToOne;
  const found =
    relation.kind === 'dbref' ? text.relation.dbref : text.relation.found(relation.found, relation.lookedUp);
  return `${relation.from}.${relation.fieldLabel} → ${relation.to}.${relation.toField} · ${how} · ${found}`;
}
