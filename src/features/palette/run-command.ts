/**
 * Feature: palette.run-command
 *
 * Starts the feature of a command on what the user is looking at: the current connection, the active tab and what is
 * selected in it. A command started with a key and one started from Go to do exactly the same. A command is listed,
 * and its key works, when its feature is for every engine or for the engine of the current connection, and when its
 * own card offers it now.
 */
import type { Intent } from '../../shared/bridge';
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
import { canGo } from '../nav/back';
import { isOffered as isCopyPathOffered } from '../nav/copy-path';
import { pinOfTab } from '../nav/pin';
import { isOffered as isInspectorOffered } from '../nav/toggle-inspector';
import { appPlan, appStep, navInput, startArgs } from '../nav/types';
import { isOffered as isResetOffered } from '../settings/reset';
import { isOffered as isCloseOffered } from '../tab/close';
import { isOffered as isReopenOffered } from '../tab/reopen';
import { isVariantOffered } from '../undo/per-connection';
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

/** The engine of the current connection, when there is one. */
function currentEngine(state: AppState): 'mongodb' | 'redis' | undefined {
  const current = state.nav.current;
  return current === undefined ? undefined : savedConnection(state.connections, current)?.engine;
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

/** What a command's own card says of whether it is offered now. */
function isOfferedByItsCard(state: AppState, id: string): boolean {
  const active = activeTabOf(state.tabs);
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
    case 'query.bar':
    case 'query.run':
    case 'query.reset':
    case 'query.mode:find':
    case 'query.builder':
      // The query bar is a collection tab's: with none active, there is no query.
      return active?.shows.kind === 'collection';
    case 'query.mode:aggregate':
    case 'aggregate.add-stage':
    case 'aggregate.move-stage:left':
    case 'aggregate.move-stage:right':
    case 'aggregate.clear':
    case 'aggregate.edit-as-text:text':
    case 'aggregate.edit-as-text:stages':
    case 'aggregate.copy':
    case 'aggregate.run':
    case 'aggregate.save-as-view':
      // The pipeline editor is a collection tab's; a command of it shows the editor first when Find is shown.
      return active?.shows.kind === 'collection';
    case 'document.inspect':
    case 'document.open':
    case 'document.inline-edit':
    case 'document.insert':
    case 'document.duplicate':
    case 'document.delete':
    case 'document.update-many':
    case 'document.delete-many':
      // They act on the selected row, or on the collection, of the active collection tab.
      return active?.shows.kind === 'collection';
    case 'document.save':
      // A document tab of an existing document, with unsaved changes.
      return active?.shows.kind === 'document' && active.shows.newDocument === undefined && active.unsaved === true;
    case 'tree.refresh':
    case 'tree.filter':
      // The tree island shows the current connection: with none, there is nothing to refresh or filter.
      return state.nav.current !== undefined;
    default:
      // The commands of the table act on the active collection tab: with none, there is no table.
      return id.startsWith('table.') ? active?.shows.kind === 'collection' : isWindowCommandOffered(state, id);
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
    (isTransferOffered(state, id) ?? isOfferedByItsCard(state, id))
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

/** What a command is started on: the active tab, else the current connection, else the app. */
export function targetNow(state: AppState): Target {
  const active = activeTabOf(state.tabs);
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
  // A backup and a restore from Go to are of the current connection, whatever tab is active (`backup.create`).
  const onConnection = feature === 'undo.per-connection' || feature === 'backup.create' || feature === 'backup.restore';
  const target: Target =
    onConnection && current !== undefined ? { kind: 'connection', connection: current } : targetNow(state);
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
