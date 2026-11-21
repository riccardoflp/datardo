/**
 * `state/<connection id>.json` in the main process: one store for each connection's file, opened the first time an
 * area needs it and shared by every area that keeps something there (the columns of `table.columns`, the recent
 * queries of `saved-query.recent`, the playgrounds' databases, the console's history), so that one never writes over what another set. A connection removed forgets its
 * store. It imports nothing of Electron, so that the tests read it.
 */
import type { ConnectionId } from '../shared/ids';
import { connectionStateFile, type ConnectionStateFile } from '../storage/connection-state';
import { Store } from '../storage/store';
import type { MainServices } from './services';

/** What opening a connection's file needs: the data folder, a line of the Log, and saving at quit. */
export interface ConnectionStateServices {
  readonly dataFolder: string;
  readonly onQuit: (flush: () => Promise<void>) => void;
  readonly log: (text: string) => void;
}

/** The store of each connection's state file, by data folder and connection. */
const stores = new Map<string, Promise<Store<ConnectionStateFile>>>();

function keyOf(dataFolder: string, connection: ConnectionId): string {
  return `${dataFolder}\u0000${connection}`;
}

async function opened(
  services: ConnectionStateServices,
  connection: ConnectionId,
): Promise<Store<ConnectionStateFile>> {
  const store = new Store(services.dataFolder, connectionStateFile(connection), (error) => {
    services.log(`What Datardo remembers of a connection could not be saved: ${String(error)}`);
  });
  try {
    const found = await store.load();
    if (found.kind === 'damaged') {
      services.log(`What Datardo remembers of a connection was set aside as ${found.setAsideAs}.`);
    }
  } catch (error: unknown) {
    services.log(`What Datardo remembers of a connection could not be read: ${String(error)}`);
  }
  services.onQuit(() => store.flush());
  return store;
}

/** The store of a connection's state file, read the first time it is needed. */
export function connectionStateStore(
  services: ConnectionStateServices,
  connection: ConnectionId,
): Promise<Store<ConnectionStateFile>> {
  const key = keyOf(services.dataFolder, connection);
  const known = stores.get(key);
  if (known !== undefined) {
    return known;
  }
  const store = opened(services, connection);
  stores.set(key, store);
  return store;
}

/** Forgets the store of a connection removed: its file is deleted, and a new one starts empty. */
export function forgetConnectionState(dataFolder: string, connection: ConnectionId): void {
  stores.delete(keyOf(dataFolder, connection));
}

/** The store of a connection's state file for an area of the main process, which writes what fails in the Log. */
export function stateStoreOf(services: MainServices, connection: ConnectionId): Promise<Store<ConnectionStateFile>> {
  return connectionStateStore(
    {
      dataFolder: services.dataFolder,
      onQuit: services.onQuit,
      log: (text) => {
        services.state.dispatch({
          slice: 'runner',
          type: 'logged',
          lines: [{ time: Date.now(), source: 'Datardo', kind: 'info', text }],
        });
      },
    },
    connection,
  );
}
