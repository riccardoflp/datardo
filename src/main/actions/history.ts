/**
 * The actions of the document history area: the read of the page (`history.read-writes`), made in
 * `src/main/history-reads.ts` through the connections' clients.
 */
import type { AreaActions } from '.';
import { connectionEngines } from '../connections';
import { readHistory } from '../history-reads';

/** The actions of this area, by name. */
export const actions: AreaActions = (services) => ({
  'history.read': (args, signal) =>
    readHistory(
      {
        engines: connectionEngines,
        state: services.state,
        dataFolder: services.dataFolder,
        now: () => Date.now(),
        platform: services.platform,
      },
      args,
      signal,
    ),
});
