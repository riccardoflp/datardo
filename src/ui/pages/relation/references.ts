/**
 * `relation.follow` in the window: the references a collection tab knows (those the main process keeps for its
 * database, `relation.read`), the links of its cells and rows, and following them (`relation.open-referenced`,
 * `relation.open-referencing`). A view has the links of the collection it reads.
 */
import { valuesAt, type KnownReferences, type TableReferences } from '../../../features/relation/follow';
import { keptFor, type KeptReferences } from '../../../features/relation/kept/references';
import { collectionReferences } from '../../../features/relation/targets';
import type { Relation } from '../../../features/relation/types';
import { setting } from '../../../features/settings/read';
import type { TableMode } from '../../../features/table/types';
import type { Json } from '../../../shared/engine-request';
import type { ConnectionId, Place } from '../../../shared/ids';
import type { AppState } from '../../../shared/state';
import { startFeature } from '../../shell/intent';
import { useAppState } from '../../state/store';

/** The collection of a tab, where it is. */
export interface Where {
  readonly connection: ConnectionId;
  readonly database: string;
  readonly collection: string;
}

/** The references of a database as a tab knows them: found, being found, or not found by themselves. */
export function knownReferences(app: AppState, connection: ConnectionId, database: string): KnownReferences {
  const entry = keptFor(app.relation.kept as unknown as KeptReferences, connection, database);
  if (entry?.graph !== undefined) {
    return { kind: 'known', relations: entry.graph.relations };
  }
  if (entry?.reading !== true && !setting(app.settings, 'datardo.relation.detect')) {
    return { kind: 'not-detected' };
  }
  return { kind: 'finding' };
}

/** The collection a view reads, when the references know it; the collection itself otherwise. */
function readCollection(references: KnownReferences, collection: string): string {
  if (references.kind !== 'known') {
    return collection;
  }
  return references.relations.find((each) => each.kind === 'view' && each.from === collection)?.to ?? collection;
}

/** What a collection tab knows to mark the references of its cells and rows. */
export function tableReferencesOf(app: AppState, where: Where, mode: TableMode): TableReferences {
  const references = knownReferences(app, where.connection, where.database);
  return {
    database: where.database,
    collection: readCollection(references, where.collection),
    source: mode,
    references,
  };
}

/** What a collection tab knows of the references, drawn again when they change. */
export function useTableReferences(where: Where, mode: TableMode): TableReferences {
  return tableReferencesOf(useAppState(), where, mode);
}

function relationsOf(references: TableReferences): readonly Relation[] {
  return references.references.kind === 'known' ? references.references.relations : [];
}

/** Opens the documents a value refers to; `label` names the target when the field refers to several collections. */
export function openReferenced(
  where: Where,
  references: TableReferences,
  field: { readonly path: string; readonly value: Json | undefined; readonly label?: string },
  place: Place,
): void {
  const { outgoing } = collectionReferences(relationsOf(references), references.collection);
  startFeature('relation.open-referenced', {
    place,
    target: { kind: 'database', connection: where.connection, database: where.database },
    args: JSON.parse(
      JSON.stringify({
        connection: where.connection,
        database: where.database,
        outgoing,
        path: field.path,
        value: field.value ?? null,
        ...(field.label === undefined ? {} : { label: field.label }),
      }),
    ) as Json,
  });
}

/** Opens the documents of a line of **Referenced by** that refer to a document. */
export function openReferencing(
  where: Where,
  references: TableReferences,
  line: { readonly document: Json; readonly label: string },
  place: Place,
): void {
  const { document, label } = line;
  const { incoming } = collectionReferences(relationsOf(references), references.collection);
  startFeature('relation.open-referencing', {
    place,
    target: { kind: 'database', connection: where.connection, database: where.database },
    args: JSON.parse(
      JSON.stringify({ connection: where.connection, database: where.database, incoming, document, label }),
    ) as Json,
  });
}

/** The value a line of **Go from here** follows: the values of its field in the document. */
export function lineValue(document: Json, path: string): Json | undefined {
  return valuesAt(document, path);
}
