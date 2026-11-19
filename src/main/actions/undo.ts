/**
 * The actions of the undo history (`undo.*`, `connection.set-keeps-undo`), given the main process's pieces: the
 * clients of the connections, `undo/index.json`, and `connection.connect` for an undo on a connection that is not
 * connected. What each does is in `src/main/undo-actions.ts`.
 */
import type { AreaActions } from '.';
import { start as startFeature } from '../../runner/start';
import { featureId } from '../../shared/ids';
import type { UndoEntry } from '../../shared/state/undo';
import { whenRunnerReady } from '../bridge';
import { connectionEngines, findConnection, isConnected, writeConnection } from '../connections';
import { indexFound, writeEntries } from '../undo';
import { undoActions } from '../undo-actions';

/** An undo connects first a connection that is not connected (`undo.revert`, `connection.connect`). */
async function connectFirst(entry: UndoEntry): Promise<void> {
  if (isConnected(entry.connection)) {
    return;
  }
  const ports = await whenRunnerReady();
  const result = await startFeature(ports, {
    feature: featureId('connection.connect'),
    target: { kind: 'connection', connection: entry.connection },
  });
  if (result.kind === 'failed' || result.kind === 'refused') {
    throw new Error(result.message);
  }
}

/** The actions of this area, by name. */
export const actions: AreaActions = (services) =>
  undoActions({
    state: services.state,
    dataFolder: services.dataFolder,
    engines: connectionEngines,
    writeEntries,
    indexFound,
    connectFirst,
    findConnection,
    writeConnection,
  });
