/**
 * Each operation of a difference twice: as the script writes it (`structure.script`, rule 7), in mongosh syntax with
 * the helpers of mongosh (`db.getCollection("orders").createIndex({ status: 1 })`), and as the command the engine
 * runs, a `runCommand` of the right database (`{ createIndexes: "orders", indexes: [ … ] }`). `structure.apply`
 * sends the second with the first as its text, so that the confirmation and the Log show what the script shows.
 */
import type { Json, MongoRequest } from '../../../shared/engine-request';
import { formattedValue } from '../../query/format';
import type { JsonObject, StructureOperation } from '../types';
import { createOptions, defaultIndexName } from './index-change';
import { without } from './values';

/** The width a value of a command keeps on one line before it is laid out on several (Mongoster's). */
const commandWidth = 70;

/** How long a step of `structure.apply` may take on the server, in milliseconds (Datardo's choice, R9.2). */
export const applyTimeLimitMs = 600_000;

function shell(value: Json): string {
  return formattedValue(value, 'pretty', commandWidth);
}

function oneLine(value: Json): string {
  return formattedValue(value, 'one-line');
}

function collection(name: string): string {
  return `db.getCollection(${JSON.stringify(name)})`;
}

function createText(name: string, options: JsonObject): string {
  const viewOn = options['viewOn'];
  if (typeof viewOn === 'string') {
    const rest = without(options, ['viewOn', 'pipeline']);
    const args = [
      JSON.stringify(name),
      JSON.stringify(viewOn),
      shell(options['pipeline'] ?? []),
      ...(Object.keys(rest).length > 0 ? [shell(rest)] : []),
    ];
    return `db.createView(${args.join(', ')})`;
  }
  return `db.createCollection(${JSON.stringify(name)}${Object.keys(options).length > 0 ? `, ${shell(options)}` : ''})`;
}

function searchText(operation: Extract<StructureOperation, { type: 'createSearchIndex' }>): string {
  const vector = operation.searchType === 'vectorSearch' ? ', "vectorSearch"' : '';
  return `${collection(operation.collection)}.createSearchIndex(${JSON.stringify(operation.name)}${vector}, ${shell(operation.definition)})`;
}

function indexText(operation: Extract<StructureOperation, { type: 'createIndex' }>): string {
  const given = operation.options['name'];
  const name = typeof given === 'string' ? given : defaultIndexName(operation.keys);
  const options = createOptions({ name, keys: operation.keys, options: without(operation.options, ['name']) });
  const args = [shell(operation.keys), ...(Object.keys(options).length > 0 ? [shell(options)] : [])];
  return `${collection(operation.collection)}.createIndex(${args.join(', ')})`;
}

function shardKeyCommand(operation: Extract<StructureOperation, { type: 'shardCollection' }>, database: string): Json {
  return {
    shardCollection: `${database}.${operation.collection}`,
    key: operation.key,
    ...(operation.unique === true ? { unique: true } : {}),
  };
}

/** The mongosh command of an operation on the right database `database`, as the script writes it, without `;`. */
export function commandText(operation: StructureOperation, database: string): string {
  switch (operation.type) {
    case 'createCollection':
      return createText(operation.collection, operation.options);
    case 'collMod':
      return `db.runCommand(${shell({ collMod: operation.collection, ...operation.changes })})`;
    case 'convertToCapped':
      return `db.runCommand(${oneLine({ convertToCapped: operation.collection, size: operation.size })})`;
    case 'drop':
      return `${collection(operation.collection)}.drop()`;
    case 'createIndex':
      return indexText(operation);
    case 'dropIndex':
      return `${collection(operation.collection)}.dropIndex(${JSON.stringify(operation.name)})`;
    case 'createSearchIndex':
      return searchText(operation);
    case 'updateSearchIndex':
      return `${collection(operation.collection)}.updateSearchIndex(${JSON.stringify(operation.name)}, ${shell(operation.definition)})`;
    case 'dropSearchIndex':
      return `${collection(operation.collection)}.dropSearchIndex(${JSON.stringify(operation.name)})`;
    case 'shardCollection':
      return `db.adminCommand(${oneLine(shardKeyCommand(operation, database))})`;
  }
}

/** The command the engine runs for an operation, as the document of a `runCommand`. */
function commandDocument(operation: StructureOperation, database: string): Json {
  switch (operation.type) {
    case 'createCollection':
      return { create: operation.collection, ...operation.options };
    case 'collMod':
      return { collMod: operation.collection, ...operation.changes };
    case 'convertToCapped':
      return { convertToCapped: operation.collection, size: operation.size };
    case 'drop':
      return { drop: operation.collection };
    case 'createIndex':
      // `createIndexes` needs the name that `createIndex` of mongosh generates.
      return {
        createIndexes: operation.collection,
        indexes: [{ key: operation.keys, name: defaultIndexName(operation.keys), ...operation.options }],
      };
    case 'dropIndex':
      return { dropIndexes: operation.collection, index: operation.name };
    case 'createSearchIndex':
      return {
        createSearchIndexes: operation.collection,
        indexes: [{ name: operation.name, type: operation.searchType, definition: operation.definition }],
      };
    case 'updateSearchIndex':
      return { updateSearchIndex: operation.collection, name: operation.name, definition: operation.definition };
    case 'dropSearchIndex':
      return { dropSearchIndex: operation.collection, name: operation.name };
    case 'shardCollection':
      return shardKeyCommand(operation, database);
  }
}

/** The request of an operation on the right database: a `runCommand`, on `admin` for `shardCollection`. */
export function commandRequest(operation: StructureOperation, database: string): MongoRequest {
  return {
    engine: 'mongodb',
    database: operation.type === 'shardCollection' ? 'admin' : database,
    method: 'runCommand',
    arguments: [commandDocument(operation, database)],
    timeLimitMs: applyTimeLimitMs,
  };
}
