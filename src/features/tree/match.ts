/**
 * Feature: tree.match
 *
 * The rule that decides which names the filter of the tree keeps: the text of a node contains the filter, both in
 * lower case, with nothing in the filter taken as a wildcard. A node excluded from searches, by an entry of its own or
 * through its database (`tree.excluded`), matches no filter that is not empty.
 */

/** A node as the filter sees it; `excluded` when searches leave it out (`tree.excluded`). */
export type MatchedNode = (
  | { readonly kind: 'database'; readonly name: string }
  /** A collection, a view, a time series collection or a bucket. */
  | { readonly kind: 'collection'; readonly database: string; readonly name: string }
  | { readonly kind: 'redis-database'; readonly number: number }
  | { readonly kind: 'namespace'; readonly prefix: string }
) & { readonly excluded?: boolean };

/** The text of a node the filter looks in: `shop`, `shop.orders`, `db1`, `orders:2024:`. */
export function matchedText(node: MatchedNode): string {
  switch (node.kind) {
    case 'database':
      return node.name;
    case 'collection':
      return `${node.database}.${node.name}`;
    case 'redis-database':
      return `db${String(node.number)}`;
    case 'namespace':
      return node.prefix;
  }
}

/**
 * Whether a node matches the filter: the filter is trimmed, and an empty one matches every node, excluded nodes too; a
 * filter that is not empty never matches an excluded node.
 */
export function matches(filter: string, node: MatchedNode): boolean {
  const wanted = filter.trim().toLowerCase();
  return wanted === '' || (node.excluded !== true && matchedText(node).toLowerCase().includes(wanted));
}
