/**
 * Feature: oplog.updated-fields — the `f` of an update event: the fields a Meteor app reads again, computed as
 * redis-oplog's `getFields` does.
 */
import type { Json } from '../../shared/engine-request';

type JsonObject = Readonly<Record<string, Json>>;

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A path cut at its first part that is a position or starts with `$`: `items.1.qty`, `tags.$` → `items`, `tags`. */
export function cutPath(path: string): string {
  const parts = path.split('.');
  const at = parts.findIndex((part, index) => index > 0 && (/^\d+$/u.test(part) || part.startsWith('$')));
  return at < 0 ? path : parts.slice(0, at).join('.');
}

function pipelineFields(stages: readonly Json[]): string[] | undefined {
  const fields: string[] = [];
  for (const stage of stages) {
    const [operator, body] = isObject(stage) ? (Object.entries(stage)[0] ?? []) : [];
    if ((operator === '$set' || operator === '$addFields') && isObject(body)) {
      fields.push(...Object.keys(body).map(cutPath));
    } else if (operator === '$unset') {
      const names = Array.isArray(body) ? (body as readonly Json[]) : [body ?? null];
      fields.push(...names.filter((name): name is string => typeof name === 'string').map(cutPath));
    } else {
      return undefined;
    }
  }
  return fields;
}

function operatorFields(update: JsonObject): string[] {
  const fields: string[] = [];
  for (const [operator, body] of Object.entries(update)) {
    if (!operator.startsWith('$')) {
      fields.push(operator);
    } else if (isObject(body)) {
      fields.push(...Object.keys(body).map(cutPath));
      // $rename changes the new names too.
      const renamed = operator === '$rename' ? Object.values(body) : [];
      fields.push(...renamed.filter((to): to is string => typeof to === 'string').map(cutPath));
    }
  }
  return fields;
}

/**
 * Feature: oplog.updated-fields. The fields an update by operators, a replacement or an update pipeline changes;
 * nothing when a pipeline stage hides them (`$project`, `$replaceWith`, …). `_id` is never one; each comes once.
 */
export function updatedFields(update: Json | undefined): readonly string[] | undefined {
  if (update === undefined || update === null) {
    return [];
  }
  const fields = Array.isArray(update)
    ? pipelineFields(update as readonly Json[])
    : isObject(update)
      ? operatorFields(update)
      : [];
  return fields === undefined ? undefined : [...new Set(fields)].filter((field) => field !== '_id');
}

/** Every key of the documents given, once, but `_id`; `null` and missing documents are skipped. */
export function documentFields(...documents: readonly (Json | undefined)[]): readonly string[] {
  const keys = documents.flatMap((document) => (isObject(document) ? Object.keys(document) : []));
  return [...new Set(keys)].filter((field) => field !== '_id');
}
