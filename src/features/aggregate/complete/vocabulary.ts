/**
 * The words suggested in a pipeline: stages, query, expression and accumulator operators, variables and the options of
 * Atlas Search, each with its note and the template of its value, in which `|` marks where the cursor lands. Ported
 * from Mongoster's `src/shared/complete.ts`.
 */

/** A word: its name, its note, and the template of its value (`|` is the cursor). */
export type Word = readonly [name: string, note: string, template?: string];

/** The operators of a filter that stand at its top level. */
export const queryTop: readonly Word[] = [
  ['$and', 'all conditions match', '[{ | }]'],
  ['$or', 'at least one condition matches', '[{ | }]'],
  ['$nor', 'no condition matches', '[{ | }]'],
  ['$expr', 'aggregation expression', '{ | }'],
  ['$text', 'text index search', '{ $search: "|" }'],
  ['$jsonSchema', 'matches a JSON schema', '{ | }'],
  ['$where', 'JavaScript condition', '"|"'],
  ['$comment', 'comment shown in logs', '"|"'],
];

/** The operators of the condition of a field. */
export const queryOperators: readonly Word[] = [
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

/** The 28 stages, each with a skeleton. */
export const stageWords: readonly Word[] = [
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

/** The accumulators of `$group` and of the `output` of `$bucket`. */
export const accumulators: readonly Word[] = [
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

const one = '"$|"';

/** The expression operators, 68 of them. */
export const expressionOperators: readonly Word[] = [
  ['$add', 'sum'],
  ['$subtract', 'difference'],
  ['$multiply', 'product'],
  ['$divide', 'quotient'],
  ['$mod', 'remainder'],
  ['$abs', 'absolute value', one],
  ['$round', 'round', '["$|", 0]'],
  ['$floor', 'round down', one],
  ['$ceil', 'round up', one],
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
  ['$toLower', 'lowercase', one],
  ['$toUpper', 'uppercase', one],
  ['$trim', 'trim whitespace', '{ input: "$|" }'],
  ['$split', 'split a string', '["$|", ","]'],
  ['$substrCP', 'substring', '["$|", 0, 1]'],
  ['$strLenCP', 'string length', one],
  ['$regexMatch', 'regex test', '{ input: "$|", regex: // }'],
  ['$replaceAll', 'replace substrings', '{ input: "$|", find: "", replacement: "" }'],
  ['$size', 'array length', one],
  ['$arrayElemAt', 'element at an index', '["$|", 0]'],
  ['$first', 'first element', one],
  ['$last', 'last element', one],
  ['$filter', 'array elements matching', '{ input: "$|", as: "item", cond: {} }'],
  ['$map', 'transform array elements', '{ input: "$|", as: "item", in: "$$item" }'],
  ['$reduce', 'fold an array', '{ input: "$|", initialValue: 0, in: {} }'],
  ['$in', 'value in array'],
  ['$slice', 'part of an array', '["$|", 5]'],
  ['$concatArrays', 'join arrays'],
  ['$isArray', 'is an array', one],
  ['$sortArray', 'sorted array', '{ input: "$|", sortBy: 1 }'],
  ['$year', 'year of a date', one],
  ['$month', 'month of a date', one],
  ['$dayOfMonth', 'day of a date', one],
  ['$hour', 'hour of a date', one],
  ['$dateToString', 'format a date', '{ format: "%Y-%m-%d", date: "$|" }'],
  ['$dateFromString', 'parse a date', '{ dateString: "$|" }'],
  ['$dateTrunc', 'truncate a date', '{ date: "$|", unit: "day" }'],
  ['$dateAdd', 'add to a date', '{ startDate: "$|", unit: "day", amount: 1 }'],
  ['$dateDiff', 'difference of dates', '{ startDate: "$|", endDate: "$$NOW", unit: "day" }'],
  ['$toString', 'convert to string', one],
  ['$toInt', 'convert to int', one],
  ['$toDouble', 'convert to double', one],
  ['$toDate', 'convert to date', one],
  ['$toObjectId', 'convert to ObjectId', one],
  ['$type', 'BSON type name', one],
  ['$mergeObjects', 'merge objects'],
  ['$objectToArray', 'object to k/v array', one],
  ['$arrayToObject', 'k/v array to object', one],
  ['$getField', 'field by name', '{ field: "|", input: "$$ROOT" }'],
  ['$literal', 'value as is', '{ | }'],
  ['$meta', 'search score, text score…', '"searchScore|"'],
  ['$sum', 'sum'],
  ['$avg', 'average'],
  ['$min', 'minimum'],
  ['$max', 'maximum'],
];

/** The variables of an expression. */
export const variables: readonly string[] = ['$$ROOT', '$$NOW', '$$CURRENT', '$$REMOVE'];

/** The names `$type` takes. */
export const bsonTypeNames: readonly string[] = [
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

/** The operators of `$search` and `$searchMeta`, also inside `compound` and `embeddedDocument`. */
export const searchOperators: readonly Word[] = [
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

const indexOption: Word = ['index', 'search index ("default" when left out)', '"|"'];

/** The options of `$search`. */
export const searchOptions: readonly Word[] = [
  indexOption,
  ['highlight', 'matching passages ($meta: "searchHighlights")', '{ path: "|" }'],
  ['count', 'number of matches ($$SEARCH_META)', '{ type: "total|" }'],
  ['sort', 'sort by indexed fields', '{ |: -1 }'],
  ['returnStoredSource', 'only the stored fields', 'true|'],
  ['scoreDetails', 'how the score is computed', 'true|'],
  ['concurrent', 'parallel search on search nodes', 'true|'],
];

/** The options of `$searchMeta`. */
export const searchMetaOptions: readonly Word[] = [
  indexOption,
  ['facet', 'counts by value or range', '{ operator: { | }, facets: { byField: { type: "string", path: "" } } }'],
  ['count', 'number of matches', '{ type: "total|" }'],
];

/** The options of `$vectorSearch`. */
export const vectorSearchOptions: readonly Word[] = [
  ['index', 'vector search index', '"|"'],
  ['path', 'field with the vectors', '"|"'],
  ['queryVector', 'the vector to compare', '[|]'],
  ['numCandidates', 'nearest neighbors examined (10–20 × limit)', '|100'],
  ['limit', 'documents returned', '|10'],
  ['filter', 'pre-filter on the filter fields of the index', '{ | }'],
  ['exact', 'exact search (ENN) instead of approximate', 'true|'],
];

/** The values of `$meta`. */
export const metaValues: readonly string[] = [
  '"searchScore"',
  '"vectorSearchScore"',
  '"searchHighlights"',
  '"searchScoreDetails"',
  '"textScore"',
  '"indexKey"',
];

/** The scores a projection can add. */
export const metaItems: readonly (readonly [string, string])[] = [
  ['{ $meta: "searchScore" }', 'score of $search'],
  ['{ $meta: "vectorSearchScore" }', 'score of $vectorSearch'],
];
