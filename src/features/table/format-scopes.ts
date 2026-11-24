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

/** The rules of the four scopes in the order they are tried, without the scopes left out and the ids seen already. */
export function orderedRules(byScope: RulesByScope, off: readonly FormatScope[]): readonly ScopedRule[] {
  const seen = new Set<string>();
  const rules: ScopedRule[] = [];
  for (const scope of formatScopes.filter((each) => !off.includes(each))) {
    for (const rule of byScope[scope].filter((each) => !seen.has(each.id))) {
      seen.add(rule.id);
      rules.push({ rule, scope });
    }
  }
  return rules;
}

/**
 * Feature: table.format-scopes
 *
 * The rules that color a collection's table, in the order they are tried, each with its scope: scope by scope from
 * the nearest, each list in its order, without the scopes the collection leaves out; a rule whose id was seen in a
 * nearer scope is left out.
 */
export function rulesInOrder(kept: KeptFormatting, where: TableCollection): RulesOfCollection {
  const off = scopesOff(kept, where);
  return { rules: orderedRules(rulesByScope(kept, where), off), off };
}

/** The scopes a collection leaves out (a section's checkbox). */
export function scopesOff(kept: KeptFormatting, where: TableCollection): readonly FormatScope[] {
  return placesOf(kept, where).collection?.off ?? [];
}

/** How many rules that are on color a collection's table: the count of the **Formatting** button (`table.show`). */
export function rulesOn(kept: KeptFormatting, where: TableCollection): number {
  return rulesInOrder(kept, where).rules.filter((each) => each.rule.enabled !== false).length;
}

/** The place of a scope that reaches a collection: the collection, its database, its connection, or everywhere. */
export function placeOfScope(scope: FormatScope, where: TableCollection): ScopePlace {
  switch (scope) {
    case 'collection':
      return { scope, connection: where.connection, database: where.database, collection: where.collection };
    case 'database':
      return { scope, connection: where.connection, database: where.database };
    case 'connection':
      return { scope, connection: where.connection };
    case 'global':
      return { scope };
  }
}

/** The scope of the rule of an id among those that reach a collection, the nearest first. */
export function scopeOfRule(byScope: RulesByScope, id: string): FormatScope | undefined {
  return formatScopes.find((scope) => byScope[scope].some((rule) => rule.id === id));
}

/** Every rule id Datardo keeps, in every scope: a new rule takes an id none of them has. */
export function ruleIds(kept: KeptFormatting): ReadonlySet<string> {
  const connections = Object.values(kept.connections);
  const databases = connections.flatMap((connection) => Object.values(connection.databases));
  const collections = databases.flatMap((database) => Object.values(database.collections));
  const lists = [kept.global, ...[...connections, ...databases, ...collections].map((each) => each.rules)];
  return new Set(lists.flatMap((rules) => rules.map((rule) => rule.id)));
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

/** A collection's own rules, in their order (the scope **This collection**). */
export function collectionRules(kept: KeptFormatting, where: TableCollection): readonly FormatRule[] {
  return placesOf(kept, where).collection?.rules ?? [];
}

/** A connection's rules changed; a connection left with nothing goes. */
function withConnection(
  kept: KeptFormatting,
  id: string,
  change: (connection: ConnectionFormatting) => ConnectionFormatting,
): KeptFormatting {
  const next = change(own(kept.connections, id) ?? { rules: [], databases: {} });
  const empty = next.rules.length === 0 && Object.keys(next.databases).length === 0;
  return { ...kept, connections: withEntry(kept.connections, id, empty ? undefined : next) };
}

/** A database's rules changed; a database left with nothing goes, and its connection when it is left with nothing. */
function withDatabaseOf(
  kept: KeptFormatting,
  place: DatabasePlace,
  change: (database: DatabaseFormatting) => DatabaseFormatting,
): KeptFormatting {
  return withConnection(kept, place.connection, (connection) => {
    const next = change(own(connection.databases, place.database) ?? { rules: [], collections: {} });
    const empty = next.rules.length === 0 && Object.keys(next.collections).length === 0;
    return { ...connection, databases: withEntry(connection.databases, place.database, empty ? undefined : next) };
  });
}

/** A collection's rules or the scopes it leaves out changed; a collection left with nothing goes, and so on up. */
function withCollectionOf(
  kept: KeptFormatting,
  where: TableCollection,
  change: (collection: CollectionFormatting) => CollectionFormatting,
): KeptFormatting {
  return withDatabaseOf(kept, where, (database) => {
    const next = change(own(database.collections, where.collection) ?? { rules: [], off: [] });
    const empty = next.rules.length === 0 && next.off.length === 0;
    return { ...database, collections: withEntry(database.collections, where.collection, empty ? undefined : next) };
  });
}

/**
 * A collection's own rules replaced by `rules`, the scopes it leaves out kept; a collection left with nothing goes, and
 * so do a database and a connection left with nothing.
 */
export function withCollectionRules(
  kept: KeptFormatting,
  where: TableCollection,
  rules: readonly FormatRule[],
): KeptFormatting {
  return withCollectionOf(kept, where, (collection) => ({ ...collection, rules }));
}

/** The rules of a scope's place: a collection's own, a database's, a connection's, or those for everywhere. */
export function rulesOfPlace(kept: KeptFormatting, place: ScopePlace): readonly FormatRule[] {
  switch (place.scope) {
    case 'global':
      return kept.global;
    case 'connection':
      return own(kept.connections, place.connection)?.rules ?? [];
    case 'database':
      return own(own(kept.connections, place.connection)?.databases ?? {}, place.database)?.rules ?? [];
    case 'collection':
      return collectionRules(kept, place);
  }
}

/** The rules of a scope's place replaced by `rules`, in their order; what is left with nothing goes. */
export function withPlaceRules(kept: KeptFormatting, place: ScopePlace, rules: readonly FormatRule[]): KeptFormatting {
  switch (place.scope) {
    case 'global':
      return { ...kept, global: rules };
    case 'connection':
      return withConnection(kept, place.connection, (connection) => ({ ...connection, rules }));
    case 'database':
      return withDatabaseOf(kept, place, (database) => ({ ...database, rules }));
    case 'collection':
      return withCollectionRules(kept, place, rules);
  }
}

/** The scopes a collection leaves out replaced by `off`, its rules kept (a section's checkbox). */
export function withScopesOff(
  kept: KeptFormatting,
  where: TableCollection,
  off: readonly FormatScope[],
): KeptFormatting {
  const known = formatScopes.filter((scope) => off.includes(scope));
  return withCollectionOf(kept, where, (collection) => ({ ...collection, off: known }));
}

/** How many rules a connection keeps: its own, its databases' and its collections' (`connection.remove`). */
export function rulesOfConnection(kept: KeptFormatting, connection: string): number {
  const found = own(kept.connections, connection);
  if (found === undefined) {
    return 0;
  }
  const databases = Object.values(found.databases);
  const collections = databases.flatMap((database) => Object.values(database.collections));
  return (
    found.rules.length +
    databases.reduce((sum, database) => sum + database.rules.length, 0) +
    collections.reduce((sum, collection) => sum + collection.rules.length, 0)
  );
}

/** Whether a drop made from Datardo would forget rules: the collections named, or the whole database. */
export function hasRulesOf(
  kept: KeptFormatting,
  place: DatabasePlace,
  collections: readonly string[] | 'whole-database',
): boolean {
  const database = own(own(kept.connections, place.connection)?.databases ?? {}, place.database);
  if (database === undefined) {
    return false;
  }
  if (collections === 'whole-database') {
    return database.rules.length > 0 || Object.values(database.collections).some((each) => each.rules.length > 0);
  }
  return collections.some((name) => (own(database.collections, name)?.rules.length ?? 0) > 0);
}
