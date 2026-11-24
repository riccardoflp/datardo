/**
 * What a connection keeps of the exclusions from searches (glossary, "excluded from searches"; D70): `excluded` on a
 * whole connection, and `exclusions`, the keys of its MongoDB databases (`archive`) and collections (`shop.logs`; a
 * GridFS bucket by its `.files` collection). How the list is read from a file and kept in order is here, where the
 * stored files, the features and the window all reach it (`tree.excluded`).
 */

/** The keys excluded from searches: database names and `<database>.<collection>`, sorted, without repeats. */
export type Exclusions = readonly string[];

/** What a connection holds of its exclusions, each absent when empty or false. */
export interface ExclusionFields {
  readonly excluded?: true;
  readonly exclusions?: Exclusions;
}

/** A key: a database's name has no `.`; a collection's is `<database>.<collection>`. */
const exclusionKeyPattern = /^[^.]+(\..+)?$/u;

/** Whether a text is a key of `exclusions`. */
export function isExclusionKey(value: unknown): value is string {
  return typeof value === 'string' && exclusionKeyPattern.test(value);
}

/** Sorted by the code units of the keys (Datardo's choice), without repeats; `undefined` when empty. */
export function sortedExclusions(keys: Iterable<string>): Exclusions | undefined {
  const sorted = [...new Set(keys)].sort((one, other) => (one < other ? -1 : one > other ? 1 : 0));
  return sorted.length === 0 ? undefined : sorted;
}

/** The valid keys of a list read from a file, sorted, without repeats; `undefined` when none, or not a list. */
export function exclusionsOf(value: unknown): Exclusions | undefined {
  return Array.isArray(value) ? sortedExclusions((value as readonly unknown[]).filter(isExclusionKey)) : undefined;
}

/**
 * The fields of the exclusions as an entry writes them: `excluded` only when `true`, `exclusions` only when not empty
 * and, as `exclusions` is MongoDB's, only on a MongoDB entry.
 */
export function exclusionFields(
  given: { readonly excluded?: boolean | undefined; readonly exclusions?: Exclusions | undefined },
  engine: 'mongodb' | 'redis',
): ExclusionFields {
  const exclusions = engine === 'mongodb' && given.exclusions !== undefined ? sortedExclusions(given.exclusions) : [];
  return {
    ...(given.excluded === true ? { excluded: true } : {}),
    ...(exclusions === undefined || exclusions.length === 0 ? {} : { exclusions }),
  };
}
