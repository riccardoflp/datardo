/**
 * Runs a command in the window (`palette.run-command`), the same way for its key and for its row in Go to. The
 * commands that only change the window (open Go to, move the focus between islands, open the connection switcher,
 * open About, refresh or filter the tree) are carried out here; every other starts its feature through the bridge on what the user is looking at.
 */
import { intentOf } from '../../features/palette/run-command';
import type { Intent } from '../../shared/bridge';
import type { AppState } from '../../shared/state';
import { databasesArgs } from '../pages/keys/keys-path';
import { focusNextIsland } from '../shell/focus';
import { startIntent } from '../shell/top-bar/start';
import { isAggregateCommand, runAggregateCommand } from '../pages/aggregate/aggregate-commands';
import { queryCommandIds, runQueryCommand } from '../query/query-commands';
import { isTableCommand, runTableCommand } from '../table/table-commands';
import { runTreeCommand } from '../tree/tree-commands';
import { openAbout } from '../window/about';
import { openGoTo } from './go-to-store';
import { flushPlaygrounds } from '../pages/playground/playground-store';

let switcherOpener: (() => void) | undefined;

/** The connection switcher's opener, which the islands give while they are shown. */
export function setSwitcherOpener(open: (() => void) | undefined): void {
  switcherOpener = open;
}

/** The commands carried out by the window alone. */
const windowOnly: Readonly<Record<string, () => void>> = {
  'palette.open': () => {
    openGoTo('');
  },
  'palette.open:commands': () => {
    openGoTo('>');
  },
  'palette.open:tabs': () => {
    openGoTo('=');
  },
  'nav.focus-island:next': () => {
    focusNextIsland('next');
  },
  'nav.focus-island:previous': () => {
    focusNextIsland('previous');
  },
  'nav.switch-connection': () => {
    switcherOpener?.();
  },
  'window.about': openAbout,
};

/**
 * What only the window knows, added to an intent: **Switch database…** lists the databases as the tree last read
 * them (`key.switch-database`).
 */
function withWindowArgs(intent: Intent): Intent {
  const target = intent.target;
  if (intent.feature !== 'key.switch-database' || target.kind !== 'redis-database') {
    return intent;
  }
  const databases = databasesArgs(target.connection);
  return databases === undefined ? intent : { ...intent, args: { databases } };
}

/** Runs a command now; a command not offered in this state does nothing. */
export function runCommand(id: string, state: AppState): void {
  // A command of a playground reads its text in the main process: what the editor has not sent yet goes first.
  flushPlaygrounds();
  if (id === 'tree.refresh' || id === 'tree.filter') {
    runTreeCommand(id, state);
    return;
  }
  if (queryCommandIds.has(id)) {
    runQueryCommand(id, state);
    return;
  }
  if (isTableCommand(id)) {
    runTableCommand(id, state);
    return;
  }
  if (isAggregateCommand(id)) {
    runAggregateCommand(id, state);
    return;
  }
  const local = windowOnly[id];
  if (local !== undefined) {
    local();
    return;
  }
  const intent = intentOf(state, id);
  if (intent !== undefined) {
    startIntent(withWindowArgs(intent));
  }
}
