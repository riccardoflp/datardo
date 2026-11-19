/**
 * Feature: oplog.changes — for writes whose effect isn't known in advance (restoring a version, an undo, a playground
 * `bulkWrite`), the events come from the documents they may have touched, read by `_id` before and after.
 */
import type { Json } from '../../shared/engine-request';
import type { OplogEvent } from './types';
import { sameValueKey } from './types';
import { documentFields } from './updated-fields';

type JsonObject = Readonly<Record<string, Json>>;

function isDocument(value: Json): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Feature: oplog.changes. A document after whose `_id` wasn't before is an insert; one before whose `_id` isn't after
 * is a removal; one in both is an update of the fields whose values differ, compared as canonical Extended JSON.
 * Inserts and updates come in the order of the documents after, then the removals.
 */
export function changeEvents(before: readonly Json[], after: readonly Json[]): readonly OplogEvent[] {
  const was = new Map(before.filter(isDocument).map((document) => [sameValueKey(document['_id']), document]));
  const seen = new Set<string>();
  const events: OplogEvent[] = [];
  for (const document of after.filter(isDocument)) {
    const key = sameValueKey(document['_id']);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const id = document['_id'] ?? null;
    const old = was.get(key);
    if (old === undefined) {
      events.push({ e: 'i', id });
      continue;
    }
    const fields = documentFields(old, document).filter(
      (field) => sameValueKey(old[field]) !== sameValueKey(document[field]),
    );
    if (fields.length > 0) {
      events.push({ e: 'u', id, fields });
    }
  }
  for (const [key, old] of was) {
    if (!seen.has(key)) {
      events.push({ e: 'r', id: old['_id'] ?? null });
    }
  }
  return events;
}
