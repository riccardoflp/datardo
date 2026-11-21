/**
 * What each area does in the main process when Datardo starts, before the window opens: load its stored files, start
 * its timers. Each area that has something to do writes `start` in `src/main/<area>.ts`; a new one adds a line below.
 */
import type { MainServices } from './services';
import { start as startNav } from './nav';
import { start as startSettings } from './settings';
import { start as startCheckUpdate } from './check-update';
import { start as startConnections } from './connections';
import { start as startKnownHosts } from './known-hosts';
import { start as startTabs } from './tabs';
import { start as startPing } from './ping';
import { start as startPalette } from './palette';
import { start as startUndo } from './undo';
import { start as startOplog } from './oplog';
import { start as startTable } from './table';
import { start as startPlaygrounds } from './playgrounds';
import { start as startConsoles } from './consoles';
import { start as startSavedQueries } from './saved-queries';
import { start as startGridFs } from './gridfs';
import { start as startMcp } from './mcp';
import { start as startWatch } from './watch';
import { start as startPubSub } from './pubsub';
import { start as startSearch } from './search';
import { start as startRelations } from './relations';

/** What one area does at start. */
export type AreaStart = (services: MainServices) => Promise<void>;

/** The areas that do something at start, in this order. */
const starts: readonly AreaStart[] = [
  startSettings,
  startConnections,
  startUndo,
  startOplog,
  startKnownHosts,
  startNav,
  // Before the tabs are restored, so that the playground of each restored tab is loaded.
  startPlaygrounds,
  // Before the tabs are restored, so that each restored Watch changes tab gets its page.
  startWatch,
  startTabs,
  startPalette,
  startTable,
  startConsoles,
  startPubSub,
  startSavedQueries,
  startGridFs,
  startMcp,
  startSearch,
  startRelations,
  startPing,
  startCheckUpdate,
];

/** Starts every area, one after the other. */
export async function startAreas(services: MainServices): Promise<void> {
  for (const start of starts) {
    await start(services);
  }
}
