/**
 * The fields of a sample of documents, with their BSON types and how often each is present, as `describe_collection`
 * lists them. This is the part of the schema analysis the tool needs; `schema.analyze` (M23) is not built yet, and
 * once it is, the tool takes its result in place of this.
 */
import type { Json } from '../../../shared/engine-request';
import { bsonType, isSubdocument } from '../../query/mongosh/ejson';

/** A field of the sample: its path, the documents that have it, and how many of them have each type. */
export interface SampledField {
  readonly path: string;
  readonly count: number;
  readonly types: readonly (readonly [string, number])[];
}

interface Tally {
  count: number;
  readonly types: Map<string, number>;
}

function walk(value: Json, prefix: string, seen: Map<string, Set<string>>, tallies: Map<string, Tally>): void {
  if (!isSubdocument(value)) {
    return;
  }
  for (const [key, each] of Object.entries(value)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    const types = seen.get(path) ?? new Set<string>();
    types.add(bsonType(each));
    seen.set(path, types);
    if (!tallies.has(path)) {
      tallies.set(path, { count: 0, types: new Map() });
    }
    const elements = Array.isArray(each) ? (each as readonly Json[]) : [each];
    for (const element of elements) {
      walk(element, path, seen, tallies);
    }
  }
}

/** The fields of the documents, in the order they were first met, nested ones after their parent. */
export function sampledFields(documents: readonly Json[]): readonly SampledField[] {
  const tallies = new Map<string, Tally>();
  for (const document of documents) {
    const seen = new Map<string, Set<string>>();
    walk(document, '', seen, tallies);
    for (const [path, types] of seen) {
      const tally = tallies.get(path);
      if (tally === undefined) {
        continue;
      }
      tally.count += 1;
      for (const type of types) {
        tally.types.set(type, (tally.types.get(type) ?? 0) + 1);
      }
    }
  }
  // A parent is met before its fields, so the order of first meeting keeps each field after its parent.
  return [...tallies.keys()].map((path) => {
    const tally = tallies.get(path) ?? { count: 0, types: new Map<string, number>() };
    const types = [...tally.types].sort((one, other) => other[1] - one[1]);
    return { path, count: tally.count, types };
  });
}

function percent(part: number, whole: number): string {
  return `${String(Math.round((part / Math.max(1, whole)) * 100))}%`;
}

/** `- address.city: string 98%, null 2% (100%)`: the types, with their shares when several, and the field's share. */
export function fieldLine(field: SampledField, sampled: number): string {
  const several = field.types.length > 1;
  const types = field.types.map(([type, count]) => (several ? `${type} ${percent(count, field.count)}` : type));
  return `- ${field.path}: ${types.join(', ')} (${percent(field.count, sampled)})`;
}
