/**
 * The collections MongoDB keeps for itself, whose name starts with `system.` (users with their credentials, the
 * profiler's queries with their values, the definitions of views): no tool reads one the assistant names, as its
 * `collection` (`mcp.arguments`) or as the collection a pipeline joins (`mcp.refuse-write-stages`), whatever
 * `datardo.mcp.readData` says. The tools that need one read it by themselves (`slow_queries` the profiler).
 */

/** What the refusals say Datardo's MCP server does not read. */
export const systemCollectionsWords = 'the system.* collections (users, profiler, views…)';

/** Whether a collection is one the server keeps for itself. */
export function isSystemCollection(collection: string): boolean {
  return collection.startsWith('system.');
}

/** The sentence of a `system.*` collection given as a tool's `collection`. */
export function systemCollectionSentence(database: string, collection: string): string {
  return `${database}.${collection} is a system collection: Datardo's MCP server doesn't read ${systemCollectionsWords}.`;
}
