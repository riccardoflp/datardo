/**
 * Feature: index.command
 *
 * The command that creates an index or a search index, as text to copy, shown while editing and in the inspector.
 * Values are written in mongosh syntax on one line (`shared/mongosh-value`), as `query.format` writes them.
 */
import { mongoshValue } from '../../shared/mongosh-value';
import { normalized } from './change-plan';
import type { IndexDefinition, JsonDocument, SearchIndexType } from './types';

function collectionCall(collection: string): string {
  return `db.getCollection(${JSON.stringify(collection)})`;
}

/**
 * Feature: index.command — `db.getCollection("orders").createIndex({ status: 1 }, { unique: true })`, with the second
 * argument only when the normalized definition has options.
 */
export function indexCommand(collection: string, definition: IndexDefinition): string {
  const { keys, options } = normalized(definition);
  const args = [mongoshValue(keys), ...(Object.keys(options).length > 0 ? [mongoshValue(options)] : [])];
  return `${collectionCall(collection)}.createIndex(${args.join(', ')})`;
}

/** What the command of a search index is made of; `update` for a change of definition (R6.1: one object). */
export interface SearchCommandInput {
  readonly name: string;
  readonly type: SearchIndexType;
  readonly definition: JsonDocument;
  readonly update?: boolean;
}

/**
 * Feature: index.command — `createSearchIndex("<name>", <definition>)`, with `"vectorSearch"` before the definition
 * of a vector search index; `updateSearchIndex("<name>", <definition>)` for a change of definition.
 */
export function searchIndexCommand(collection: string, input: SearchCommandInput): string {
  const { name, type, definition } = input;
  const call = collectionCall(collection);
  const written = mongoshValue(definition);
  if (input.update === true) {
    return `${call}.updateSearchIndex(${JSON.stringify(name)}, ${written})`;
  }
  return type === 'vectorSearch'
    ? `${call}.createSearchIndex(${JSON.stringify(name)}, "vectorSearch", ${written})`
    : `${call}.createSearchIndex(${JSON.stringify(name)}, ${written})`;
}
