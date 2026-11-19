/**
 * The three lists of the right side of the comparison page (`compare.show`, "Choosing the right side"): the MongoDB
 * connections, the databases of the one chosen, and the collections and views of the database chosen, each with what
 * comes first and what is left out.
 */
import type { ConnectionView } from '../../../shared/connection';
import type { ConnectionId } from '../../../shared/ids';
import { text } from '../text';
import type { SideRef } from '../types';

/** A connection of **Connection**, with *same connection* and *read-only* beside it when they apply. */
export interface ConnectionChoice {
  readonly connection: ConnectionId;
  readonly name: string;
  readonly notes: readonly string[];
}

/** A collection or a view of **Collection**. */
export interface CollectionChoice {
  readonly name: string;
  readonly view: boolean;
}

/** The databases **Database** never lists. */
const hiddenDatabases: ReadonlySet<string> = new Set(['local', 'config']);

function firstThenByName<T>(items: readonly T[], nameOf: (item: T) => string, first: string): readonly T[] {
  return [...items].sort((one, other) => {
    const [a, b] = [nameOf(one), nameOf(other)];
    return Number(b === first) - Number(a === first) || (a < b ? -1 : a > b ? 1 : 0);
  });
}

/** **Connection**: the MongoDB connections, the left side's first, the others in their order. */
export function connectionChoices(saved: readonly ConnectionView[], left: SideRef): readonly ConnectionChoice[] {
  const mongo = saved.filter((connection) => connection.engine === 'mongodb');
  const ordered = [
    ...mongo.filter((connection) => connection.id === left.connection),
    ...mongo.filter((connection) => connection.id !== left.connection),
  ];
  return ordered.map((connection) => ({
    connection: connection.id,
    name: connection.name,
    notes: [
      ...(connection.id === left.connection ? [text.sides.sameConnection] : []),
      ...(connection.readOnly ? [text.sides.readOnly] : []),
    ],
  }));
}

/** **Database**: the databases without `local` and `config`, the one with the left database's name first. */
export function databaseChoices(names: readonly string[], left: SideRef): readonly string[] {
  return firstThenByName(
    names.filter((name) => !hiddenDatabases.has(name)),
    (name) => name,
    left.database,
  );
}

/**
 * **Collection**: the collections and views of the database without the `system.` ones and without the left collection
 * itself, the one with the left collection's name first, then by name.
 */
export function collectionChoices(
  listed: readonly CollectionChoice[],
  left: SideRef,
  right: { readonly connection: ConnectionId; readonly database: string },
): readonly CollectionChoice[] {
  const sameDatabase = right.connection === left.connection && right.database === left.database;
  const kept = listed.filter(
    (each) => !each.name.startsWith('system.') && !(sameDatabase && each.name === left.collection),
  );
  return firstThenByName(kept, (each) => each.name, left.collection);
}

/** The database chosen by itself: the one with the left database's name. */
export function databaseChosenByItself(choices: readonly string[], left: SideRef): string | undefined {
  return choices.find((name) => name === left.database);
}

/** The collection chosen by itself: the one with the left collection's name. */
export function collectionChosenByItself(choices: readonly CollectionChoice[], left: SideRef): string | undefined {
  return choices.find((each) => each.name === left.collection)?.name;
}

/** What the page says when **Collection** has nothing to list. */
export function nothingToCompare(connectionName: string, database: string): string {
  return text.sides.nothingToCompare(connectionName, database);
}
