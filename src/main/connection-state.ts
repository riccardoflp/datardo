/**
 * The one store of each connection's `state/<connection id>.json` (data.md), opened the first time an area needs it
 * and shared by every area that keeps something there (the columns of the table, the history of the console), so that
 * no two stores write the same file. A connection removed forgets its store; its file is deleted by
 * `connection.remove`.
 */
import type { ConnectionId } from '../shared/ids';
import { connectionStateFile, type ConnectionStateFile } from '../storage/connection-state';
import { Store } from '../storage/store';
import type { MainServices } from './services';

const stores = new Map<ConnectionId, Promise<Store<ConnectionStateFile>>>();

function logLine(services: MainServices, text: string): void {
  services.state.dispatch({
    slice: 'runner',
    type: 'logged',
    lines: [{ time: Date.now(), source: 'Datardo', kind: 'info', text }],
  });
}

async function opened(services: MainServices, connection: ConnectionId): Promise<Store<ConnectionStateFile>> {
  const store = new Store(services.dataFolder, connectionStateFile(connection), (error) => {
    logLine(services, `What Datardo remembers of a connection could not be saved: ${String(error)}`);
  });
  try {
    const found = await store.load();
    if (found.kind === 'damaged') {
      logLine(services, `What Datardo remembers of a connection was set aside as ${found.setAsideAs}.`);
    }
  } catch (error: unknown) {
    logLine(services, `What Datardo remembers of a connection could not be read: ${String(error)}`);
  }
  services.onQuit(() => store.flush());
  return store;
}

/** The store of a connection's state file, read the first time it is needed. */
export function stateStoreOf(services: MainServices, connection: ConnectionId): Promise<Store<ConnectionStateFile>> {
  const known = stores.get(connection);
  if (known !== undefined) {
    return known;
  }
  const store = opened(services, connection);
  stores.set(connection, store);
  return store;
}

/** Forgets the store of a connection removed, so that nothing writes its file again. */
export function forgetStateStore(connection: ConnectionId): void {
  stores.delete(connection);
}
