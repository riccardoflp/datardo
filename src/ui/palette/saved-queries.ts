/**
 * The saved queries Go to finds (`saved-query.connection-list`): those of each saved MongoDB connection, read when Go
 * to opens and again when the main process says they changed (the `changed` event of the saved-query slice), with the
 * databases and collections the tree of the connection last read.
 */
import { useEffect, useSyncExternalStore } from 'react';
import type { ConnectionQueries } from '../../features/saved-query/connection-list';
import type { Json } from '../../shared/engine-request';
import { featureId, type ConnectionId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { revisionOf } from '../../shared/state/saved-query';
import { treeOf } from '../tree/tree-store';

let known: Readonly<Record<string, ConnectionQueries>> = {};
const listeners = new Set<() => void>();

function setKnown(connection: string, queries: ConnectionQueries): void {
  known = { ...known, [connection]: queries };
  for (const listener of listeners) {
    listener();
  }
}

/** The databases the tree of a connection last read, each with its collections when they were read. */
export function treeNames(connection: ConnectionId): Json | undefined {
  const { mongodb } = treeOf(connection).island;
  if (mongodb.databases.kind !== 'loaded') {
    return undefined;
  }
  return mongodb.databases.value.map((database) => {
    const contents = mongodb.contents[database.name];
    return contents?.kind === 'loaded'
      ? { name: database.name, collections: contents.value.entries.map((entry) => entry.name) }
      : { name: database.name };
  });
}

async function readQueries(connection: ConnectionId): Promise<void> {
  const databases = treeNames(connection);
  const result = await window.datardo.start({
    feature: featureId('saved-query.connection-list'),
    target: { kind: 'connection', connection },
    args: { connection, ...(databases === undefined ? {} : { databases }) },
  });
  if (result.kind === 'read') {
    setKnown(connection, result.result as ConnectionQueries);
  }
}

/** What makes the saved queries of a connection be read again: the connection, its revision and its folder. */
function wantedOf(state: AppState): string {
  return state.connections.saved
    .filter((saved) => saved.engine === 'mongodb')
    .map((saved) =>
      [saved.id, String(revisionOf(state.savedQuery, saved.id)), saved.queriesFolder ?? ''].join('\u0000'),
    )
    .join('\u0001');
}

/** The saved queries of each saved MongoDB connection, by connection id, read again whenever they change. */
export function useSavedQueries(state: AppState): Readonly<Record<string, ConnectionQueries>> {
  const queries = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => known,
  );
  const wanted = wantedOf(state);
  useEffect(() => {
    for (const each of wanted === '' ? [] : wanted.split('\u0001')) {
      void readQueries((each.split('\u0000')[0] ?? '') as ConnectionId);
    }
  }, [wanted]);
  return queries;
}
