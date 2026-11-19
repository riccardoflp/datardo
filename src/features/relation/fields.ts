/**
 * Feature: relation.fields
 *
 * The fields the sampled documents of a collection have: their paths (as a filter writes them) and labels (with `[]`
 * for the arrays they go through), their types, how often they are there, whether they hold several values, the
 * values that could be references and the collections their DBRefs name.
 */
import type { Json } from '../../shared/engine-request';
import { bsonType, isJsonObject, isSubdocument, type JsonObject } from '../query/mongosh/ejson';
import { isDbRef, referenceTypeOf } from './model/values';
import type { DbRefTarget, ReferenceType, SampledField } from './types';

/** At most this many paths are kept per collection; fields met after that are ignored. */
export const mostPaths = 300;

/** At most this many distinct values are kept per field and type. */
export const mostValues = 100;

interface FieldCount {
  readonly label: string;
  readonly depth: number;
  readonly order: number;
  documents: number;
  several: boolean;
  readonly types: Map<string, number>;
  readonly values: Map<ReferenceType, Map<string, Json>>;
  readonly dbrefs: Map<string, DbRefTarget>;
}

interface Visit {
  readonly path: string;
  readonly label: string;
  readonly depth: number;
  readonly several: boolean;
}

/** What one walk of the sample counts, and the paths met in the current document. */
interface Walk {
  readonly counts: Map<string, FieldCount>;
  seen: Set<string>;
}

function countType(count: FieldCount, type: string): void {
  count.types.set(type, (count.types.get(type) ?? 0) + 1);
}

function fieldCount(walk: Walk, at: Visit): FieldCount | undefined {
  const known = walk.counts.get(at.path);
  if (known !== undefined || walk.counts.size >= mostPaths) {
    return known;
  }
  const created: FieldCount = {
    label: at.label,
    depth: at.depth,
    order: walk.counts.size,
    documents: 0,
    several: false,
    types: new Map(),
    values: new Map(),
    dbrefs: new Map(),
  };
  walk.counts.set(at.path, created);
  return created;
}

function visit(walk: Walk, value: Json, at: Visit): void {
  const count = fieldCount(walk, at);
  if (count === undefined) {
    return;
  }
  if (!walk.seen.has(at.path)) {
    walk.seen.add(at.path);
    count.documents += 1;
  }
  count.several ||= at.several;
  if (!Array.isArray(value)) {
    visitValue(walk, count, value, at);
    return;
  }
  const items = value as readonly Json[];
  if (items.length === 0) {
    countType(count, 'array');
  }
  for (const item of items.filter((each) => !Array.isArray(each))) {
    countType(count, 'array');
    count.several ||= !isSubdocument(item) || isDbRef(item);
    visitValue(walk, count, item, { ...at, label: `${at.label}[]`, several: true });
  }
}

function keepValue(count: FieldCount, value: Json): void {
  const type = referenceTypeOf(value);
  if (type === undefined) {
    return;
  }
  const byType = count.values.get(type) ?? new Map<string, Json>();
  count.values.set(type, byType);
  if (byType.size < mostValues) {
    byType.set(JSON.stringify(value), value);
  }
}

function visitValue(walk: Walk, count: FieldCount, value: Json, at: Visit): void {
  if (isDbRef(value)) {
    countType(count, 'dbref');
    const database = typeof value.$db === 'string' ? value.$db : undefined;
    const named: DbRefTarget =
      database === undefined ? { collection: value.$ref } : { collection: value.$ref, database };
    count.dbrefs.set(JSON.stringify(named), named);
    return;
  }
  if (isSubdocument(value)) {
    countType(count, 'object');
    for (const [key, inner] of Object.entries(value)) {
      const path = `${at.path}.${key}`;
      visit(walk, inner, { path, label: `${at.label}.${key}`, depth: at.depth + 1, several: at.several });
    }
    return;
  }
  countType(count, bsonType(value));
  keepValue(count, value);
}

function sampledField(path: string, count: FieldCount, documents: number): SampledField {
  const types = [...count.types.entries()].sort((left, right) => right[1] - left[1]).map(([type]) => type);
  return {
    path,
    label: count.label,
    depth: count.depth,
    types,
    share: Math.min(1, count.documents / Math.max(1, documents)),
    several: count.several,
    values: [...count.values.entries()].map(([type, values]) => ({ type, values: [...values.values()] })),
    dbrefs: [...count.dbrefs.values()],
  };
}

/** Feature: relation.fields — the fields of the sampled documents, `_id` first, then in order of first appearance. */
export function fields(documents: readonly Json[]): readonly SampledField[] {
  const walk: Walk = { counts: new Map(), seen: new Set() };
  const objects = documents.filter((document): document is JsonObject => isJsonObject(document));
  for (const document of objects) {
    walk.seen = new Set();
    for (const [key, value] of Object.entries(document)) {
      visit(walk, value, { path: key, label: key, depth: 0, several: false });
    }
  }
  return [...walk.counts.entries()]
    .sort(([leftPath, left], [rightPath, right]) => {
      const idFirst = Number(rightPath === '_id') - Number(leftPath === '_id');
      return idFirst === 0 ? left.order - right.order : idFirst;
    })
    .map(([path, count]) => sampledField(path, count, objects.length));
}
