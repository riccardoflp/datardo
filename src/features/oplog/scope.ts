/**
 * Feature: oplog.scope — the **Databases and collections** of the connection form, one pattern per line, decide which
 * writes are published.
 */

/** A pattern as a regular expression of the whole name: `*` matches any characters, every other is literal. */
function wholeName(pattern: string): RegExp {
  const literal = pattern.replace(/[.+?^${}()|[\]\\]/gu, '\\$&').replace(/\*/gu, '.*');
  return new RegExp(`^${literal}$`, 'su');
}

function matches(pattern: string, database: string, collection: string): boolean {
  const dot = pattern.indexOf('.');
  if (dot < 0) {
    return wholeName(pattern).test(database);
  }
  return wholeName(pattern.slice(0, dot)).test(database) && wholeName(pattern.slice(dot + 1)).test(collection);
}

/**
 * Feature: oplog.scope. No pattern publishes everything; a pattern without a dot is a database, one with a dot is
 * `<database>.<collection>` split at the first dot; one matching pattern is enough.
 */
export function inScope(patterns: readonly string[] | undefined, database: string, collection: string): boolean {
  if (patterns === undefined || patterns.length === 0) {
    return true;
  }
  return patterns.some((pattern) => matches(pattern, database, collection));
}
