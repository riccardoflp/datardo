/**
 * Feature: tree.filter
 *
 * Shows only the databases and the collections, or the namespaces, whose name contains what is typed (`tree.match`).
 * MongoDB: a database is shown when its name matches or one of its collections or buckets does, expanded, with only
 * those that match. Redis: a database is shown when its name matches or one of its namespaces does, looking only into
 * the databases already scanned. **Pinned** and **Pages of** are not filtered. The filter is kept for each connection
 * until Datardo quits, and is not saved.
 */
import type { EngineName } from '../../shared/engine-request';
import { matches } from './match';
import type { Namespace } from './namespaces';
import { text } from './text';
import type { Control, DatabaseContents, Loadable, TreeInput, TreeIsland } from './types';

/** How long after the last key typed the tree follows the text, in ms. */
export const filterDelayMs = 300;

/** The field of the filter, under the header of the island. */
export interface FilterView {
  /** Whether the field is shown: opened, or a filter applies. */
  readonly open: boolean;
  /** Whether a filter applies: the button **Filter** is shown as on. */
  readonly on: boolean;
  readonly text: string;
  readonly label: string;
  readonly placeholder: string;
  readonly hint: string;
  /** **Clear filter**, at the end of the field. */
  readonly clear: Control;
}

/** The text that applies, trimmed; empty when no filter applies. */
export function appliedFilter(island: TreeIsland): string {
  return island.filter.text.trim();
}

/** Feature: tree.filter — the field of the filter, for the engine of the current connection. */
export function view(input: TreeInput, engine: EngineName): FilterView {
  const typed = input.island.filter.text;
  const on = typed.trim() !== '';
  return {
    open: input.island.filter.open || on,
    on,
    text: typed,
    label: text.filter.label,
    placeholder: text.filter.placeholder[engine],
    hint: text.filter.hint[engine],
    clear: { kind: 'window', label: text.filter.clear, action: 'clear-filter' },
  };
}

/** What the filter keeps of a MongoDB database. */
export interface FilteredDatabase {
  readonly shown: boolean;
  /** Whether the filter shows it expanded: it is shown, and what it holds is known. */
  readonly expanded: boolean;
  /** The buckets and entries that match; all of them when the filter is empty. */
  readonly contents?: DatabaseContents;
}

/**
 * A MongoDB database under a filter: shown when its name matches or one of its collections or buckets does. A database
 * whose collections are not known, or could not be listed, is shown only when its own name matches.
 */
export function filterDatabase(
  filter: string,
  database: string,
  contents: Loadable<DatabaseContents> | undefined,
): FilteredDatabase {
  const own = matches(filter, { kind: 'database', name: database });
  if (filter.trim() === '' || contents?.kind !== 'loaded') {
    return { shown: own, expanded: false };
  }
  const keeps = (name: string): boolean => matches(filter, { kind: 'collection', database, name });
  const kept: DatabaseContents = {
    buckets: contents.value.buckets.filter(keeps),
    entries: contents.value.entries.filter((entry) => keeps(entry.name)),
  };
  const any = kept.buckets.length > 0 || kept.entries.length > 0;
  return { shown: own || any, expanded: own || any, contents: kept };
}

/** The namespaces a filter keeps: those whose prefix matches, or under which one does, with only those under them. */
export function filterNamespaces(filter: string, namespaces: readonly Namespace[]): readonly Namespace[] {
  if (filter.trim() === '') {
    return namespaces;
  }
  return namespaces.flatMap((namespace) => {
    const under = filterNamespaces(filter, namespace.namespaces);
    const own = matches(filter, { kind: 'namespace', prefix: namespace.prefixText });
    return own || under.length > 0 ? [{ ...namespace, namespaces: under }] : [];
  });
}

/**
 * The nodes expanded once the field is emptied: the databases the filter showed expanded stay expanded. `forced` are
 * the identifiers of the nodes the filter expanded.
 */
export function expandedAfterClearing(island: TreeIsland, forced: readonly string[]): readonly string[] {
  return [...island.expanded, ...forced.filter((id) => !island.expanded.includes(id))];
}
