/**
 * What the server reports, reduced to what `structure.steps` compares (`structure.read`, rule 1): the options of a
 * collection without their defaults, an index of `listIndexes` as `createIndex` would take it back, a search index of
 * `$listSearchIndexes` with its type. Ported from Mongoster's `src/shared/structure.ts › normalizeOptions`,
 * `indexShape`, `src/shared/indexes.ts › editableSpec` and `src/shared/searchIndexes.ts › searchIndexType`.
 */
import type { Json } from '../../../shared/engine-request';
import type { CollectionType, IndexDefinition, JsonObject, SearchIndexDefinition } from '../types';
import { normalizedOptions } from './index-change';
import { isDocument, numberValue, without } from './values';

/** The options of `listCollections` that make a collection behave otherwise. */
const collectionOptions = [
  'validator',
  'validationLevel',
  'validationAction',
  'capped',
  'size',
  'max',
  'timeseries',
  'expireAfterSeconds',
  'clusteredIndex',
  'collation',
  'changeStreamPreAndPostImages',
];

/** The options of a view. */
const viewOptions = ['viewOn', 'pipeline', 'collation'];

/** What `listIndexes` reports and `createIndex` does not take back, or that says nothing. */
const reportedOnly = ['v', 'key', 'name', 'ns', 'background', 'textIndexVersion', '2dsphereIndexVersion'];

function picked(raw: JsonObject, names: readonly string[]): Record<string, Json> {
  const kept: Record<string, Json> = {};
  for (const name of names) {
    const value = raw[name];
    if (value !== undefined && value !== null) {
      kept[name] = value;
    }
  }
  return kept;
}

function withoutCappedDefaults(options: Record<string, Json>): void {
  if (options['capped'] !== true) {
    delete options['capped'];
    delete options['size'];
    delete options['max'];
  } else if (!numberValue(options['max'])) {
    delete options['max'];
  }
}

function withoutCollectionDefaults(options: Record<string, Json>): void {
  const validator = options['validator'];
  if (isDocument(validator) && Object.keys(validator).length === 0) {
    delete options['validator'];
  }
  if (options['validationLevel'] === 'strict') {
    delete options['validationLevel'];
  }
  if (options['validationAction'] === 'error') {
    delete options['validationAction'];
  }
  withoutCappedDefaults(options);
  const images = options['changeStreamPreAndPostImages'];
  if (isDocument(images) && images['enabled'] !== true) {
    delete options['changeStreamPreAndPostImages'];
  }
  const clustered = options['clusteredIndex'];
  if (isDocument(clustered)) {
    const kept = without(clustered, ['v']);
    options['clusteredIndex'] = kept['name'] === '_id_' ? without(kept, ['name']) : kept;
  }
  // The bucketing a granularity implies is reported by some versions only.
  const series = options['timeseries'];
  if (isDocument(series) && typeof series['granularity'] === 'string') {
    options['timeseries'] = without(series, ['bucketMaxSpanSeconds', 'bucketRoundingSeconds']);
  }
}

/** The options as compared: those that matter, without what means the default and the collation's `version`. */
export function normalizedCollectionOptions(type: CollectionType, raw: JsonObject): JsonObject {
  const options = picked(raw, type === 'view' ? viewOptions : collectionOptions);
  if (type === 'view') {
    if (!Array.isArray(options['pipeline'])) {
      options['pipeline'] = [];
    }
  } else {
    withoutCollectionDefaults(options);
  }
  const collation = options['collation'];
  if (isDocument(collation)) {
    options['collation'] = without(collation, ['version']);
  }
  return options;
}

/** The keys of a text index with its fields back: `{ _fts: "text", _ftsx: 1 }` and the weights give the fields. */
function textKeys(key: JsonObject, weights: JsonObject): JsonObject {
  const keys: Record<string, Json> = {};
  for (const [field, value] of Object.entries(key)) {
    if (field === '_fts') {
      for (const name of Object.keys(weights)) {
        keys[name] = 'text';
      }
    } else if (field !== '_ftsx') {
      keys[field] = value;
    }
  }
  return keys;
}

function reportedOptions(raw: JsonObject): Record<string, Json> {
  const options: Record<string, Json> = { ...without(raw, reportedOnly) };
  const collation = options['collation'];
  if (isDocument(collation)) {
    options['collation'] = without(collation, ['version']);
  }
  return options;
}

/** An index of `listIndexes` as compared; `undefined` for `_id_`, which every collection has. */
export function indexDefinition(raw: JsonObject): IndexDefinition | undefined {
  const key = raw['key'];
  const name = raw['name'];
  if (name === '_id_' || typeof name !== 'string' || !isDocument(key)) {
    return undefined;
  }
  const options = reportedOptions(raw);
  let keys = key;
  if ('_fts' in key) {
    const weights = options['weights'];
    keys = textKeys(key, isDocument(weights) ? weights : {});
    if (options['default_language'] === 'english') {
      delete options['default_language'];
    }
    if (options['language_override'] === 'language') {
      delete options['language_override'];
    }
  }
  return { name, keys, options: without(normalizedOptions(keys, options), ['name']) };
}

/** The type of a search index: what Atlas says, or by the definition's shape (`fields` for a vector index). */
function searchType(raw: JsonObject, definition: JsonObject): string {
  const type = raw['type'];
  if (typeof type === 'string' && type !== '') {
    return type;
  }
  return Array.isArray(definition['fields']) && !isDocument(definition['mappings']) ? 'vectorSearch' : 'search';
}

/** A search index of `$listSearchIndexes` as compared; `undefined` for an entry without a name. */
export function searchIndexDefinition(raw: JsonObject): SearchIndexDefinition | undefined {
  const name = raw['name'];
  if (typeof name !== 'string') {
    return undefined;
  }
  const latest = raw['latestDefinition'];
  const definition = isDocument(latest) ? latest : {};
  return { name, type: searchType(raw, definition), definition };
}
