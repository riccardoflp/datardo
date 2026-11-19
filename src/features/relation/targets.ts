/**
 * Feature: relation.targets
 *
 * Works out, from the references of a database, the collection and the filter the value of a field leads to: `{ _id:
 * <value> }`, `{ _id: { $in: [<values>] } }` for an array, `{ email: "…" }` for a unique field; a DBRef leads to the
 * collection it names, in this database only. Ported from Mongoster's `referenceTargets`.
 */
import type { Json } from '../../shared/engine-request';
import { formattedValue } from '../query/format';
import { distinctValues, isDbRef, isReferenceValue } from './model/values';
import type { ReferenceTarget, Relation } from './types';

/** The references of a collection: those leaving its fields and those reaching them; views left out. */
export interface CollectionReferences {
  readonly outgoing: readonly Relation[];
  readonly incoming: readonly Relation[];
}

/** The outgoing and incoming references of `collection` among the relations of its database. */
export function collectionReferences(relations: readonly Relation[], collection: string): CollectionReferences {
  const references = relations.filter((relation) => relation.kind !== 'view');
  return {
    outgoing: references.filter((relation) => relation.from === collection),
    incoming: references.filter((relation) => relation.to === collection),
  };
}

/** The filter on `field` of these values: one value as it is, several with `$in`. */
export function filterOn(field: string, values: readonly Json[]): Json {
  const [only] = values;
  return { [field]: values.length === 1 && only !== undefined ? only : { $in: values } };
}

function target(collection: string, field: string, values: readonly Json[]): ReferenceTarget {
  const filter = filterOn(field, values);
  return {
    collection,
    filter,
    filterText: formattedValue(filter, 'one-line'),
    label: `${collection}.${field}`,
    count: values.length,
  };
}

function dbrefIds(values: readonly Json[], relation: Relation, database: string): readonly Json[] {
  return values.flatMap((value) =>
    isDbRef(value) && value.$ref === relation.to && (value.$db === undefined || value.$db === database)
      ? [value.$id]
      : [],
  );
}

/** Feature: relation.targets — where the value of the field at `path` leads, one target per collection reached. */
export function referenceTargets(
  outgoing: readonly Relation[],
  path: string,
  value: Json | undefined,
  database: string,
): readonly ReferenceTarget[] {
  const dbrefField = path.endsWith('.$id') ? path.slice(0, -'.$id'.length) : undefined;
  const references = outgoing.filter(
    (relation) =>
      relation.kind !== 'view' &&
      (relation.field === path || (relation.kind === 'dbref' && relation.field === dbrefField)),
  );
  if (value === undefined || value === null || references.length === 0) {
    return [];
  }
  const values = Array.isArray(value) ? (value as readonly Json[]) : [value];
  const found: ReferenceTarget[] = [];
  for (const relation of references) {
    const wholeDbRef = relation.kind === 'dbref' && dbrefField === undefined;
    const ids = wholeDbRef ? dbrefIds(values, relation, database) : values;
    const field = wholeDbRef ? '_id' : relation.toField;
    const kept = distinctValues(ids.filter(isReferenceValue));
    const label = `${relation.to}.${field}`;
    if (kept.length > 0 && !found.some((each) => each.label === label)) {
      found.push(target(relation.to, field, kept));
    }
  }
  return found;
}
