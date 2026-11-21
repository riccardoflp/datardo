/**
 * What Go to knows besides the app's state (`palette.sources`): the names of the collections of each connected MongoDB
 * connection, read by `palette.find-collections` when something is typed and kept until the connection is disconnected
 * or the names are older than 5 minutes; the commands offered now (`palette.run-command`); and the saved queries of
 * each saved MongoDB connection (`saved-query.connection-list`).
 */
import { useEffect, useSyncExternalStore } from 'react';
import { commands as registeredCommands } from '../../features/commands';
import { isStale, type FoundCollections } from '../../features/palette/find-collections';
import { offeredCommands } from '../../features/palette/run-command';
import { isChartOfferedNow } from '../pages/chart/chart-commands';
import { isCodeOfferedNow } from '../pages/code/code-commands';
import type { KnownCollections, PaletteKnowledge } from '../../features/palette/types';
import type { Json } from '../../shared/engine-request';
import { featureId, type ConnectionId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { connectionState } from '../../shared/state/connections';
import { useSavedQueries } from './saved-queries';

let known: Readonly<Record<string, KnownCollections>> = {};
const reading = new Set<string>();
const listeners = new Set<() => void>();

function setKnown(next: Readonly<Record<string, KnownCollections>>): void {
  known = next;
  for (const listener of listeners) {
    listener();
  }
}

async function readRound(connection: ConnectionId, args: Json): Promise<FoundCollections | undefined> {
  const result = await window.datardo.start({
    feature: featureId('palette.find-collections'),
    target: { kind: 'connection', connection },
    args,
  });
  return result.kind === 'read' ? (result.result as FoundCollections) : undefined;
}

/** Reads the names of a connection, in two rounds; nothing is kept when a round fails. */
async function readNames(connection: ConnectionId): Promise<void> {
  if (reading.has(connection)) {
    return;
  }
  reading.add(connection);
  try {
    const databases = await readRound(connection, { connection });
    if (databases?.kind !== 'databases') {
      return;
    }
    const collections = await readRound(connection, { connection, databases: [...databases.databases] });
    if (collections?.kind === 'collections') {
      setKnown({ ...known, [connection]: { names: collections.names, more: collections.more, at: Date.now() } });
    }
  } finally {
    reading.delete(connection);
  }
}

/** The connected MongoDB connections. */
function connectedMongo(state: AppState): readonly ConnectionId[] {
  return state.connections.saved
    .filter((saved) => saved.engine === 'mongodb' && connectionState(state.connections, saved.id) === 'connected')
    .map((saved) => saved.id);
}

/**
 * What Go to knows now. While `looking` (something is typed that looks in the collections), the names of each
 * connected MongoDB connection not read yet, or read more than 5 minutes ago, are read.
 */
export function useKnowledge(state: AppState, looking: boolean): PaletteKnowledge {
  const collections = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => known,
  );
  const connected = connectedMongo(state);
  const connectedKey = connected.join(',');
  useEffect(() => {
    const kept = Object.fromEntries(Object.entries(known).filter(([id]) => connectedKey.split(',').includes(id)));
    if (Object.keys(kept).length !== Object.keys(known).length) {
      setKnown(kept);
    }
    if (!looking) {
      return;
    }
    const now = Date.now();
    for (const connection of connectedKey === '' ? [] : connectedKey.split(',')) {
      if (isStale(known[connection], now)) {
        void readNames(connection as ConnectionId);
      }
    }
  }, [looking, connectedKey]);
  // The picture of a chart and the copy of the code are offered only once the window has them to give.
  const offered = offeredCommands(registeredCommands, state, state.app.platform).filter(
    (entry) => isChartOfferedNow(entry.id, state) && isCodeOfferedNow(entry.id, state),
  );
  const commands = offered.map((entry) => ({
    id: entry.id,
    title: entry.title,
    ...(entry.shownKey === undefined ? {} : { key: entry.shownKey }),
  }));
  const savedQueries = useSavedQueries(state);
  return { collections, commands, savedQueries };
}
