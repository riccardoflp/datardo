/**
 * What the controls of the table, the inspector and the document tab start of the document area: the Operations,
 * started through the bridge on the tab's collection with the `_id`s they act on (`document.delete`,
 * `document.duplicate`, `document.delete-selected`, `document.update-selected`, `document.update-many`,
 * `document.delete-many`), the document tab opened by `tab.open` (`document.open`), and the inspector shown
 * (`document.inspect`).
 */
import type { DocumentPlace } from '../../../features/document/types';
import { oneLineText } from '../../../features/document/write/values';
import type { Document } from '../../../features/table/types';
import type { IntentResult } from '../../../shared/bridge';
import type { Json } from '../../../shared/engine-request';
import type { ConnectionId } from '../../../shared/ids';
import type { AppState } from '../../../shared/state';
import { runQuery, type CollectionRef } from '../../query/collection-reads';
import { collectionOf, textsRan } from '../../query/collection-store';
import { startFeature } from '../../shell/intent';
import { currentAppState } from '../../state/store';
import { startOnCollection } from '../../table/table-start';

/** The collection of a place, with its connection as it is now (D14). */
export function placeOfCollection(
  state: AppState,
  where: { readonly connection: ConnectionId; readonly database: string; readonly collection: string },
  view: boolean,
): DocumentPlace {
  const saved = state.connections.saved.find((each) => each.id === where.connection);
  return {
    connection: where.connection,
    connectionName: saved?.name ?? where.connection,
    saved: saved !== undefined,
    readOnly: saved?.readOnly ?? false,
    keepsUndo: saved?.keepsUndo ?? true,
    database: where.database,
    collection: where.collection,
    view,
  };
}

/** The place of a collection tab. */
export function placeOfRef(ref: CollectionRef): DocumentPlace {
  return placeOfCollection(currentAppState(), ref, ref.kind === 'view');
}

/** Starts a feature of this area on the tab's collection, saying when it is a view so that the feature refuses. */
export function startOnDocuments(
  ref: CollectionRef,
  element: string,
  args: { readonly [key: string]: Json } = {},
): Promise<IntentResult> {
  return startOnCollection(ref, element, { ...args, ...(ref.kind === 'view' ? { view: true } : {}) });
}

/** The `_id`s of documents, those without one left out. */
export function idsOf(documents: readonly Document[]): Json[] {
  return documents.flatMap((document) => (document['_id'] === undefined ? [] : [document['_id']]));
}

/** What a document tab shows: the document of a collection by its `_id`. */
export function documentShows(
  where: { readonly connection: ConnectionId; readonly database: string; readonly collection: string },
  id: Json,
  view = false,
): Json {
  return {
    kind: 'document',
    connection: where.connection,
    database: where.database,
    collection: where.collection,
    id: oneLineText(id),
    idJson: JSON.stringify(id),
    ...(view ? { view: true } : {}),
  };
}

/** **Open in a tab**: the document in a tab of its own (`document.open`), or its tab made active. */
export function openDocumentTab(ref: CollectionRef, document: Document, element: string): void {
  const id = document['_id'];
  if (id === undefined) {
    return;
  }
  const at = element.indexOf('@');
  startFeature('tab.open', {
    ...(at < 0 ? {} : { place: element.slice(at + 1) as never }),
    args: { shows: documentShows(ref, id, ref.kind === 'view') },
  });
}

/**
 * **Update many…** and **Delete many…**: the filter of the query bar as written. When it differs from the query last
 * run, the query runs first, so that the table shows the documents concerned.
 */
export async function startOnFilter(ref: CollectionRef, element: string): Promise<IntentResult> {
  const collection = collectionOf(ref.tab);
  const filter = collection.query.texts.filter;
  if (filter !== textsRan(collection).filter) {
    await runQuery(ref, { texts: 'bar', count: true });
  }
  return startOnDocuments(ref, element, { filter });
}
