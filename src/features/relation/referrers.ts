/**
 * Feature: relation.referrers
 *
 * Works out, from the references of a database, the collections and the filters that find the documents referring
 * to a document: the referring collection filtered on its field with the value the reference reaches, `{ userId:
 * <_id> }`, `{ "author.$id": <_id> }` for DBRefs; MongoDB matches a field inside an array as it is written. Ported from
 * Mongoster's `referencingTargets`.
 */
import type { Json } from '../../shared/engine-request';
import { formattedValue } from '../query/format';
import { isJsonObject, isSubdocument } from '../query/mongosh/ejson';
import { isReferenceValue } from './model/values';
import { filterOn } from './targets';
import { compareText, type ReferenceTarget, type Relation } from './types';

/** The value at a dotted path of a document, without going into arrays or typed values. */
function valueAt(document: Json, path: string): Json | undefined {
  let current: Json | undefined = document;
  for (const part of path.split('.')) {
    if (!isSubdocument(current) || !Object.hasOwn(current, part)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

/** Feature: relation.referrers — the documents that refer to `document`, one target per collection and filter. */
export function referencingTargets(incoming: readonly Relation[], document: Json): readonly ReferenceTarget[] {
  if (!isJsonObject(document)) {
    return [];
  }
  const found: ReferenceTarget[] = [];
  for (const relation of incoming.filter((each) => each.kind !== 'view')) {
    const value = valueAt(document, relation.toField);
    if (!isReferenceValue(value)) {
      continue;
    }
    const field = relation.kind === 'dbref' ? `${relation.field}.$id` : relation.field;
    const filter = filterOn(field, [value]);
    const filterText = formattedValue(filter, 'one-line');
    if (found.some((each) => each.collection === relation.from && each.filterText === filterText)) {
      continue;
    }
    found.push({
      collection: relation.from,
      filter,
      filterText,
      label: `${relation.from}.${relation.fieldLabel}`,
      count: 1,
    });
  }
  return found.sort((left, right) => compareText(left.label, right.label));
}
