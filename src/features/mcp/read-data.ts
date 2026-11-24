/**
 * Feature: mcp.read-data
 *
 * `datardo.mcp.readData` decides whether the AI may read documents, field values and the values of Redis keys. Off,
 * the eight tools that return them (`explain_query` among them) are neither listed nor callable, and the tools that
 * stay give no value by another way: query shapes, Redis commands with `?` for every argument, titles of the undo
 * history without their values, validators as field names and types, view pipelines and partial filters as their
 * shapes, and a MongoDB server's error as its code and code name, since the server quotes the values it failed on.
 * The names of databases, collections, fields, indexes and keys are structure, not data, and stay.
 */
import type { Json } from '../../shared/engine-request';
import type { SettingsState } from '../../shared/state/settings';
import { isJsonObject, isOperatorObject, isSubdocument, numberOf } from '../query/mongosh/ejson';
import { formattedValue, keyText } from '../query/format';
import { setting } from '../settings/read';
import type { FailedReply, McpSettings, ToolDefinition } from './types';

/** The tools that are neither listed nor callable with the setting off. */
export const hiddenWithoutReadData: readonly string[] = [
  'find_documents',
  'aggregate',
  'distinct_values',
  'explain_query',
  'watch_changes',
  'write_history',
  'datardo_write_details',
  'redis_read_value',
];

/** The settings of the server, read again at every request: no restart is needed. */
export function mcpSettings(settings: SettingsState): McpSettings {
  return {
    enabled: setting(settings, 'datardo.mcp.enabled'),
    port: setting(settings, 'datardo.mcp.port'),
    readData: setting(settings, 'datardo.mcp.readData'),
  };
}

/** Feature: mcp.read-data — the tools listed and callable: all with the setting on, the others without the eight. */
export function offeredTools(
  tools: readonly ToolDefinition[],
  settings: Pick<McpSettings, 'readData'>,
): readonly ToolDefinition[] {
  return settings.readData ? tools : tools.filter((tool) => !tool.readsData);
}

/** What stands for a value. */
export const hiddenValue = '?';

const logical = new Set(['$and', '$or', '$nor']);

function shapeOfEntry(key: string, value: Json): string {
  if (logical.has(key) && Array.isArray(value)) {
    return `[ ${(value as readonly Json[]).map((each) => shapeOf(each)).join(', ')} ]`;
  }
  if (isOperatorObject(value) || (key.startsWith('$') && isSubdocument(value))) {
    return shapeOf(value);
  }
  return hiddenValue;
}

/**
 * A query, a sort-free filter or an update as its shape: the keys and the operators kept, every value written `?`.
 * `{ status: "paid", total: { $gt: 100 } }` → `{ status: ?, total: { $gt: ? } }`;
 * `{ $set: { email: "ada@example.com" } }` → `{ $set: { email: ? } }`.
 */
export function shapeOf(value: Json): string {
  if (!isJsonObject(value) || !isSubdocument(value)) {
    return hiddenValue;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) {
    return '{}';
  }
  return `{ ${entries.map(([key, each]) => `${keyText(key)}: ${shapeOfEntry(key, each)}`).join(', ')} }`;
}

/** A pipeline, or any list of stages, as its shape: `[ { $match: { status: ? } } ]`. */
export function pipelineShape(value: Json): string {
  if (!Array.isArray(value)) {
    return shapeOf(value);
  }
  const stages = (value as readonly Json[]).map((stage) => shapeOf(stage));
  return stages.length === 0 ? '[]' : `[ ${stages.join(', ')} ]`;
}

/**
 * A definition the server keeps that can hold literal values, a view's pipeline or a partial filter expression: in
 * mongosh syntax with the setting on, as its shape with it off.
 */
export function definitionText(value: Json, readData: boolean): string {
  if (readData) {
    return formattedValue(value, 'one-line');
  }
  return Array.isArray(value) ? pipelineShape(value) : shapeOf(value);
}

/** A Redis command with its name and `?` for every argument: `HSET ? ? ?`. */
export function commandShape(words: readonly string[]): string {
  const [name, ...rest] = words;
  return [name ?? '', ...rest.map(() => hiddenValue)].join(' ');
}

/** The `$jsonSchema` keywords that say a type or a size, not a value a document can have: kept as they are. */
const schemaKept: ReadonlySet<string> = new Set([
  'bsonType',
  'type',
  'required',
  'minItems',
  'maxItems',
  'minLength',
  'maxLength',
  'minProperties',
  'maxProperties',
  'uniqueItems',
]);

/** The keywords whose value maps names to schemas. */
const schemaMaps: ReadonlySet<string> = new Set(['properties', 'patternProperties']);

/** The keywords whose value is a schema or a list of schemas, followed inside. */
const schemaNested: ReadonlySet<string> = new Set(['items', 'allOf', 'anyOf', 'oneOf', 'not', 'additionalProperties']);

/** A type name, a size or a switch: what the kept keywords hold. */
function isPlainWord(value: Json): boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    numberOf(value) !== undefined
  );
}

function keptText(value: Json): string {
  if (isPlainWord(value)) {
    return formattedValue(value, 'one-line');
  }
  if (Array.isArray(value) && (value as readonly Json[]).every(isPlainWord)) {
    return `[${(value as readonly Json[]).map((each) => formattedValue(each, 'one-line')).join(', ')}]`;
  }
  return hiddenValue;
}

function schemaEntry(key: string, value: Json): string {
  if (schemaKept.has(key)) {
    return `${keyText(key)}: ${keptText(value)}`;
  }
  if (schemaMaps.has(key) && isJsonObject(value)) {
    const fields = Object.entries(value).map(([name, each]) => `${keyText(name)}: ${schemaShape(each)}`);
    return `${keyText(key)}: ${fields.length === 0 ? '{}' : `{ ${fields.join(', ')} }`}`;
  }
  return `${keyText(key)}: ${schemaNested.has(key) ? schemaShape(value) : hiddenValue}`;
}

/**
 * A `$jsonSchema` with its field names, types and sizes: `properties`, `patternProperties`, `bsonType`, `type`,
 * `required` and the sizes stay; `items`, `allOf`, `anyOf`, `oneOf`, `not` and `additionalProperties` are followed
 * inside; `enum`, `pattern`, the bounds, `description` and any other keyword become `?`.
 */
export function schemaShape(schema: Json): string {
  if (Array.isArray(schema)) {
    return `[${(schema as readonly Json[]).map((each) => schemaShape(each)).join(', ')}]`;
  }
  if (typeof schema === 'boolean') {
    return String(schema);
  }
  if (!isJsonObject(schema)) {
    return hiddenValue;
  }
  const entries = Object.entries(schema).map(([key, value]) => schemaEntry(key, value));
  return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`;
}

/**
 * A validator without its literal values: its `$jsonSchema` as {@link schemaShape} gives it, its query conditions as
 * their shape. `{ $jsonSchema: { required: ["plan"], properties: { plan: { bsonType: "string", enum: […] } } } }` →
 * `{ $jsonSchema: { required: ["plan"], properties: { plan: { bsonType: "string", enum: ? } } } }`.
 */
export function validatorShape(validator: Json): string {
  if (!isJsonObject(validator)) {
    return shapeOf(validator);
  }
  const entries = Object.entries(validator).map(
    ([key, value]) => `${keyText(key)}: ${key === '$jsonSchema' ? schemaShape(value) : shapeOfEntry(key, value)}`,
  );
  return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`;
}

/** A server's error without its text: `server error 241 (ConversionFailure)`. */
export function errorCode(failure: Pick<FailedReply, 'code' | 'codeName'>): string {
  const number = failure.code === undefined ? '' : ` ${String(failure.code).slice(0, 20)}`;
  const name = failure.codeName !== undefined && /^\w{1,80}$/u.test(failure.codeName) ? ` (${failure.codeName})` : '';
  return `server error${number}${name}`;
}

/**
 * The text of a failed request as the model reads it. With the setting off, the error of a MongoDB server, which
 * quotes the values it failed on, is reduced to its code and code name: `server error 241 (ConversionFailure); its
 * text is left out because datardo.mcp.readData is off`. Errors that are not a server's (the network, a time limit of
 * Datardo's, a refusal of Datardo's own) and Redis errors, which have no code name, keep their text.
 */
export function errorText(failure: FailedReply, settings: Pick<McpSettings, 'readData'>): string {
  return settings.readData || failure.codeName === undefined
    ? failure.message
    : `${errorCode(failure)}; its text is left out because datardo.mcp.readData is off`;
}

const valueStart = /^(?:["'{[/]|[A-Z][A-Za-z0-9]*\(|-?\d+(?:\.\d+)?(?:,|$))/u;

const trailingWords = new Set(['of', 'with', 'matching', 'in', 'to', 'where', 'for', 'from', 'by']);

/**
 * The title of an operation of the undo history without the `_id` values and filters it carries:
 * `Delete document ObjectId("65f1…a2c")` → `Delete document`. The title is cut before its first word that is a value
 * (a quoted text, a helper such as `ObjectId(…)`, an object, an array, a regular expression), and the small word left
 * before it goes too.
 */
export function titleWithoutValues(title: string): string {
  const words = title.split(' ');
  const firstValue = words.findIndex((word) => valueStart.test(word));
  const kept = firstValue < 0 ? words : words.slice(0, firstValue);
  while (kept.length > 1 && trailingWords.has((kept.at(-1) ?? '').toLowerCase())) {
    kept.pop();
  }
  return kept.join(' ').replace(/[:,]$/u, '');
}
