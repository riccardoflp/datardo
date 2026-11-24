/**
 * Feature: table.format-scopes
 *
 * Which formatting rules color a collection's table, from the four formatting scopes (this collection, its database,
 * its connection, everywhere), in the order they are tried: the nearest first, so that a rule for one collection wins
 * over a rule for everywhere. Also which tabs a change of a scope reaches, and what a drop, a rename or the removal of
 * a connection does to the rules kept.
 */
import {
  formatScopes,
  type CollectionFormatting,
  type ConnectionFormatting,
  type DatabaseFormatting,
  type FormatRule,
  type FormatScope,
  type KeptFormatting,
} from '../../shared/formatting-rules';
import type { TableCollection } from './types';

/** A rule that reaches a collection, with the scope it is kept in. */
export interface ScopedRule {
  readonly rule: FormatRule;
  readonly scope: FormatScope;
}

/** The rules of a collection in the order they are tried, and the scopes it leaves out. */
export interface RulesOfCollection {
  readonly rules: readonly ScopedRule[];
  readonly off: readonly FormatScope[];
}

/** The rules of each of the four scopes that reach a collection. */
export type RulesByScope = Readonly<Record<FormatScope, readonly FormatRule[]>>;

/** A scope of one place: a collection, a database or a connection, or everywhere. */
export type ScopePlace =
  | {
      readonly scope: 'collection';
      readonly connection: string;
      readonly database: string;
      readonly collection: string;
    }
  | { readonly scope: 'database'; readonly connection: string; readonly database: string }
  | { readonly scope: 'connection'; readonly connection: string }
  | { readonly scope: 'global' };

function own<Value>(record: Readonly<Record<string, Value>>, key: string): Value | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function placesOf(kept: KeptFormatting, where: TableCollection) {
  const connection = own(kept.connections, where.connection);
  const database = connection === undefined ? undefined : own(connection.databases, where.database);
  const collection = database === undefined ? undefined : own(database.collections, where.collection);
  return { connection, database, collection };
}

/** The rules of the four scopes that reach a collection, each list in its order, with none left out. */
export function rulesByScope(kept: KeptFormatting, where: TableCollection): RulesByScope {
  const { connection, database, collection } = placesOf(kept, where);
  return {
    collection: collection?.rules ?? [],
    database: database?.rules ?? [],
    connection: connection?.rules ?? [],
    global: kept.global,
  };
}

/**
 * Feature: table.format-scopes
 *
 * The rules that color a collection's table, in the order they are tried, each with its scope: scope by scope from
 * the nearest, each list in its order, without the scopes the collection leaves out; a rule whose id was seen in a
 * nearer scope is left out.
 */
export function rulesInOrder(kept: KeptFormatting, where: TableCollection): RulesOfCollection {
  const off = placesOf(kept, where).collection?.off ?? [];
  const byScope = rulesByScope(kept, where);
  const seen = new Set<string>();
  const rules: ScopedRule[] = [];
  for (const scope of formatScopes.filter((each) => !off.includes(each))) {
    for (const rule of byScope[scope].filter((each) => !seen.has(each.id))) {
      seen.add(rule.id);
      rules.push({ rule, scope });
    }
  }
  return { rules, off };
}

/** Whether a change to the rules of a scope reaches the tab of a collection, which is then colored again. */
export function scopeReaches(place: ScopePlace, where: TableCollection): boolean {
  switch (place.scope) {
    case 'global':
      return true;
    case 'connection':
      return place.connection === where.connection;
    case 'database':
      return place.connection === where.connection && place.database === where.database;
    case 'collection':
      return (
        place.connection === where.connection &&
        place.database === where.database &&
        place.collection === where.collection
      );
  }
}

function withEntry<Value>(record: Readonly<Record<string, Value>>, key: string, value: Value | undefined) {
  const rest = Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));
  return value === undefined ? rest : { ...rest, [key]: value };
}

/** A database of a connection. */
type DatabasePlace = Pick<TableCollection, 'connection' | 'database'>;

/** The rules kept with one database changed, or removed when `change` gives nothing. */
function withDatabase(
  kept: KeptFormatting,
  place: DatabasePlace,
  change: (database: DatabaseFormatting) => DatabaseFormatting | undefined,
): KeptFormatting {
  const connection = own(kept.connections, place.connection);
  const current = connection === undefined ? undefined : own(connection.databases, place.database);
  if (connection === undefined || current === undefined) {
    return kept;
  }
  const databases = withEntry(connection.databases, place.database, change(current));
  const next: ConnectionFormatting = { ...connection, databases };
  return { ...kept, connections: withEntry(kept.connections, place.connection, next) };
}

/** Removing a connection removes the rules of the connection, of its databases and of its collections. */
export function withoutConnection(kept: KeptFormatting, connection: string): KeptFormatting {
  return { ...kept, connections: withEntry(kept.connections, connection, undefined) };
}

/** **Drop database…** made from Datardo removes the database's rules and those of its collections. */
export function withoutDatabase(kept: KeptFormatting, place: DatabasePlace): KeptFormatting {
  return withDatabase(kept, place, () => undefined);
}

/** **Drop…** of a collection or a view made from Datardo removes its rules and the scopes it leaves out. */
export function withoutCollection(kept: KeptFormatting, where: TableCollection): KeptFormatting {
  return withDatabase(kept, where, (database) => ({
    ...database,
    collections: withEntry(database.collections, where.collection, undefined),
  }));
}

/** **Rename collection…** made from Datardo moves the collection's rules and what it leaves out to the new name. */
export function withRenamedCollection(kept: KeptFormatting, where: TableCollection, name: string): KeptFormatting {
  const moved: CollectionFormatting | undefined = placesOf(kept, where).collection;
  if (moved === undefined || name === where.collection) {
    return kept;
  }
  return withDatabase(kept, where, (database) => ({
    ...database,
    collections: withEntry(withEntry(database.collections, where.collection, undefined), name, moved),
  }));
}
