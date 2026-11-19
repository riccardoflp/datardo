/**
 * What a value, or the keys of an object, can be at some place of a pipeline: the context of the cursor, found by
 * going down from the stage (or from the whole pipeline) through the keys of the objects that hold it. Ported from
 * Mongoster's `src/shared/complete.ts` (`stageContext`, `child`, `searchChild`).
 */
import {
  bsonTypeNames,
  metaValues,
  searchMetaOptions,
  searchOptions,
  vectorSearchOptions,
  type Word,
} from './vocabulary';

/** A context of the cursor. */
export type Place =
  | { readonly kind: 'query'; readonly prefix: string; readonly element?: string }
  | { readonly kind: 'field'; readonly field: string }
  | { readonly kind: 'value'; readonly field: string }
  | { readonly kind: 'list'; readonly of: Place }
  | { readonly kind: 'enum'; readonly values: readonly string[] }
  | { readonly kind: 'sort' }
  | { readonly kind: 'project' }
  | { readonly kind: 'expression'; readonly include?: boolean }
  | { readonly kind: 'pipeline' }
  | { readonly kind: 'stage' }
  | { readonly kind: 'group' }
  | { readonly kind: 'accumulators' }
  | { readonly kind: 'outputs'; readonly of: Place }
  /** An options object: `words` its keys with their notes; `value` what it can be instead of an object. */
  | {
      readonly kind: 'options';
      readonly keys: readonly string[];
      readonly children: Readonly<Record<string, Place>>;
      readonly value?: Place;
      readonly words?: readonly Word[];
    }
  /** A field name; `vector`: the arrays of numbers first. */
  | { readonly kind: 'field-name'; readonly vector?: boolean }
  /** The operators of `$search`, with the options of the stage when `stage` is set. */
  | { readonly kind: 'search'; readonly stage?: string }
  /** The names of the collection's search indexes of a type. */
  | { readonly kind: 'search-index'; readonly type: string }
  | { readonly kind: 'none' };

const none: Place = { kind: 'none' };
const expression: Place = { kind: 'expression' };
const bool: Place = { kind: 'enum', values: ['true', 'false'] };
const path: Place = { kind: 'field-name' };

function options(children: Readonly<Record<string, Place>>, value?: Place): Place {
  const keys = Object.keys(children);
  return value === undefined ? { kind: 'options', keys, children } : { kind: 'options', keys, children, value };
}

function described(words: readonly Word[], children: Readonly<Record<string, Place>>): Place {
  return { kind: 'options', keys: words.map(([key]) => key), children, words };
}

function oneOf(values: readonly string[]): Place {
  return { kind: 'enum', values: values.map((value) => JSON.stringify(value)) };
}

/** What an option of `$search` or `$searchMeta` can be. */
function searchOption(key: string): Place | undefined {
  switch (key) {
    case 'index':
      return { kind: 'search-index', type: 'search' };
    case 'highlight':
      return options({ path, maxCharsToExamine: none, maxNumPassages: none });
    case 'count':
      return options({ type: oneOf(['total', 'lowerBound']), threshold: none });
    case 'sort':
      return { kind: 'sort' };
    case 'returnStoredSource':
    case 'scoreDetails':
    case 'concurrent':
      return bool;
    case 'facet': {
      const facet = options({
        type: oneOf(['string', 'number', 'date']),
        path,
        numBuckets: none,
        boundaries: none,
        default: none,
      });
      return options({ operator: { kind: 'search' }, facets: { kind: 'outputs', of: facet } });
    }
    default:
      return undefined;
  }
}

const score = options({ boost: options({ value: none, path }), constant: options({ value: none }) });
const fuzzy = options({ maxEdits: none, prefixLength: none, maxExpansions: none });
const common = { path, score };
const operators: Place = { kind: 'list', of: { kind: 'search' } };

const searchOperatorPlaces: Readonly<Record<string, Place>> = {
  text: options({ query: none, ...common, fuzzy, matchCriteria: oneOf(['any', 'all']), synonyms: none }),
  phrase: options({ query: none, ...common, slop: none, synonyms: none }),
  autocomplete: options({ query: none, ...common, tokenOrder: oneOf(['any', 'sequential']), fuzzy }),
  compound: options({
    must: operators,
    should: operators,
    filter: operators,
    mustNot: operators,
    minimumShouldMatch: none,
    score,
  }),
  equals: options({ ...common, value: none }),
  in: options({ ...common, value: none }),
  range: options({ ...common, gt: none, gte: none, lt: none, lte: none }),
  exists: options(common),
  wildcard: options({ query: none, ...common, allowAnalyzedField: bool }),
  regex: options({ query: none, ...common, allowAnalyzedField: bool }),
  queryString: options({ defaultPath: path, query: none, score }),
  near: options({ ...common, origin: none, pivot: none }),
  moreLikeThis: options({ like: none, score }),
  embeddedDocument: options({ path, operator: { kind: 'search' }, score }),
};

/** What the value of a `$search` operator, or with `stage` of an option of the stage, can be. */
function searchChild(key: string, stage?: string): Place {
  const option = stage === undefined ? undefined : searchOption(key);
  return option ?? (Object.hasOwn(searchOperatorPlaces, key) ? searchOperatorPlaces[key] : undefined) ?? none;
}

const stagePlaces: Readonly<Record<string, Place>> = {
  $match: { kind: 'query', prefix: '' },
  $sort: { kind: 'sort' },
  $project: { kind: 'project' },
  $addFields: { kind: 'project' },
  $set: { kind: 'project' },
  $group: { kind: 'group' },
  $unwind: options({ path: expression, includeArrayIndex: none, preserveNullAndEmptyArrays: bool }, expression),
  $lookup: options({
    from: none,
    localField: path,
    foreignField: none,
    as: none,
    let: { kind: 'outputs', of: expression },
    pipeline: { kind: 'pipeline' },
  }),
  $unset: path,
  $replaceRoot: options({ newRoot: expression }),
  $sample: options({ size: none }),
  $facet: { kind: 'outputs', of: { kind: 'pipeline' } },
  $bucket: options({
    groupBy: expression,
    boundaries: none,
    default: none,
    output: { kind: 'outputs', of: { kind: 'accumulators' } },
  }),
  $bucketAuto: options({
    groupBy: expression,
    buckets: none,
    output: { kind: 'outputs', of: { kind: 'accumulators' } },
    granularity: none,
  }),
  $unionWith: options({ coll: none, pipeline: { kind: 'pipeline' } }),
  $merge: options({
    into: none,
    on: none,
    whenMatched: oneOf(['replace', 'keepExisting', 'merge', 'fail']),
    whenNotMatched: oneOf(['insert', 'discard', 'fail']),
  }),
  $search: { kind: 'search', stage: '$search' },
  $searchMeta: { kind: 'search', stage: '$searchMeta' },
  $vectorSearch: described(vectorSearchOptions, {
    index: { kind: 'search-index', type: 'vectorSearch' },
    path: { kind: 'field-name', vector: true },
    filter: { kind: 'query', prefix: '' },
    exact: bool,
  }),
  $limit: none,
  $skip: none,
  $count: none,
  $out: none,
};

/** What the body of a stage is: `$limit`, `$skip`, `$count` and `$out` suggest nothing; an unknown stage, expressions. */
export function stagePlace(name: string): Place {
  return Object.hasOwn(stagePlaces, name) ? (stagePlaces[name] ?? expression) : expression;
}

/** The options of `$search` or `$searchMeta`. */
export function searchStageOptions(stage: string): readonly Word[] {
  return stage === '$searchMeta' ? searchMetaOptions : searchOptions;
}

const comparisons = ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte'];

function queryChild(place: Extract<Place, { kind: 'query' }>, key: string | null): Place {
  if (key === null) {
    return none;
  }
  if (key === '$and' || key === '$or' || key === '$nor') {
    return { kind: 'list', of: { kind: 'query', prefix: place.prefix } };
  }
  if (key === '$expr') {
    return expression;
  }
  if (key === '$text') {
    return options({ $search: none, $language: none, $caseSensitive: bool, $diacriticSensitive: bool });
  }
  if (key.startsWith('$')) {
    return place.element === undefined ? none : fieldChild(place.element, key);
  }
  return { kind: 'field', field: place.prefix + key };
}

function fieldChild(field: string, key: string | null): Place {
  if (key === null || !key.startsWith('$')) {
    return none;
  }
  if (key === '$in' || key === '$nin' || key === '$all') {
    return { kind: 'list', of: { kind: 'value', field } };
  }
  if (key === '$elemMatch') {
    return { kind: 'query', prefix: `${field}.`, element: field };
  }
  if (key === '$not') {
    return { kind: 'field', field };
  }
  if (key === '$exists') {
    return bool;
  }
  if (key === '$type') {
    return oneOf(bsonTypeNames);
  }
  return comparisons.includes(key) ? { kind: 'value', field } : none;
}

function keyedChild(place: Place, key: string): Place {
  switch (place.kind) {
    case 'sort':
      return { kind: 'enum', values: ['1', '-1'] };
    case 'project':
      return { kind: 'expression', include: true };
    case 'stage':
      return stagePlace(key);
    case 'group':
      return key === '_id' ? expression : { kind: 'accumulators' };
    case 'accumulators':
      return expression;
    case 'outputs':
      return place.of;
    case 'options':
      return Object.hasOwn(place.children, key) ? (place.children[key] ?? none) : none;
    case 'search':
      return searchChild(key, place.stage);
    case 'query':
    case 'field':
    case 'value':
    case 'list':
    case 'enum':
    case 'expression':
    case 'pipeline':
    case 'field-name':
    case 'search-index':
    case 'none':
      return none;
  }
}

/** The context of the value under `key` (`null`: an element of an array) of a value in the context `place`. */
export function child(place: Place, key: string | null): Place {
  switch (place.kind) {
    case 'query':
      return queryChild(place, key);
    case 'field':
      return fieldChild(place.field, key);
    case 'list':
      return key === null ? place.of : none;
    case 'expression':
      return key === '$meta' ? { kind: 'enum', values: metaValues } : expression;
    case 'pipeline':
      return key === null ? { kind: 'stage' } : none;
    case 'field-name':
      return key === null ? place : none;
    case 'value':
    case 'enum':
    case 'sort':
    case 'project':
    case 'stage':
    case 'group':
    case 'accumulators':
    case 'outputs':
    case 'options':
    case 'search':
    case 'search-index':
    case 'none':
      return key === null ? none : keyedChild(place, key);
  }
}
