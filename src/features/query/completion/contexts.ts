/**
 * What a value, or the keys of an object, can be at a place of a text (`query.suggestions`), ported from Mongoster's
 * `child`, `rootContext` and `stageContext`.
 */
import {
  analyzers,
  fieldMappingOptions,
  mappingOptions,
  metaValues,
  quoted,
  searchDefinitionOptions,
  searchFieldTypes,
  typeNames,
  vectorDefinitionOptions,
  vectorFieldOptions,
  vectorSearchOptions,
  type Term,
} from './vocabulary';

/** The kinds of text suggestions are given for. */
export type TextKind =
  | 'filter'
  | 'sort'
  | 'project'
  | 'update'
  | 'index'
  | 'pipeline'
  /** One stage as an object: `{ $match: … }`. */
  | 'stageObject'
  /** The name of a field as a string, `distinct("…")`. */
  | 'field'
  /** A document to insert, or an array of them. */
  | 'document'
  | 'searchDefinition'
  | 'vectorDefinition'
  /** The body of a stage of a given operator. */
  | { readonly stage: string };

/** What stands at a place of the text. */
export type Place =
  | { readonly k: 'query'; readonly prefix: string; readonly element?: string }
  | { readonly k: 'field'; readonly field: string }
  | { readonly k: 'value'; readonly field: string }
  | { readonly k: 'list'; readonly of: Place }
  | { readonly k: 'enum'; readonly values: readonly string[] }
  | { readonly k: 'sort'; readonly index?: boolean }
  | { readonly k: 'project'; readonly aggregate: boolean }
  | { readonly k: 'expr'; readonly include?: boolean }
  | { readonly k: 'update' }
  | { readonly k: 'updateFields'; readonly operator: string }
  | { readonly k: 'pipeline' }
  | { readonly k: 'stageObject' }
  | { readonly k: 'group' }
  | { readonly k: 'accumulators' }
  | { readonly k: 'outputs'; readonly of: Place }
  /** `info`: descriptions and skeletons of the keys; `each`: an array of such objects is fine too. */
  | {
      readonly k: 'options';
      readonly keys: readonly string[];
      readonly children: Readonly<Record<string, Place>>;
      readonly value?: Place;
      readonly info?: readonly Term[];
      readonly each?: boolean;
    }
  /** `vector`: the arrays of numbers first. */
  | { readonly k: 'fieldName'; readonly vector?: boolean }
  /** The keys of a document, or of a sub-document at `prefix`; `field`: the field the value belongs to. */
  | { readonly k: 'document'; readonly prefix: string; readonly field?: string }
  | { readonly k: 'searchOperators'; readonly stage?: string }
  | { readonly k: 'searchIndex'; readonly type: string }
  | { readonly k: 'searchFields'; readonly prefix: string }
  | { readonly k: 'none' };

/** Nothing is suggested. */
export const nothing: Place = { k: 'none' };
const expression: Place = { k: 'expr' };
const flag: Place = { k: 'enum', values: ['true', 'false'] };
const path: Place = { k: 'fieldName' };

function options(children: Readonly<Record<string, Place>>, value?: Place): Place {
  return { k: 'options', keys: Object.keys(children), children, ...(value === undefined ? {} : { value }) };
}

function described(info: readonly Term[], children: Readonly<Record<string, Place>>, each = false): Place {
  return { k: 'options', keys: info.map(([key]) => key), children, info, each };
}

function oneOf(values: readonly string[]): Place {
  return { k: 'enum', values: quoted(values) };
}

function searchStageChild(key: string): Place | undefined {
  switch (key) {
    case 'index':
      return { k: 'searchIndex', type: 'search' };
    case 'highlight':
      return options({ path, maxCharsToExamine: nothing, maxNumPassages: nothing });
    case 'count':
      return options({ type: oneOf(['total', 'lowerBound']), threshold: nothing });
    case 'sort':
      return { k: 'sort' };
    case 'returnStoredSource':
    case 'scoreDetails':
    case 'concurrent':
      return flag;
    case 'facet': {
      const facet = options({
        type: oneOf(['string', 'number', 'date']),
        path,
        numBuckets: nothing,
        boundaries: nothing,
        default: nothing,
      });
      return options({ operator: { k: 'searchOperators' }, facets: { k: 'outputs', of: facet } });
    }
    default:
      return undefined;
  }
}

/** What the value of a $search operator can be, or with `stage`, of an option of the stage. */
function searchChild(key: string, stage?: string): Place {
  const ofStage = stage === undefined ? undefined : searchStageChild(key);
  if (ofStage !== undefined) {
    return ofStage;
  }
  const score = options({ boost: options({ value: nothing, path }), constant: options({ value: nothing }) });
  const fuzzy = options({ maxEdits: nothing, prefixLength: nothing, maxExpansions: nothing });
  const common = { path, score };
  const operators: Place = { k: 'list', of: { k: 'searchOperators' } };
  switch (key) {
    case 'text':
      return options({ query: nothing, ...common, fuzzy, matchCriteria: oneOf(['any', 'all']), synonyms: nothing });
    case 'phrase':
      return options({ query: nothing, ...common, slop: nothing, synonyms: nothing });
    case 'autocomplete':
      return options({ query: nothing, ...common, tokenOrder: oneOf(['any', 'sequential']), fuzzy });
    case 'compound':
      return options({
        must: operators,
        should: operators,
        filter: operators,
        mustNot: operators,
        minimumShouldMatch: nothing,
        score,
      });
    case 'equals':
    case 'in':
      return options({ ...common, value: nothing });
    case 'range':
      return options({ ...common, gt: nothing, gte: nothing, lt: nothing, lte: nothing });
    case 'exists':
      return options(common);
    case 'wildcard':
    case 'regex':
      return options({ query: nothing, ...common, allowAnalyzedField: flag });
    case 'queryString':
      return options({ defaultPath: path, query: nothing, score });
    case 'near':
      return options({ ...common, origin: nothing, pivot: nothing });
    case 'moreLikeThis':
      return options({ like: nothing, score });
    case 'embeddedDocument':
      return options({ path, operator: { k: 'searchOperators' }, score });
    default:
      return nothing;
  }
}

/** The mapping of a field of a search index; the fields of a document mapping are below `prefix`. */
function fieldMapping(prefix: string): Place {
  const analyzer: Place = { k: 'enum', values: analyzers };
  return described(
    fieldMappingOptions,
    {
      type: { k: 'enum', values: searchFieldTypes },
      analyzer,
      searchAnalyzer: analyzer,
      dynamic: flag,
      fields: { k: 'searchFields', prefix },
      tokenization: oneOf(['edgeGram', 'rightEdgeGram', 'nGram']),
      foldDiacritics: flag,
      store: flag,
    },
    true,
  );
}

function searchDefinition(): Place {
  const analyzer: Place = { k: 'enum', values: analyzers };
  return described(searchDefinitionOptions, {
    mappings: described(mappingOptions, { dynamic: flag, fields: { k: 'searchFields', prefix: '' } }),
    analyzer,
    searchAnalyzer: analyzer,
    storedSource: flag,
  });
}

function vectorDefinition(): Place {
  const field = described(vectorFieldOptions, {
    type: oneOf(['vector', 'filter']),
    path,
    similarity: oneOf(['cosine', 'euclidean', 'dotProduct']),
    quantization: oneOf(['none', 'scalar', 'binary']),
  });
  return described(vectorDefinitionOptions, { fields: { k: 'list', of: field } });
}

/** What the whole text is. */
export function rootPlace(kind: TextKind): Place {
  if (typeof kind === 'object') {
    return stagePlace(kind.stage.trim());
  }
  switch (kind) {
    case 'filter':
      return { k: 'query', prefix: '' };
    case 'sort':
      return { k: 'sort' };
    case 'index':
      return { k: 'sort', index: true };
    case 'project':
      return { k: 'project', aggregate: false };
    case 'update':
      return { k: 'update' };
    case 'pipeline':
      return { k: 'pipeline' };
    case 'stageObject':
      return { k: 'stageObject' };
    case 'field':
      return { k: 'fieldName' };
    case 'document':
      return { k: 'document', prefix: '' };
    case 'searchDefinition':
      return searchDefinition();
    case 'vectorDefinition':
      return vectorDefinition();
  }
}

function stageOptions(operator: string): Place | undefined {
  const outputs: Place = { k: 'outputs', of: { k: 'accumulators' } };
  switch (operator) {
    case '$unwind':
      return options({ path: expression, includeArrayIndex: nothing, preserveNullAndEmptyArrays: flag }, expression);
    case '$lookup':
      return options({
        from: nothing,
        localField: path,
        foreignField: nothing,
        as: nothing,
        let: { k: 'outputs', of: expression },
        pipeline: { k: 'pipeline' },
      });
    case '$replaceRoot':
      return options({ newRoot: expression });
    case '$sample':
      return options({ size: nothing });
    case '$bucket':
      return options({ groupBy: expression, boundaries: nothing, default: nothing, output: outputs });
    case '$bucketAuto':
      return options({ groupBy: expression, buckets: nothing, output: outputs, granularity: nothing });
    case '$unionWith':
      return options({ coll: nothing, pipeline: { k: 'pipeline' } });
    case '$merge':
      return options({
        into: nothing,
        on: nothing,
        whenMatched: { k: 'enum', values: ['"replace"', '"keepExisting"', '"merge"', '"fail"'] },
        whenNotMatched: { k: 'enum', values: ['"insert"', '"discard"', '"fail"'] },
      });
    case '$vectorSearch':
      return described(vectorSearchOptions, {
        index: { k: 'searchIndex', type: 'vectorSearch' },
        path: { k: 'fieldName', vector: true },
        filter: { k: 'query', prefix: '' },
        exact: flag,
      });
    default:
      return undefined;
  }
}

/** What the body of a stage can be. */
export function stagePlace(operator: string): Place {
  switch (operator) {
    case '$match':
      return { k: 'query', prefix: '' };
    case '$sort':
      return { k: 'sort' };
    case '$project':
    case '$addFields':
    case '$set':
      return { k: 'project', aggregate: true };
    case '$group':
      return { k: 'group' };
    case '$unset':
      return { k: 'fieldName' };
    case '$facet':
      return { k: 'outputs', of: { k: 'pipeline' } };
    case '$search':
    case '$searchMeta':
      return { k: 'searchOperators', stage: operator };
    case '$limit':
    case '$skip':
    case '$count':
    case '$out':
      return nothing;
    default:
      return stageOptions(operator) ?? expression;
  }
}

function queryChild(place: Extract<Place, { k: 'query' }>, key: string): Place {
  if (key === '$and' || key === '$or' || key === '$nor') {
    return { k: 'list', of: { k: 'query', prefix: place.prefix } };
  }
  if (key === '$expr') {
    return expression;
  }
  if (key === '$text') {
    return options({ $search: nothing, $language: nothing, $caseSensitive: flag, $diacriticSensitive: flag });
  }
  if (key.startsWith('$')) {
    return place.element === undefined ? nothing : fieldChild({ k: 'field', field: place.element }, key);
  }
  return { k: 'field', field: place.prefix + key };
}

function fieldChild(place: Extract<Place, { k: 'field' }>, key: string): Place {
  switch (key) {
    case '$in':
    case '$nin':
    case '$all':
      return { k: 'list', of: { k: 'value', field: place.field } };
    case '$elemMatch':
      return { k: 'query', prefix: `${place.field}.`, element: place.field };
    case '$not':
      return place;
    case '$exists':
      return flag;
    case '$type':
      return { k: 'enum', values: quoted(typeNames) };
    case '$eq':
    case '$ne':
    case '$gt':
    case '$gte':
    case '$lt':
    case '$lte':
      return { k: 'value', field: place.field };
    default:
      return nothing;
  }
}

function updateChild(operator: string, key: string): Place {
  if (['$set', '$setOnInsert', '$min', '$max', '$push', '$addToSet', '$pull'].includes(operator)) {
    return { k: 'value', field: key };
  }
  switch (operator) {
    case '$currentDate':
      return { k: 'enum', values: ['true', '{ $type: "date" }', '{ $type: "timestamp" }'] };
    case '$pop':
      return { k: 'enum', values: ['1', '-1'] };
    case '$unset':
      return { k: 'enum', values: ['""'] };
    case '$pullAll':
      return { k: 'list', of: { k: 'value', field: key } };
    default:
      return nothing;
  }
}

function elementChild(place: Place): Place {
  if (place.k === 'list') {
    return place.of;
  }
  if (place.k === 'update' || place.k === 'pipeline') {
    return { k: 'stageObject' };
  }
  if (place.k === 'options') {
    return place.each === true ? place : nothing;
  }
  return place.k === 'fieldName' || place.k === 'document' ? place : nothing;
}

function keyedChild(place: Place, key: string): Place {
  switch (place.k) {
    case 'query':
      return queryChild(place, key);
    case 'field':
      return key.startsWith('$') ? fieldChild(place, key) : nothing;
    case 'sort':
      return {
        k: 'enum',
        values: place.index === true ? ['1', '-1', '"text"', '"2dsphere"', '"hashed"'] : ['1', '-1'],
      };
    case 'project':
      return place.aggregate ? { k: 'expr', include: true } : { k: 'enum', values: ['1', '0'] };
    case 'expr':
      return key === '$meta' ? { k: 'enum', values: metaValues } : expression;
    case 'update':
      return { k: 'updateFields', operator: key };
    case 'updateFields':
      return updateChild(place.operator, key);
    case 'stageObject':
      return stagePlace(key);
    case 'group':
      return key === '_id' ? expression : { k: 'accumulators' };
    case 'accumulators':
      return expression;
    case 'outputs':
      return place.of;
    case 'options':
      return place.children[key] ?? nothing;
    case 'document':
      return { k: 'document', prefix: `${place.prefix}${key}.`, field: place.prefix + key };
    case 'searchOperators':
      return searchChild(key, place.stage);
    case 'searchFields':
      return fieldMapping(`${place.prefix}${key}.`);
    case 'enum':
    case 'fieldName':
    case 'list':
    case 'none':
    case 'pipeline':
    case 'searchIndex':
    case 'value':
      return nothing;
  }
}

/** What the value under `key` of a value at `place` can be; `null` for an element of an array. */
export function childPlace(place: Place, key: string | null): Place {
  if (place.k === 'expr') {
    return key === '$meta' ? { k: 'enum', values: metaValues } : expression;
  }
  return key === null ? elementChild(place) : keyedChild(place, key);
}
