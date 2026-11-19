/**
 * The forms mongosh accepts for the arguments of some methods, as the driver or the server takes them: key patterns
 * or index descriptions, a search index in its three forms, `returnNewDocument`, the options of a session and of a
 * transaction. The values of documents keep their BSON types; only the numbers the driver reads itself become numbers
 * of JavaScript.
 */
import {
  BSON,
  ReadPreference,
  type ClientSessionOptions,
  type Document,
  type ReadPreferenceMode,
  type TransactionOptions,
} from 'mongodb';
import { EngineError } from '../engine';
import { document, documents } from './methods';

function isDocument(value: unknown): value is Document {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof BSON.BSONValue);
}

/**
 * A number as the driver reads it: an Int32, a Double or a Long becomes a number of JavaScript; anything else stays,
 * a Timestamp too (which is a Long to the BSON library).
 */
export function plainNumber(value: unknown): unknown {
  if (value instanceof BSON.Timestamp) {
    return value;
  }
  if (value instanceof BSON.Long) {
    return value.toNumber();
  }
  return value instanceof BSON.Int32 || value instanceof BSON.Double ? value.valueOf() : value;
}

/** Options the driver reads itself (a write concern, a read preference), with every number plain, at any depth. */
export function plainNumbers(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(plainNumbers);
  }
  if (isDocument(value)) {
    return Object.fromEntries(Object.entries(value).map(([name, each]) => [name, plainNumbers(each)]));
  }
  return plainNumber(value);
}

/** Options the driver reads: their numbers plain at the first level; a document inside keeps its types. */
export function plainOptions(given: unknown): Document {
  return Object.fromEntries(Object.entries(document(given)).map(([name, value]) => [name, plainNumber(value)]));
}

/** The name the server gives an index of these keys: `status_1_total_-1`, as mongosh and the driver name it. */
export function indexName(key: Document): string {
  return Object.entries(key)
    .map(([field, kind]) => `${field}_${String(plainNumber(kind))}`)
    .join('_');
}

function isDescription(value: Document): boolean {
  return isDocument(value['key']);
}

/** One index as the command `createIndexes` takes it: its key, its name, and its options. */
function described(index: Document, shared: Document): Document {
  const name = typeof index['name'] === 'string' ? index['name'] : indexName(document(index['key']));
  return { ...shared, ...index, name };
}

/**
 * The indexes of `createIndex(keys, options)` and `createIndexes(…, options)` as the command `createIndexes` takes
 * them, with its `commitQuorum`. `createIndexes` takes key patterns with options shared by all, as mongosh does, or
 * whole descriptions `{ key, name, … }`, as `listIndexes` gives them (a copy, a restore).
 */
export function indexDescriptions(
  given: readonly Document[],
  options: unknown,
): { readonly indexes: Document[]; readonly commitQuorum?: unknown } {
  const { commitQuorum, ...shared } = document(options);
  const indexes = given.map((each) => described(isDescription(each) ? each : { key: each }, shared));
  return { indexes, ...(commitQuorum === undefined ? {} : { commitQuorum }) };
}

/** The indexes of `createIndexes`: its first argument, an array of key patterns or descriptions. */
export function indexesGiven(value: unknown): Document[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new EngineError('createIndexes takes an array of indexes: key patterns or descriptions { key, name }.');
  }
  return documents(value);
}

/**
 * A search index of `createSearchIndex`: `(name, definition)`, `(name, type, definition)`, or one description `{
 * name, type, definition }`; a definition alone is the index `default`.
 */
export function searchIndexDescription(args: readonly unknown[]): Document {
  const [first, second, third] = args;
  if (typeof first === 'string' && typeof second === 'string') {
    return { name: first, type: second, definition: document(third) };
  }
  if (typeof first === 'string') {
    return { name: first, definition: document(second) };
  }
  const given = document(first);
  return isDocument(given['definition']) ? given : { name: 'default', definition: given };
}

/**
 * The options of `findOneAnd…` as the driver takes them: mongosh's `returnNewDocument: true` (or `returnOriginal:
 * false`) is `returnDocument: "after"`, and the reply is the document alone, or `null`, as in mongosh.
 */
export function findAndModifyOptions(given: unknown): Document {
  const { returnNewDocument, returnOriginal, ...rest } = document(given);
  const after = plainNumber(returnNewDocument) === true || plainNumber(returnOriginal) === false;
  return { ...rest, ...(after ? { returnDocument: 'after' } : {}), includeResultMetadata: false };
}

/** The fields of a document, each of a type still to check. */
function fieldsOf(value: unknown): Readonly<Record<string, unknown>> {
  return document(value);
}

function readPreferenceOf(value: unknown): ReadPreference | undefined {
  if (value === undefined) {
    return undefined;
  }
  const fields = typeof value === 'string' ? { mode: value } : fieldsOf(plainNumbers(value));
  const mode = fields['mode'];
  if (typeof mode !== 'string' || !ReadPreference.isValid(mode)) {
    throw new EngineError(`${String(mode)} is not a read preference: primary, primaryPreferred, secondary, …`);
  }
  const tags = Array.isArray(fields['tags']) ? documents(fields['tags']) : undefined;
  const staleness = fields['maxStalenessSeconds'];
  return new ReadPreference(mode as ReadPreferenceMode, tags, {
    ...(typeof staleness === 'number' ? { maxStalenessSeconds: staleness } : {}),
  });
}

/** The options of `startTransaction(options)`: its read concern, write concern, read preference and commit time. */
export function transactionOptions(given: unknown): TransactionOptions {
  const { readPreference, ...rest } = fieldsOf(given);
  const plain = document(plainNumbers(rest));
  const preference = readPreferenceOf(readPreference);
  return { ...plain, ...(preference === undefined ? {} : { readPreference: preference }) };
}

/**
 * The options of `startSession(options)`: its causal consistency, and the defaults of its transactions, from its
 * `readConcern`, `writeConcern` and `readPreference` and from `defaultTransactionOptions`, which wins.
 */
export function sessionOptions(given: unknown): ClientSessionOptions {
  const { causalConsistency, defaultTransactionOptions, readConcern, writeConcern, readPreference } = fieldsOf(given);
  const defaults = {
    ...(readConcern === undefined ? {} : { readConcern }),
    ...(writeConcern === undefined ? {} : { writeConcern }),
    ...(readPreference === undefined ? {} : { readPreference }),
    ...document(defaultTransactionOptions),
  };
  return {
    ...(typeof causalConsistency === 'boolean' ? { causalConsistency } : {}),
    ...(Object.keys(defaults).length === 0 ? {} : { defaultTransactionOptions: transactionOptions(defaults) }),
  };
}
