/**
 * What the tool `describe_relations` of the MCP server answers from a read of `relation.read` with its own sample:
 * the relations of the database, or only those from and to one collection, in the texts of `relation.detect`, and
 * the collections that could not be read. It does not change the references kept for the tabs.
 */
import { relationText } from '../detect';
import { text } from '../text';
import type { ReferenceGraph } from '../types';

/** The answer of the tool, as lines; the refusal when the collection asked for does not exist. */
export function describedRelations(
  graph: ReferenceGraph,
  asked: { readonly collection?: string; readonly connectionName: string },
): { readonly lines: readonly string[] } | { readonly error: string } {
  const { collection } = asked;
  if (collection !== undefined && !graph.collections.some((each) => each.name === collection)) {
    return { error: text.mcp.notFound(graph.database, collection, asked.connectionName) };
  }
  const relations = graph.relations.filter(
    (relation) => collection === undefined || relation.from === collection || relation.to === collection,
  );
  const unreadable = graph.collections.flatMap((each) =>
    each.unreadable === undefined ? [] : [text.mcp.unreadable(each.name, each.unreadable)],
  );
  const lines = relations.length === 0 ? [text.mcp.none] : relations.map(relationText);
  return { lines: [...lines, ...unreadable] };
}
