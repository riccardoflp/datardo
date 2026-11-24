/**
 * Feature: tree.excluded
 *
 * Whether a node is excluded from searches, by an entry of its own or through its database, and what each search does
 * with it: what is excluded is left out, unless it is what was asked for by name (D70). The connection keeps
 * `excluded` (the whole connection, of either engine) and `exclusions`, the keys of its MongoDB databases and
 * collections, as `collectionColors` keys them (`tree.color-of`); a GridFS bucket by its `.files` collection. The same
 * module keeps the list in step when Datardo renames or drops what it names.
 */
import { sortedExclusions, type Exclusions } from '../../shared/exclusion';
import { bucketCollection, collectionKey, type Dropped } from './color-of';

/** What `exclusionOf` needs of a connection. */
export interface ExcludingConnection {
  readonly excluded?: true | undefined;
  readonly exclusions?: Exclusions | undefined;
}

/** What an exclusion is looked up for: the connection, a database, or a collection, a view or a bucket of one. */
export type ExclusionTarget =
  | { readonly kind: 'connection' }
  | { readonly kind: 'database'; readonly database: string }
  | { readonly kind: 'collection'; readonly database: string; readonly collection: string }
  | { readonly kind: 'bucket'; readonly database: string; readonly bucket: string };

/**
 * Whether a target is excluded: *own* (it has an entry of its own), *with its database* (a collection, a view or a
 * bucket of a database that has one), or *not excluded*.
 */
export type Exclusion = 'own' | 'with-database' | 'not-excluded';

/** The key of a database, a collection, a view or a bucket in `exclusions`; none for the connection. */
export function exclusionKey(target: Exclude<ExclusionTarget, { kind: 'connection' }>): string {
  switch (target.kind) {
    case 'database':
      return target.database;
    case 'collection':
      return collectionKey(target.database, target.collection);
    case 'bucket':
      return collectionKey(target.database, bucketCollection(target.bucket));
  }
}

function hasKey(connection: ExcludingConnection, key: string): boolean {
  return connection.exclusions?.includes(key) === true;
}

/**
 * Feature: tree.excluded — whether a target is excluded from searches. A connection is *own* when `excluded` is
 * `true`, which says nothing of what is in it: its databases and collections are excluded only by their own entries.
 */
export function exclusionOf(connection: ExcludingConnection, target: ExclusionTarget): Exclusion {
  if (target.kind === 'connection') {
    return connection.excluded === true ? 'own' : 'not-excluded';
  }
  if (hasKey(connection, exclusionKey(target))) {
    return 'own';
  }
  return target.kind !== 'database' && hasKey(connection, target.database) ? 'with-database' : 'not-excluded';
}

/** Whether searches leave a target out: by an entry of its own, or through its database. */
export function isExcluded(connection: ExcludingConnection, target: ExclusionTarget): boolean {
  return exclusionOf(connection, target) !== 'not-excluded';
}

/** Whether a database, or a collection of one, has an entry of its own (not its database's). */
export function hasOwnExclusion(connection: ExcludingConnection, database: string, collection?: string): boolean {
  return hasKey(connection, collection === undefined ? database : collectionKey(database, collection));
}

/** The list with `keys` added (`excluded`) or removed; the same list when nothing changes, nothing when left empty. */
export function withExclusions(
  list: Exclusions | undefined,
  keys: readonly string[],
  excluded: boolean,
): Exclusions | undefined {
  const before = new Set(list ?? []);
  const changes = keys.some((key) => before.has(key) !== excluded);
  if (!changes) {
    return list;
  }
  const after = excluded ? [...before, ...keys] : [...before].filter((key) => !keys.includes(key));
  return sortedExclusions(after);
}

/** The list with the key of `database.from` moved to `database.to`; the same list when it has none. */
export function renamedExclusions(
  list: Exclusions | undefined,
  database: string,
  from: string,
  to: string,
): Exclusions | undefined {
  const fromKey = collectionKey(database, from);
  if (list?.includes(fromKey) !== true) {
    return list;
  }
  return withExclusions(withExclusions(list, [fromKey], false), [collectionKey(database, to)], true);
}

function isDropped(dropped: Dropped, key: string): boolean {
  switch (dropped.kind) {
    case 'collection':
      return key === collectionKey(dropped.database, dropped.collection);
    case 'bucket':
      return (
        key === collectionKey(dropped.database, bucketCollection(dropped.bucket)) ||
        key === collectionKey(dropped.database, `${dropped.bucket}.chunks`)
      );
    case 'database':
      return key === dropped.database || key.startsWith(`${dropped.database}.`);
  }
}

/**
 * The list without the key of a dropped collection or view; of a dropped bucket, the keys of its `.files` and
 * `.chunks` collections; of a dropped database, its key and every key that starts with `database.`. The same list
 * when nothing goes, nothing when it is left empty.
 */
export function droppedExclusions(list: Exclusions | undefined, dropped: Dropped): Exclusions | undefined {
  if (list === undefined) {
    return undefined;
  }
  const kept = list.filter((key) => !isDropped(dropped, key));
  return kept.length === list.length ? list : sortedExclusions(kept);
}

/** Whether a drop would forget a key of the connection's list: whether the plan has the step that forgets it. */
export function hasExclusionsOf(connection: ExcludingConnection, dropped: Dropped): boolean {
  return droppedExclusions(connection.exclusions, dropped) !== connection.exclusions;
}
