/**
 * The vocabularies of the suggestions (`query.suggestions`), ported whole from Mongoster with their descriptions and
 * skeletons: `|` marks where the cursor goes in the skeleton of a value.
 */

/** A name that can be suggested, what it does, and the skeleton of its value. */
export type Term = readonly [name: string, detail: string, template?: string];

/** The operators at the top of a filter, and inside $and, $or and $nor. */
export const queryTop: readonly Term[] = [
  ['$and', 'all conditions match', '[{ | }]'],
  ['$or', 'at least one condition matches', '[{ | }]'],
  ['$nor', 'no condition matches', '[{ | }]'],
  ['$expr', 'aggregation expression', '{ | }'],
  ['$text', 'text index search', '{ $search: "|" }'],
  ['$jsonSchema', 'matches a JSON schema', '{ | }'],
  ['$where', 'JavaScript condition', '"|"'],
  ['$comment', 'comment shown in logs', '"|"'],
];

/** The operators inside the object of a field of a filter. */
export const queryOperators: readonly Term[] = [
  ['$eq', 'equal'],
  ['$ne', 'not equal'],
  ['$gt', 'greater than'],
  ['$gte', 'greater or equal'],
  ['$lt', 'less than'],
  ['$lte', 'less or equal'],
  ['$in', 'any of the values', '[|]'],
  ['$nin', 'none of the values', '[|]'],
  ['$exists', 'field present', 'true|'],
  ['$type', 'BSON type', '"|"'],
  ['$regex', 'regular expression', '/|/'],
  ['$options', 'regex options', '"i|"'],
  ['$elemMatch', 'an array element matches', '{ | }'],
  ['$size', 'array length'],
  ['$all', 'array contains all', '[|]'],
  ['$not', 'negates the conditions', '{ | }'],
  ['$mod', 'divisor and remainder', '[|, 0]'],
];

/** The operators at the top of an update. */
export const updateOperators: readonly Term[] = [
  ['$set', 'set fields', '{ | }'],
  ['$unset', 'remove fields', '{ |: "" }'],
  ['$inc', 'increment', '{ |: 1 }'],
  ['$mul', 'multiply', '{ | }'],
  ['$rename', 'rename fields', '{ | }'],
  ['$min', 'set if lower', '{ | }'],
  ['$max', 'set if greater', '{ | }'],
  ['$currentDate', 'set to the current date', '{ |: true }'],
  ['$setOnInsert', 'set on upsert insert', '{ | }'],
  ['$push', 'append to an array', '{ | }'],
  ['$addToSet', 'add to an array if missing', '{ | }'],
  ['$pull', 'remove matching elements', '{ | }'],
  ['$pullAll', 'remove listed elements', '{ | }'],
  ['$pop', 'remove first (-1) or last (1)', '{ |: 1 }'],
];

/** The stages of a pipeline. */
export const stages: readonly Term[] = [
  ['$match', 'filter documents', '{ | }'],
  ['$project', 'include, exclude or compute fields', '{ | }'],
  ['$addFields', 'add computed fields', '{ | }'],
  ['$set', 'add computed fields', '{ | }'],
  ['$unset', 'remove fields', '"|"'],
  ['$group', 'group by a key', '{ _id: "$|" }'],
  ['$sort', 'sort', '{ |: -1 }'],
  ['$limit', 'first n documents', '|10'],
  ['$skip', 'skip n documents', '|10'],
  ['$unwind', 'one document per array element', '"$|"'],
  ['$lookup', 'join another collection', '{ from: "|", localField: "", foreignField: "", as: "" }'],
  ['$count', 'count the documents', '"|count"'],
  ['$sortByCount', 'group, count and sort', '"$|"'],
  ['$replaceRoot', 'replace the document', '{ newRoot: "$|" }'],
  ['$replaceWith', 'replace the document', '"$|"'],
  ['$sample', 'random documents', '{ size: |10 }'],
  ['$facet', 'several pipelines at once', '{ |: [] }'],
  ['$bucket', 'group into ranges', '{ groupBy: "$|", boundaries: [], default: "other" }'],
  ['$bucketAuto', 'group into n ranges', '{ groupBy: "$|", buckets: 5 }'],
  ['$unionWith', 'append another collection', '{ coll: "|" }'],
  ['$graphLookup', 'recursive lookup', '{ | }'],
  ['$setWindowFields', 'window functions', '{ | }'],
  ['$redact', 'restrict content', '{ | }'],
  ['$search', 'Atlas Search (first stage)', '{ index: "|", text: { query: "", path: "" } }'],
  [
    '$searchMeta',
    'Atlas Search counts and facets (first stage)',
    '{ index: "|", exists: { path: "" }, count: { type: "total" } }',
  ],
  [
    '$vectorSearch',
    'Vector Search (first stage)',
    '{ index: "|", path: "", queryVector: [], numCandidates: 100, limit: 10 }',
  ],
  ['$out', 'write to a collection', '"|"'],
  ['$merge', 'merge into a collection', '{ into: "|" }'],
];

/** The accumulators of $group. */
export const accumulators: readonly Term[] = [
  ['$sum', 'sum (1 counts)', '|1'],
  ['$avg', 'average', '"$|"'],
  ['$min', 'minimum', '"$|"'],
  ['$max', 'maximum', '"$|"'],
  ['$first', 'first value', '"$|"'],
  ['$last', 'last value', '"$|"'],
  ['$push', 'array of the values', '"$|"'],
  ['$addToSet', 'array of the distinct values', '"$|"'],
  ['$count', 'number of documents', '{}|'],
  ['$mergeObjects', 'merged objects', '"$|"'],
  ['$stdDevPop', 'population standard deviation', '"$|"'],
  ['$stdDevSamp', 'sample standard deviation', '"$|"'],
];

const oneField = '"$|"';
const anObject = '{ | }';
/** The operators of an aggregation expression. */
export const expressionOperators: readonly Term[] = [
  ['$add', 'sum'],
  ['$subtract', 'difference'],
  ['$multiply', 'product'],
  ['$divide', 'quotient'],
  ['$mod', 'remainder'],
  ['$abs', 'absolute value', oneField],
  ['$round', 'round', '["$|", 0]'],
  ['$floor', 'round down', oneField],
  ['$ceil', 'round up', oneField],
  ['$eq', 'equal'],
  ['$ne', 'not equal'],
  ['$gt', 'greater than'],
  ['$gte', 'greater or equal'],
  ['$lt', 'less than'],
  ['$lte', 'less or equal'],
  ['$cmp', 'compare (-1, 0, 1)'],
  ['$and', 'all true'],
  ['$or', 'any true'],
  ['$not', 'negation'],
  ['$cond', 'if / then / else', '{ if: |, then: , else:  }'],
  ['$ifNull', 'first non-null value'],
  ['$switch', 'first matching branch', '{ branches: [{ case: |, then:  }], default:  }'],
  ['$concat', 'join strings'],
  ['$toLower', 'lowercase', oneField],
  ['$toUpper', 'uppercase', oneField],
  ['$trim', 'trim whitespace', '{ input: "$|" }'],
  ['$split', 'split a string', '["$|", ","]'],
  ['$substrCP', 'substring', '["$|", 0, 1]'],
  ['$strLenCP', 'string length', oneField],
  ['$regexMatch', 'regex test', '{ input: "$|", regex: // }'],
  ['$replaceAll', 'replace substrings', '{ input: "$|", find: "", replacement: "" }'],
  ['$size', 'array length', oneField],
  ['$arrayElemAt', 'element at an index', '["$|", 0]'],
  ['$first', 'first element', oneField],
  ['$last', 'last element', oneField],
  ['$filter', 'array elements matching', '{ input: "$|", as: "item", cond: {} }'],
  ['$map', 'transform array elements', '{ input: "$|", as: "item", in: "$$item" }'],
  ['$reduce', 'fold an array', '{ input: "$|", initialValue: 0, in: {} }'],
  ['$in', 'value in array'],
  ['$slice', 'part of an array', '["$|", 5]'],
  ['$concatArrays', 'join arrays'],
  ['$isArray', 'is an array', oneField],
  ['$sortArray', 'sorted array', '{ input: "$|", sortBy: 1 }'],
  ['$year', 'year of a date', oneField],
  ['$month', 'month of a date', oneField],
  ['$dayOfMonth', 'day of a date', oneField],
  ['$hour', 'hour of a date', oneField],
  ['$dateToString', 'format a date', '{ format: "%Y-%m-%d", date: "$|" }'],
  ['$dateFromString', 'parse a date', '{ dateString: "$|" }'],
  ['$dateTrunc', 'truncate a date', '{ date: "$|", unit: "day" }'],
  ['$dateAdd', 'add to a date', '{ startDate: "$|", unit: "day", amount: 1 }'],
  ['$dateDiff', 'difference of dates', '{ startDate: "$|", endDate: "$$NOW", unit: "day" }'],
  ['$toString', 'convert to string', oneField],
  ['$toInt', 'convert to int', oneField],
  ['$toDouble', 'convert to double', oneField],
  ['$toDate', 'convert to date', oneField],
  ['$toObjectId', 'convert to ObjectId', oneField],
  ['$type', 'BSON type name', oneField],
  ['$mergeObjects', 'merge objects'],
  ['$objectToArray', 'object to k/v array', oneField],
  ['$arrayToObject', 'k/v array to object', oneField],
  ['$getField', 'field by name', '{ field: "|", input: "$$ROOT" }'],
  ['$literal', 'value as is', anObject],
  ['$meta', 'search score, text score…', '"searchScore|"'],
  ['$sum', 'sum'],
  ['$avg', 'average'],
  ['$min', 'minimum'],
  ['$max', 'maximum'],
];

/** The variables of an aggregation expression. */
export const variables = ['$$ROOT', '$$NOW', '$$CURRENT', '$$REMOVE'];

/** The names $type takes. */
export const typeNames = [
  'string',
  'int',
  'double',
  'long',
  'decimal',
  'bool',
  'date',
  'objectId',
  'object',
  'array',
  'null',
  'number',
];

/** The operators of $search and $searchMeta, also inside compound and embeddedDocument. */
export const searchOperators: readonly Term[] = [
  ['text', 'full-text search', '{ query: "|", path: "" }'],
  ['compound', 'combine operators', '{ must: [{ text: { query: "|", path: "" } }], should: [], filter: [] }'],
  ['autocomplete', 'search as you type', '{ query: "|", path: "" }'],
  ['phrase', 'words in this order', '{ query: "|", path: "" }'],
  ['equals', 'equal value', '{ path: "|", value:  }'],
  ['range', 'numbers or dates in a range', '{ path: "|", gte: , lte:  }'],
  ['in', 'any of the values', '{ path: "|", value: [] }'],
  ['exists', 'field present', '{ path: "|" }'],
  ['wildcard', 'pattern with * and ?', '{ query: "|", path: "", allowAnalyzedField: true }'],
  ['regex', 'regular expression', '{ query: "|", path: "", allowAnalyzedField: true }'],
  ['queryString', 'Lucene query syntax', '{ defaultPath: "|", query: "" }'],
  ['near', 'close to a number, date or point', '{ path: "|", origin: , pivot:  }'],
  ['moreLikeThis', 'documents like these', '{ like: { | } }'],
  ['embeddedDocument', 'inside arrays of documents', '{ path: "|", operator: {} }'],
];

/** The options of $search. */
export const searchStageOptions: readonly Term[] = [
  ['index', 'search index ("default" when left out)', '"|"'],
  ['highlight', 'matching passages ($meta: "searchHighlights")', '{ path: "|" }'],
  ['count', 'number of matches ($$SEARCH_META)', '{ type: "total|" }'],
  ['sort', 'sort by indexed fields', '{ |: -1 }'],
  ['returnStoredSource', 'only the stored fields', 'true|'],
  ['scoreDetails', 'how the score is computed', 'true|'],
  ['concurrent', 'parallel search on search nodes', 'true|'],
];

/** The options of $searchMeta. */
export const searchMetaOptions: readonly Term[] = [
  ['index', 'search index ("default" when left out)', '"|"'],
  ['facet', 'counts by value or range', '{ operator: { | }, facets: { byField: { type: "string", path: "" } } }'],
  ['count', 'number of matches', '{ type: "total|" }'],
];

/** The options of $vectorSearch. */
export const vectorSearchOptions: readonly Term[] = [
  ['index', 'vector search index', '"|"'],
  ['path', 'field with the vectors', '"|"'],
  ['queryVector', 'the vector to compare', '[|]'],
  ['numCandidates', 'nearest neighbors examined (10–20 × limit)', '|100'],
  ['limit', 'documents returned', '|10'],
  ['filter', 'pre-filter on the filter fields of the index', '{ | }'],
  ['exact', 'exact search (ENN) instead of approximate', 'true|'],
];

/** What $meta takes. */
export const metaValues = [
  '"searchScore"',
  '"vectorSearchScore"',
  '"searchHighlights"',
  '"searchScoreDetails"',
  '"textScore"',
  '"indexKey"',
];
/** The $meta values a projection of a pipeline offers. */
export const metaItems: readonly (readonly [string, string])[] = [
  ['{ $meta: "searchScore" }', 'score of $search'],
  ['{ $meta: "vectorSearchScore" }', 'score of $vectorSearch'],
];

/** Values written as strings of mongosh. */
export function quoted(values: readonly string[]): string[] {
  return values.map((value) => JSON.stringify(value));
}
/** The analyzers of Atlas Search. */
export const analyzers = quoted([
  'lucene.standard',
  'lucene.simple',
  'lucene.whitespace',
  'lucene.keyword',
  'lucene.english',
  'lucene.italian',
  'lucene.french',
  'lucene.german',
  'lucene.spanish',
]);
/** The types of a field of a search index. */
export const searchFieldTypes = quoted([
  'string',
  'autocomplete',
  'token',
  'number',
  'date',
  'boolean',
  'objectId',
  'uuid',
  'document',
  'embeddedDocuments',
  'geo',
]);

/** The keys of the definition of a search index. */
export const searchDefinitionOptions: readonly Term[] = [
  ['mappings', 'which fields are indexed', '{ dynamic: true| }'],
  ['analyzer', 'analyzer of the indexed strings', '"lucene.standard|"'],
  ['searchAnalyzer', 'analyzer of the query text', '"lucene.standard|"'],
  ['analyzers', 'custom analyzers', '[|]'],
  ['storedSource', 'fields kept in the index for returnStoredSource', 'true|'],
  ['synonyms', 'synonym mappings', '[{ name: "|", analyzer: "lucene.standard", source: { collection: "" } }]'],
];

/** The keys of the mappings of a search index. */
export const mappingOptions: readonly Term[] = [
  ['dynamic', 'index every field (of supported types)', 'true|'],
  ['fields', 'fields indexed one by one', '{ | }'],
];

/** The keys of the mapping of a field of a search index. */
export const fieldMappingOptions: readonly Term[] = [
  ['type', 'how the field is indexed', '"|"'],
  ['analyzer', 'analyzer of the field', '"lucene.standard|"'],
  ['searchAnalyzer', 'analyzer of the query text', '"lucene.standard|"'],
  ['dynamic', 'index every field of the document', 'true|'],
  ['fields', 'fields of the document', '{ | }'],
  ['multi', 'the same field with other analyzers', '{ |: { type: "string", analyzer: "" } }'],
  ['tokenization', 'autocomplete: how words are split', '"edgeGram|"'],
  ['minGrams', 'autocomplete: shortest token', '|2'],
  ['maxGrams', 'autocomplete: longest token', '|15'],
  ['foldDiacritics', 'autocomplete: ignore accents', 'true|'],
  ['store', 'stored for highlighting', 'false|'],
];

/** The keys of the definition of a vector search index. */
export const vectorDefinitionOptions: readonly Term[] = [
  ['fields', 'vector and filter fields', '[{ type: "vector", path: "|", numDimensions: 1536, similarity: "cosine" }]'],
];

/** The keys of a field of a vector search index. */
export const vectorFieldOptions: readonly Term[] = [
  ['type', '"vector" or "filter"', '"|"'],
  ['path', 'field', '"|"'],
  ['numDimensions', 'length of the vectors', '|1536'],
  ['similarity', 'cosine, euclidean or dotProduct', '"cosine|"'],
  ['quantization', 'none, scalar or binary', '"scalar|"'],
  ['hnswOptions', 'graph options', '{ maxEdges: 16, numEdgeCandidates: 100 }|'],
];
