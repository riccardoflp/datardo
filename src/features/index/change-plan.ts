/**
 * Feature: index.change-plan
 *
 * Decides whether an index edited in the dialog is unchanged, changed in place with `collMod`, or dropped and built
 * again, and lists what changed. Definitions are relaxed values (`types.ts › relaxedValue`), as `createIndex` takes
 * them.
 */
import type { Json } from '../../shared/engine-request';
import { isDocument, type IndexDefinition, type JsonDocument } from './types';

/** What `getIndexes` reports that `createIndex` does not take back, or that says nothing. */
const reportedOnly = new Set(['v', 'key', 'name', 'ns', 'background', 'textIndexVersion', '2dsphereIndexVersion']);

/** The flags whose `false` is the default. */
const flags = new Set(['unique', 'sparse', 'hidden']);

/** The options `collMod` changes on an existing index, without building it again. */
const inPlace = new Set(['hidden', 'expireAfterSeconds']);

/** What changing an index takes. */
export type IndexChange =
  | { readonly kind: 'none' }
  /** `collMod` on the existing index: nothing is built again. */
  | { readonly kind: 'modify'; readonly hidden?: boolean; readonly expireAfterSeconds?: number }
  /** MongoDB cannot change the rest: the index is dropped and built again. `changed` lists what differs. */
  | { readonly kind: 'recreate'; readonly changed: readonly string[] };

/** Feature: index.change-plan — the name MongoDB gives an index created without one: `a_1_b.c_-1`. */
export function generatedName(keys: JsonDocument): string {
  return Object.entries(keys)
    .map(([field, value]) => `${field}_${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join('_');
}

/** The name of a definition: the one given, or the one MongoDB generates. */
export function indexName(definition: IndexDefinition): string {
  const name = definition.options['name'];
  return typeof name === 'string' && name !== '' ? name : generatedName(definition.keys);
}

function normalizedWeights(weights: JsonDocument, keys: JsonDocument): JsonDocument | undefined {
  const kept = Object.entries(weights).filter(([field, weight]) => weight !== 1 || keys[field] !== 'text');
  return kept.length === 0 ? undefined : Object.fromEntries(kept);
}

/**
 * Feature: index.change-plan — a definition without what means the default: false flags, `background`, `null`
 * options, the name MongoDB would generate, and text weights of 1. Equal definitions then compare equal.
 */
export function normalized(definition: IndexDefinition): IndexDefinition {
  const options: Record<string, Json> = {};
  for (const [key, value] of Object.entries(definition.options)) {
    if (value === null || key === 'background' || (flags.has(key) && value === false)) {
      continue;
    }
    if (key === 'name' && value === generatedName(definition.keys)) {
      continue;
    }
    if (key === 'weights' && isDocument(value)) {
      const weights = normalizedWeights(value, definition.keys);
      if (weights !== undefined) {
        options[key] = weights;
      }
      continue;
    }
    options[key] = value;
  }
  return { keys: definition.keys, options };
}

/** A text index's keys `{ _fts: "text", _ftsx: 1 }` put back as its fields, each `"text"`, in their place. */
function textKeys(key: JsonDocument, weights: JsonDocument): JsonDocument {
  const keys: Record<string, Json> = {};
  for (const [field, value] of Object.entries(key)) {
    if (field === '_fts') {
      for (const weighted of Object.keys(weights)) {
        keys[weighted] = 'text';
      }
    } else if (field !== '_ftsx') {
      keys[field] = value;
    }
  }
  return keys;
}

/**
 * Feature: index.change-plan — the definition that would build an index again as `getIndexes` reports it: without
 * what is only reported, the text defaults and the collation's version, with a text index's fields in its keys.
 */
export function editableDefinition(name: string, key: JsonDocument, reported: JsonDocument): IndexDefinition {
  const options: Record<string, Json> = {};
  for (const [option, value] of Object.entries(reported)) {
    if (!reportedOnly.has(option)) {
      options[option] = value;
    }
  }
  let keys = key;
  if ('_fts' in key) {
    keys = textKeys(key, isDocument(options['weights']) ? options['weights'] : {});
    if (options['default_language'] === 'english') {
      delete options['default_language'];
    }
    if (options['language_override'] === 'language') {
      delete options['language_override'];
    }
  }
  const collation = options['collation'];
  if (isDocument(collation)) {
    const { version: _version, ...rest } = collation;
    options['collation'] = rest;
  }
  return normalized({ keys, options: { ...options, name } });
}

/** JSON with the fields of objects sorted: the order of the options never makes two definitions differ. */
export function stable(value: Json): string {
  if (Array.isArray(value)) {
    return `[${(value as readonly Json[]).map(stable).join(',')}]`;
  }
  if (isDocument(value)) {
    const fields = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key] ?? null)}`);
    return `{${fields.join(',')}}`;
  }
  return JSON.stringify(value);
}

/** What differs between two normalized definitions: `keys`, `name`, then the options by name. */
function changes(current: IndexDefinition, next: IndexDefinition): readonly string[] {
  const changed: string[] = [];
  if (JSON.stringify(current.keys) !== JSON.stringify(next.keys)) {
    changed.push('keys');
  }
  if (indexName(current) !== indexName(next)) {
    changed.push('name');
  }
  for (const option of new Set([...Object.keys(current.options), ...Object.keys(next.options)])) {
    const before = current.options[option];
    const after = next.options[option];
    if (option !== 'name' && stable(before ?? null) !== stable(after ?? null)) {
      changed.push(option);
    }
  }
  return changed;
}

/** Feature: index.change-plan — what turning the index `current` into `next` takes. */
export function indexChange(current: IndexDefinition, next: IndexDefinition): IndexChange {
  const before = normalized(current);
  const after = normalized(next);
  const changed = changes(before, after);
  if (changed.length === 0) {
    return { kind: 'none' };
  }
  const ttlAfter = after.options['expireAfterSeconds'];
  const ttlOnBoth = typeof before.options['expireAfterSeconds'] === 'number' && typeof ttlAfter === 'number';
  if (changed.every((option) => inPlace.has(option)) && (ttlOnBoth || !changed.includes('expireAfterSeconds'))) {
    return {
      kind: 'modify',
      ...(changed.includes('hidden') ? { hidden: after.options['hidden'] === true } : {}),
      ...(changed.includes('expireAfterSeconds') && typeof ttlAfter === 'number'
        ? { expireAfterSeconds: ttlAfter }
        : {}),
    };
  }
  return { kind: 'recreate', changed };
}

/** The units of a TTL, from the largest. */
export const ttlUnits = ['days', 'hours', 'minutes', 'seconds'] as const;

/** A unit of a TTL. */
export type TtlUnit = (typeof ttlUnits)[number];

const unitSeconds: Readonly<Record<TtlUnit, number>> = { days: 86_400, hours: 3600, minutes: 60, seconds: 1 };

/** Feature: index.change-plan — seconds as a count of the largest unit that divides them: 86,400 is 1 days. */
export function ttlParts(seconds: number): { readonly value: number; readonly unit: TtlUnit } {
  const unit = ttlUnits.find((each) => seconds !== 0 && seconds % unitSeconds[each] === 0) ?? 'seconds';
  return { value: seconds / unitSeconds[unit], unit };
}

/** Feature: index.change-plan — a TTL read back: the count times the unit. */
export function ttlSeconds(value: number, unit: TtlUnit): number {
  return value * unitSeconds[unit];
}
