/**
 * The rule of the Indexes area that says what changing one index into another takes: nothing, a `collMod` of the
 * index in place (only `hidden` and a TTL that both have), or dropping it and building it again. Ported from
 * Mongoster's `src/shared/indexes.ts › planIndexChange`, `normalizeSpec`, `defaultIndexName`; it belongs to the
 * Indexes area (M22), which is written beside this one, and is to be replaced by its rule once both are merged.
 */
import type { Json } from '../../../shared/engine-request';
import type { IndexDefinition, JsonObject } from '../types';
import { isDocument, numberValue, orderedText, stableText } from './values';

/** What a change of an index takes. */
export type IndexChange =
  | { readonly kind: 'none' }
  /** A `collMod` of the existing index: nothing is built again. */
  | { readonly kind: 'modify'; readonly hidden?: boolean; readonly expireAfterSeconds?: Json }
  /** MongoDB cannot change the rest: the index is dropped and built again. `changed` lists what differs. */
  | { readonly kind: 'recreate'; readonly changed: readonly string[] };

/** The options `collMod` changes on an existing index, without building it again. */
const inPlace = new Set(['hidden', 'expireAfterSeconds']);

/** The options that are flags, left out when false. */
const flags = new Set(['unique', 'sparse', 'hidden']);

/** What an index's options hold that never counts: the index version, its namespace, how it was built. */
const ignored = new Set(['v', 'ns', 'background']);

/** The text of a key's value in a generated name: `1`, `-1`, `text`, `2dsphere`. */
function keyValueText(value: Json | undefined): string {
  const number = numberValue(value);
  return number === undefined ? (typeof value === 'string' ? value : orderedText(value)) : String(number);
}

/** The name MongoDB gives an index created without one: `status_1`, `a_1_b_-1`. */
export function defaultIndexName(keys: JsonObject): string {
  return Object.entries(keys)
    .map(([field, value]) => `${field}_${keyValueText(value)}`)
    .join('_');
}

function textWeights(keys: JsonObject, weights: JsonObject): JsonObject | undefined {
  const kept = Object.entries(weights).filter(([field, weight]) => numberValue(weight) !== 1 || keys[field] !== 'text');
  return kept.length === 0 ? undefined : Object.fromEntries(kept);
}

/**
 * The options without what does not count: `v`, `ns`, `background`, false flags, the generated name, text weights
 * of 1.
 */
export function normalizedOptions(keys: JsonObject, options: JsonObject): JsonObject {
  const kept: Record<string, Json> = {};
  for (const [key, value] of Object.entries(options)) {
    const isDefault =
      value === null ||
      ignored.has(key) ||
      (flags.has(key) && value === false) ||
      (key === 'name' && value === defaultIndexName(keys));
    if (isDefault) {
      continue;
    }
    if (key === 'weights' && isDocument(value)) {
      const weights = textWeights(keys, value);
      if (weights !== undefined) {
        kept[key] = weights;
      }
      continue;
    }
    kept[key] = value;
  }
  return kept;
}

/** The options of an index with its name, as `createIndex` takes them (a generated name left out). */
export function createOptions(index: IndexDefinition): JsonObject {
  return normalizedOptions(index.keys, { ...index.options, name: index.name });
}

function changedOptions(current: IndexDefinition, next: IndexDefinition): readonly string[] {
  const left = normalizedOptions(current.keys, current.options);
  const right = normalizedOptions(next.keys, next.options);
  const names = [...new Set([...Object.keys(left), ...Object.keys(right)])];
  return names.filter((name) => name !== 'name' && stableText(left[name]) !== stableText(right[name]));
}

/** What turning the index `current` into `next` takes. */
export function planIndexChange(current: IndexDefinition, next: IndexDefinition): IndexChange {
  const changed: string[] = [];
  // The order of the keys is part of the index.
  if (orderedText(current.keys) !== orderedText(next.keys)) {
    changed.push('keys');
  }
  if (current.name !== next.name) {
    changed.push('name');
  }
  changed.push(...changedOptions(current, next));
  if (changed.length === 0) {
    return { kind: 'none' };
  }
  // A TTL can be changed in place, but not added to an index or removed from it.
  const bothTtl =
    numberValue(current.options['expireAfterSeconds']) !== undefined &&
    numberValue(next.options['expireAfterSeconds']) !== undefined;
  if (changed.every((name) => inPlace.has(name)) && (bothTtl || !changed.includes('expireAfterSeconds'))) {
    return {
      kind: 'modify',
      ...(changed.includes('hidden') ? { hidden: next.options['hidden'] === true } : {}),
      ...(changed.includes('expireAfterSeconds')
        ? { expireAfterSeconds: next.options['expireAfterSeconds'] ?? null }
        : {}),
    };
  }
  return { kind: 'recreate', changed };
}
