/**
 * The references kept per connection and database (`relation.read`, "The references kept"), as pure changes the main
 * process applies when something happens, and the questions it asks them: does this tab need a read, which references
 * do the tabs use. Found once in the background, kept until Datardo quits; **Refresh** makes them old (still used,
 * found again when a tab next needs them); a diagram replaces them; a disconnect forgets them; a failure keeps the old
 * ones as old.
 */
import type { ConnectionId } from '../../../shared/ids';
import type { ReferenceGraph } from '../types';

/** What is kept for one database. */
export interface KeptEntry {
  readonly connection: ConnectionId;
  readonly database: string;
  /** The references last found; absent until a read ends. */
  readonly graph?: ReferenceGraph;
  /** Whether **Refresh** made them old since. */
  readonly old: boolean;
  /** Whether a read for the tabs is under way: tabs that ask meanwhile wait for it. */
  readonly reading: boolean;
}

/** Everything kept, one entry per connection and database. */
export type KeptReferences = readonly KeptEntry[];

/** What changes what is kept. */
export type KeptEvent =
  | { readonly kind: 'reading'; readonly connection: ConnectionId; readonly database: string }
  | { readonly kind: 'found'; readonly graph: ReferenceGraph; readonly connection: ConnectionId }
  | { readonly kind: 'failed'; readonly connection: ConnectionId; readonly database: string }
  /** **Refresh** of the tree island, on a database or on every database of a connection. */
  | { readonly kind: 'refreshed'; readonly connection: ConnectionId; readonly database?: string }
  /** The connection was disconnected or removed. */
  | { readonly kind: 'forgotten'; readonly connection: ConnectionId };

function isOf(entry: KeptEntry, connection: ConnectionId, database?: string): boolean {
  return entry.connection === connection && (database === undefined || entry.database === database);
}

/** What is kept for a database, when anything is. */
export function keptFor(kept: KeptReferences, connection: ConnectionId, database: string): KeptEntry | undefined {
  return kept.find((entry) => isOf(entry, connection, database));
}

function replaced(kept: KeptReferences, entry: KeptEntry): KeptReferences {
  return [...kept.filter((each) => !isOf(each, entry.connection, entry.database)), entry];
}

/** What is kept after an event. A read under way when **Refresh** is pressed finishes and is kept as new. */
export function keptAfter(kept: KeptReferences, event: KeptEvent): KeptReferences {
  switch (event.kind) {
    case 'reading': {
      const before = keptFor(kept, event.connection, event.database);
      return replaced(kept, {
        connection: event.connection,
        database: event.database,
        old: before?.old ?? false,
        ...(before?.graph === undefined ? {} : { graph: before.graph }),
        reading: true,
      });
    }
    case 'found':
      return replaced(kept, {
        connection: event.connection,
        database: event.graph.database,
        graph: event.graph,
        old: false,
        reading: false,
      });
    case 'failed': {
      const before = keptFor(kept, event.connection, event.database);
      return before?.graph === undefined
        ? kept.filter((each) => !isOf(each, event.connection, event.database))
        : replaced(kept, { ...before, old: true, reading: false });
    }
    case 'refreshed':
      return kept.map((entry) =>
        isOf(entry, event.connection, event.database) && !entry.reading ? { ...entry, old: true } : entry,
      );
    case 'forgotten':
      return kept.filter((entry) => entry.connection !== event.connection);
  }
}

/**
 * Whether a collection tab that shows its documents starts a read of the references of its database: when they are
 * found by themselves (`datardo.relation.detect`), none is under way, and none is kept or those kept are old.
 */
export function needsReading(
  kept: KeptReferences,
  place: { readonly connection: ConnectionId; readonly database: string },
  detect: boolean,
): boolean {
  const entry = keptFor(kept, place.connection, place.database);
  if (!detect || entry?.reading === true) {
    return false;
  }
  return entry?.graph === undefined || entry.old;
}

/** The references the tabs of a database use: those kept, old ones too, until new ones are found. */
export function usedReferences(
  kept: KeptReferences,
  connection: ConnectionId,
  database: string,
): ReferenceGraph | undefined {
  return keptFor(kept, connection, database)?.graph;
}
