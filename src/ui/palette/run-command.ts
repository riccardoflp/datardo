/**
 * Runs a command in the window (`palette.run-command`), the same way for its key and for its row in Go to. The
 * commands that only change the window (open Go to, move the focus between islands, open the connection switcher,
 * open About, refresh or filter the tree) are carried out here; every other starts its feature through the bridge on what the user is looking at.
 */
import { intentOf } from '../../features/palette/run-command';
import type { Intent } from '../../shared/bridge';
import type { AppState } from '../../shared/state';
import { runActiveConsole } from '../pages/console/console-actions';
import { databasesArgs } from '../pages/keys/keys-path';
import { isValueCommand, runValueCommand } from '../pages/value/value-commands';
import { focusNextIsland } from '../shell/focus';
import { startIntent } from '../shell/top-bar/start';
import { isAggregateCommand, runAggregateCommand } from '../pages/aggregate/aggregate-commands';
import { isSavedQueryCommand, runSavedQueryCommand } from '../pages/saved-query/saved-query-commands';
import { queryCommandIds, runQueryCommand } from '../query/query-commands';
import { historyIntentOf, isDocumentCommand, runDocumentCommand } from '../pages/document/document-commands';
import { isFieldFeature, runFieldCommand } from '../pages/field/field-actions';
import { isSectionCommand, runSectionCommand } from '../pages/manage/section-commands';
import { isGridFsCommand, runGridFsCommand } from '../pages/gridfs/gridfs-commands';
import { isTableCommand, runTableCommand } from '../table/table-commands';
import { isUserCommand, runUserCommand } from '../pages/user/user-commands';
import { runTreeCommand } from '../tree/tree-commands';
import { openAbout } from '../window/about';
import { openGoTo } from './go-to-store';
import { flushPlaygrounds } from '../pages/playground/playground-store';
import { isPubSubCommand, runPubSubCommand } from '../pages/pubsub/pubsub-commands';

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
 * them (`key.switch-database`); **Document history** is on the selected row of a collection tab (`history.show`).
 */
function withWindowArgs(intent: Intent, state: AppState): Intent {
  if (intent.feature === 'history.show') {
    return historyIntentOf(state, intent) ?? intent;
  }
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
  if (isDocumentCommand(id)) {
    runDocumentCommand(id, state);
    return;
  }
  if (isValueCommand(id, state)) {
    runValueCommand(id, state);
    return;
  }
  // **Run console command** runs the lines of the active console's input, as `Enter` does (`console.input`).
  if (id === 'console.run' && runActiveConsole(state)) {
    return;
  }
  // Copying and exporting Pub/Sub messages take the rows the window has selected and shows.
  if (isPubSubCommand(id, state)) {
    runPubSubCommand(id, state);
    return;
  }
  if (isSavedQueryCommand(id)) {
    runSavedQueryCommand(id, state);
    return;
  }
  if (isFieldFeature(id)) {
    runFieldCommand(id, state);
    return;
  }
  if (isSectionCommand(id)) {
    runSectionCommand(id, state);
    return;
  }
  if (isGridFsCommand(id)) {
    runGridFsCommand(id, state);
    return;
  }
  if (isUserCommand(id)) {
    runUserCommand(id, state);
    return;
  }
  const local = windowOnly[id];
  if (local !== undefined) {
    local();
    return;
  }
  const intent = intentOf(state, id);
  if (intent !== undefined) {
    startIntent(withWindowArgs(intent, state));
  }
}
