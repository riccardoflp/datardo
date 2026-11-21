/**
 * Feature: palette.run-command
 *
 * Starts the feature of a command on what the user is looking at: the current connection, the active tab and what is
 * selected in it. A command started with a key and one started from Go to do exactly the same. A command is listed,
 * and its key works, when its feature is for every engine or for the engine of the current connection, and when its
 * own card offers it now.
 */
import type { Intent } from '../../shared/bridge';
import type { ConnectionView } from '../../shared/connection';
import type { Json } from '../../shared/engine-request';
import {
  run,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
  type Platform,
} from '../../shared/feature';
import { featureId, type ConnectionId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { savedConnection } from '../../shared/state/connections';
import { activeTabOf, type TabShows } from '../../shared/state/tabs';
import type { Target } from '../../shared/target';
import type { Command } from '../command';
import { commands as registeredCommands } from '../commands';
import { isOffered as isFieldOffered } from '../field/commands';
import { isOffered as isIndexOffered } from '../index/commands';
import { isOffered as isSchemaOffered } from '../schema/commands';
import { isOffered as isExplainOffered } from '../explain/commands';
import { isOffered as isMonitorOffered } from '../monitor/commands';
import { isOffered as isAdvisorOffered } from '../advisor/commands';
import { isOffered as isManageOffered } from '../manage/commands';
import { isGridFsCommandOffered } from '../gridfs/commands';
import { isOffered as isUserOffered } from '../user/commands';
import { canGo } from '../nav/back';
import { isOffered as isCopyPathOffered } from '../nav/copy-path';
import { pinOfTab } from '../nav/pin';
import { isOffered as isInspectorOffered } from '../nav/toggle-inspector';
import { appPlan, appStep, navInput, startArgs } from '../nav/types';
import { isOffered as isResetOffered } from '../settings/reset';
import { isOffered as isCloseOffered } from '../tab/close';
import { isOffered as isReopenOffered } from '../tab/reopen';
import { isVariantOffered } from '../undo/per-connection';
import { bytesOfHex, nameOfText } from '../key/types';
import { isWindowCommandOffered } from '../window/app-menu';
import { activePin, commands, engineOf, type CommandEntry } from './commands';
import { text } from './text';

/** The commands whose key keeps acting while it is held down; every other ignores the keyboard's repeats. */
export const repeatedCommands: ReadonlySet<string> = new Set([
  'tab.activate:next',
  'tab.activate:previous',
  'nav.back:back',
  'nav.back:forward',
  'window.zoom:in',
  'window.zoom:out',
]);

/** Whether a command keeps acting while its key is held down. */
export function isRepeated(id: string): boolean {
  return repeatedCommands.has(id);
}

/** The current connection, when there is one. */
function currentConnectionOf(state: AppState): ConnectionView | undefined {
  const current = state.nav.current;
  return current === undefined ? undefined : savedConnection(state.connections, current);
}

/** The engine of the current connection, when there is one. */
function currentEngine(state: AppState): 'mongodb' | 'redis' | undefined {
  return currentConnectionOf(state)?.engine;
}

/**
 * **Stop keeping undo history** and **Keep undo history** for the current connection: the one that changes it, and
 * both on a read-only connection, whose refusal says why nothing is recorded through it.
 */
function isKeepUndoOffered(state: AppState, variant: 'stop' | 'keep'): boolean {
  const current = state.nav.current;
  const connection = current === undefined ? undefined : savedConnection(state.connections, current);
  return connection !== undefined && (connection.readOnly || isVariantOffered(connection, variant));
}

/**
 * The commands of a collection tab: the query bar's; the pipeline editor's, which shows the editor first when Find is
 * shown; the document commands, which act on the selected row or on the collection; and the queries of the query bar.
 * With no collection tab active, there is nothing for them to act on.
 */
const collectionTabCommands: ReadonlySet<string> = new Set([
  'query.bar',
  'query.run',
  'query.reset',
  'query.mode:find',
  'query.builder',
  'query.mode:aggregate',
  'aggregate.add-stage',
  'aggregate.move-stage:left',
  'aggregate.move-stage:right',
  'aggregate.clear',
  'aggregate.edit-as-text:text',
  'aggregate.edit-as-text:stages',
  'aggregate.copy',
  'aggregate.run',
  'aggregate.save-as-view',
  'document.inspect',
  'document.open',
  'document.inline-edit',
  'document.insert',
  'document.duplicate',
  'document.delete',
  'document.update-many',
  'document.delete-many',
  'saved-query.show',
  'saved-query.save',
  'saved-query.save:folder',
  'saved-query.clear-recent',
]);
/**
 * **Compare with…** acts on the collection of the active tab; **Compare structure with…** on its database, that of a
 * collection tab or of a page of a database.
 */
function isCompareOffered(state: AppState, id: string): boolean {
  const shows = activeTabOf(state.tabs)?.shows;
  return id === 'compare.show'
    ? shows?.kind === 'collection'
    : shows?.kind === 'collection' || (shows?.kind === 'page' && shows.database !== undefined);
}

/** What the cards of an area that decides for its commands say of whether one is offered now; `undefined` for others. */
function isOfferedByItsArea(state: AppState, id: string): boolean | undefined {
  if (id.startsWith('manage.')) {
    return isManageOffered(state, id);
  }
  if (id.startsWith('user.')) {
    return isUserOffered(state, id);
  }
  if (id.startsWith('index.')) {
    return isIndexOffered(state, id);
  }
  if (id === 'compare.show' || id === 'structure.show') {
    return isCompareOffered(state, id);
  }
  if (id.startsWith('schema.') || id.startsWith('explain.')) {
    return id.startsWith('schema.') ? isSchemaOffered(state, id) : isExplainOffered(state);
  }
  if (id.startsWith('monitor.') || id.startsWith('advisor.')) {
    return id.startsWith('monitor.') ? isMonitorOffered(state, id) : isAdvisorOffered(state, id);
  }
  return id.startsWith('field.') ? isFieldOffered(state) : undefined;
}

/** Whether a command of an area that decides it alone is offered now: those of GridFS, and of the window. */
function isOfferedOtherwise(state: AppState, id: string): boolean {
  return id.startsWith('gridfs.') ? isGridFsCommandOffered(state, id) : isWindowCommandOffered(state, id);
}

/** What a command's own card says of whether it is offered now. */
function isOfferedByItsCard(state: AppState, id: string): boolean {
  const active = activeTabOf(state.tabs);
  if (collectionTabCommands.has(id)) {
    return active?.shows.kind === 'collection';
  }
  switch (id) {
    case 'nav.back:back':
      return canGo(navInput(state), 'back');
    case 'nav.back:forward':
      return canGo(navInput(state), 'forward');
    case 'nav.toggle-inspector':
      return isInspectorOffered(navInput(state));
    case 'nav.copy-path':
      return active !== undefined && isCopyPathOffered(active.shows);
    case 'nav.pin':
      return activePin(state) !== undefined;
    case 'tab.reopen':
      return isReopenOffered(state);
    case 'tab.close':
      return active !== undefined && isCloseOffered(state, active);
    case 'settings.reset':
      return isResetOffered(state.settings);
    case 'undo.per-connection:stop':
      return isKeepUndoOffered(state, 'stop');
    case 'undo.per-connection:keep':
      return isKeepUndoOffered(state, 'keep');
    case 'document.save':
      // A document tab of an existing document, with unsaved changes.
      return active?.shows.kind === 'document' && active.shows.newDocument === undefined && active.unsaved === true;
    case 'saved-query.choose-folder':
    case 'tree.refresh':
    case 'tree.filter':
      // The tree island shows the current connection: with none, there is nothing to refresh or filter.
      return state.nav.current !== undefined;
    case 'server.largest-keys':
      // The search is the Memory section's: it is offered while the Server page is the active tab.
      return active?.shows.kind === 'page' && active.shows.page === 'server';
    case 'search.show':
      // The page of the current connection, which the engine of the area already makes a MongoDB one.
      return state.nav.current !== undefined;
    case 'relation.diagram':
      // The diagram of the database of the active tab: a database must be known.
      return 'database' in targetNow(state);
    case 'relation.open-referenced':
      // The reference of the selected cell of the table: the table says when there is none.
      return active?.shows.kind === 'collection';
    case 'server.slow-log-reset':
      return currentConnectionOf(state)?.readOnly === false;
    default:
      // The commands of the table act on the active collection tab: with none, there is no table. Those of values act
      // on the value of the active key tab.
      if (id.startsWith('value.')) {
        return active?.shows.kind === 'key';
      }
      return id.startsWith('table.') ? active?.shows.kind === 'collection' : isOfferedOtherwise(state, id);
  }
}

/** The commands of export, import, copy and backups; `undefined` for another command. */
function isTransferOffered(state: AppState, id: string): boolean | undefined {
  switch (id) {
    case 'transfer.export':
    case 'transfer.import':
    case 'transfer.copy-collection':
    case 'transfer.generate':
      // They act on the collection of the active collection tab.
      return activeTabOf(state.tabs)?.shows.kind === 'collection';
    case 'backup.create':
    case 'backup.restore':
      // They act on the current connection.
      return state.nav.current !== undefined;
    default:
      return undefined;
  }
}

/** Whether a command is offered now: for every engine or the current connection's, and offered by its card. */
export function isOffered(state: AppState, id: string): boolean {
  const engine = engineOf(id);
  return (
    (engine === 'any' || engine === currentEngine(state)) &&
    (isOfferedByItsArea(state, id) ?? isTransferOffered(state, id) ?? isOfferedByItsCard(state, id))
  );
}

/** The commands Go to lists after `>`, with the title that applies now, in the order they are registered. */
export function offeredCommands(
  registered: readonly Command[],
  state: AppState,
  platform: Platform,
): readonly CommandEntry[] {
  return commands(registered, platform, state).filter((entry) => isOffered(state, entry.id));
}

/** What a tab shows, as the target of a feature started on it. */
function targetOfShows(shows: TabShows, current: ConnectionId | undefined): Target {
  switch (shows.kind) {
    case 'app':
      return current === undefined ? { kind: 'app' } : { kind: 'connection', connection: current };
    case 'collection':
    case 'document':
      return {
        kind: 'collection',
        connection: shows.connection,
        database: shows.database,
        collection: shows.collection,
      };
    case 'keys':
    case 'key':
      return { kind: 'redis-database', connection: shows.connection, database: shows.database };
    case 'page':
      return shows.database === undefined
        ? { kind: 'connection', connection: shows.connection }
        : { kind: 'database', connection: shows.connection, database: shows.database };
    case 'playground':
    case 'console':
      return { kind: 'connection', connection: shows.connection };
  }
}

/** The key a key tab shows, as the target of the features of values; none for another tab. */
function keyTargetOf(shows: TabShows): Target | undefined {
  if (shows.kind !== 'key') {
    return undefined;
  }
  const key = shows.keyHex === undefined ? nameOfText(shows.key) : bytesOfHex(shows.keyHex);
  return key === undefined ? undefined : { kind: 'key', connection: shows.connection, database: shows.database, key };
}

/** What a command is started on: the active tab, else the current connection, else the app. */
export function targetNow(state: AppState, feature = ''): Target {
  const active = activeTabOf(state.tabs);
  const key = active === undefined || !feature.startsWith('value.') ? undefined : keyTargetOf(active.shows);
  if (key !== undefined) {
    return key;
  }
  if (active !== undefined) {
    return targetOfShows(active.shows, state.nav.current);
  }
  return state.nav.current === undefined ? { kind: 'app' } : { kind: 'connection', connection: state.nav.current };
}

/** The arguments of a variant, for the features that take them as an object rather than as the variant itself. */
function argsOf(state: AppState, feature: string, variant: string | undefined): Json | undefined {
  if (feature === 'nav.back') {
    return { direction: variant === 'forward' ? 'forward' : 'back' };
  }
  if (feature === 'nav.resize' && variant === 'reset') {
    return { reset: true };
  }
  if (feature === 'nav.pin') {
    const active = activeTabOf(state.tabs);
    const pin = active === undefined ? undefined : pinOfTab(active.shows);
    const found = activePin(state);
    return pin === undefined || found === undefined
      ? undefined
      : { pin: pin as unknown as Json, connection: found.connection, action: found.pinned ? 'unpin' : 'pin' };
  }
  return variant;
}

/**
 * The intent a command sends: its feature, started on what the user is looking at, with its variant as the
 * arguments; `undefined` when it is not offered now, in which case its key does nothing.
 */
export function intentOf(state: AppState, id: string): Intent | undefined {
  if (!isOffered(state, id)) {
    return undefined;
  }
  const [feature = id, variant] = id.split(':');
  const args = argsOf(state, feature, variant);
  // The undo history of a connection is the current connection's, whatever tab is active (`undo.per-connection`).
  const current = state.nav.current;
  // A backup and a restore from Go to are of the current connection, whatever tab is active (`backup.create`), and
  // so is the Index advisor (`advisor.show`, "Entry points").
  const onConnection =
    feature === 'undo.per-connection' ||
    feature === 'backup.create' ||
    feature === 'backup.restore' ||
    feature === 'advisor.show';
  const target: Target =
    onConnection && current !== undefined ? { kind: 'connection', connection: current } : targetNow(state, feature);
  return { feature: featureId(feature), target, ...(args === undefined ? {} : { args }) };
}

/** The command asked for: `args.command`. */
function commandAsked(answers: Answers): string | undefined {
  const asked = startArgs(answers)['command'];
  return typeof asked === 'string' ? asked : undefined;
}

/**
 * Runs the command `args.command`: one app step that starts its feature, as its key would; nothing when it is not
 * offered now.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const id = commandAsked(answers);
  const intent = id === undefined ? undefined : intentOf(context.state, id);
  if (id === undefined || intent === undefined) {
    return run(appPlan(text.plans.openResult, []));
  }
  const registered = registeredCommands.filter((each) => each.id === id);
  const title = commands(registered, context.platform, context.state)[0]?.title ?? id;
  const step = appStep(text.steps.runCommand(title), 'palette.run-command', JSON.parse(JSON.stringify(intent)) as Json);
  return run(appPlan(text.plans.runCommand(title), [step]));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('palette.run-command'), plan };
