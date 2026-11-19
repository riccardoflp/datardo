/**
 * Feature: mcp.read-data
 *
 * `datardo.mcp.readData` decides whether the AI may read documents, field values and the values of Redis keys. Off,
 * the seven tools that return them are neither listed nor callable, and the tools that stay write `?` where a value
 * would be: query shapes, Redis commands with `?` for every argument, titles of the undo history without their values.
 * The names of databases, collections, fields, indexes and keys are structure, not data, and stay.
 */
import type { Json } from '../../shared/engine-request';
import type { SettingsState } from '../../shared/state/settings';
import { isJsonObject, isOperatorObject, isSubdocument } from '../query/mongosh/ejson';
import { keyText } from '../query/format';
import { setting } from '../settings/read';
import type { McpSettings, ToolDefinition } from './types';

/** The tools that are neither listed nor callable with the setting off. */
export const hiddenWithoutReadData: readonly string[] = [
  'find_documents',
  'aggregate',
  'distinct_values',
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

/** Feature: mcp.read-data — the tools listed and callable: all with the setting on, the others without the seven. */
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

/** A Redis command with its name and `?` for every argument: `HSET ? ? ?`. */
export function commandShape(words: readonly string[]): string {
  const [name, ...rest] = words;
  return [name ?? '', ...rest.map(() => hiddenValue)].join(' ');
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
