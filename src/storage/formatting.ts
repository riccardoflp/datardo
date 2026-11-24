/**
 * `formatting.json`, the rules of conditional formatting and whether **Hide formatting** is on (data.md; D72), at
 * version 1: `hidden`, `global` and `connections`, each connection with its `rules` and `databases`, each database
 * with its `rules` and `collections`, each collection with its `rules` and the scopes it leaves out (`off`). It is
 * read with the rules of a formatting file (`src/shared/formatting-rules.ts › readStoredFormatting`), which keep what
 * can be used and drop the rest; it is written in a stated order, the ids sorted and the empty entries left out
 * (R3.2), each rule in Mongoster's form (`table.formatting-file`).
 */
import type { Json } from '../shared/engine-request';
import {
  noFormatting,
  readStoredFormatting,
  writtenRules,
  type CollectionFormatting,
  type ConnectionFormatting,
  type DatabaseFormatting,
  type FormatRule,
  type StoredFormatting,
} from '../shared/formatting-rules';
import type { JsonObject, StoredFile } from './store';

function rulesWritten(rules: readonly FormatRule[]): readonly Json[] {
  return writtenRules(rules);
}

/** The entries of a record in the order of their names, written; those that hold nothing are left out. */
function sortedEntries<Value>(
  record: Readonly<Record<string, Value>>,
  write: (value: Value) => JsonObject | undefined,
): JsonObject {
  const written = Object.keys(record)
    .sort()
    .flatMap((name) => {
      const value = record[name];
      const object = value === undefined ? undefined : write(value);
      return object === undefined ? [] : [[name, object] as const];
    });
  return Object.fromEntries(written);
}

function collectionWritten(collection: CollectionFormatting): JsonObject | undefined {
  if (collection.rules.length === 0 && collection.off.length === 0) {
    return undefined;
  }
  return {
    rules: rulesWritten(collection.rules),
    ...(collection.off.length === 0 ? {} : { off: [...collection.off] }),
  };
}

function databaseWritten(database: DatabaseFormatting): JsonObject | undefined {
  const collections = sortedEntries(database.collections, collectionWritten);
  if (database.rules.length === 0 && Object.keys(collections).length === 0) {
    return undefined;
  }
  return { rules: rulesWritten(database.rules), collections };
}

function connectionWritten(connection: ConnectionFormatting): JsonObject | undefined {
  const databases = sortedEntries(connection.databases, databaseWritten);
  if (connection.rules.length === 0 && Object.keys(databases).length === 0) {
    return undefined;
  }
  return { rules: rulesWritten(connection.rules), databases };
}

/** What `formatting.json` holds besides its version, in the order it is written. */
export function formattingWritten(formatting: StoredFormatting): JsonObject {
  return {
    hidden: formatting.hidden,
    global: rulesWritten(formatting.global),
    connections: sortedEntries(formatting.connections, connectionWritten),
  };
}

/** The kind of `formatting.json`. */
export const formattingFile: StoredFile<StoredFormatting> = {
  path: 'formatting.json',
  holds: 'The formatting rules',
  version: 1,
  migrations: {},
  empty: () => ({ hidden: false, ...noFormatting }),
  read: (object: JsonObject): StoredFormatting => readStoredFormatting(object),
  write: formattingWritten,
};
