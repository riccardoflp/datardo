/**
 * Feature: palette.commands
 *
 * The one list of what can be started from Go to or with a key: every command with its title, its keys on the
 * platform, the engine of its feature and where its keys work. Go to shows it after `>`, and `palette.key-press` reads
 * its keys. Keys cannot be changed in the first release: no setting and no file changes them.
 *
 * This module also declares the commands of the palette area (R2.3), which `src/features/commands.ts` gathers.
 */
import type { Platform } from '../../shared/feature';
import type { AppState } from '../../shared/state';
import type { ConnectionId } from '../../shared/ids';
import { activeTabOf, tabConnectionOf } from '../../shared/state/tabs';
import { isSamePin, pinOfTab } from '../nav/pin';
import { command, type Command, type CommandId } from '../command';
import { isCollapsed } from '../tab/collapse-group';
import { text as tabText } from '../tab/text';
import { fullScreenTitle } from '../window/full-screen';
import { text as navText } from '../nav/text';
import { exclusionTitle } from '../tree/commands';
import { toggleTitle } from '../table/toggle-formatting';
import { text } from './text';

/** The commands of the palette area, each on the Commands line of its card (R2.3). */
export const areaCommands: readonly Command[] = [
  command('palette.open', text.commands.open, 'Ctrl+K'),
  command('palette.open:commands', text.commands.openCommands, 'Ctrl+Shift+P'),
  command('palette.open:tabs', text.commands.openTabs),
];

/** The engine of a command's feature. */
export type CommandEngine = 'any' | 'mongodb' | 'redis';

/** A command as the list gives it. */
export interface CommandEntry {
  readonly id: CommandId;
  /** The title that applies now: **Hide explorer** while the explorer is shown. */
  readonly title: string;
  /** Its keys on the platform, as the cards write them (`Cmd+K` on macOS); none when it has no key. */
  readonly keys: readonly string[];
  /** The first key as it is shown: `Ctrl+K`, or the system's signs on macOS (`⌘K`). */
  readonly shownKey?: string;
  readonly engine: CommandEngine;
  /** Every key of this list is a key of the window: it works wherever the focus is. */
  readonly scope: 'window';
}

/** The areas of MongoDB and of Redis (feature-contract.md, "Areas"); every other area is for every engine. */
const areaEngines: Readonly<Record<string, CommandEngine>> = Object.fromEntries<CommandEngine>([
  ...[
    'query',
    'table',
    'aggregate',
    'saved-query',
    'document',
    'field',
    'history',
    'manage',
    'schema',
    'chart',
    'explain',
    'codegen',
    'index',
    'advisor',
    'search',
    'relation',
    'playground',
    'monitor',
    'user',
    'gridfs',
    'watch',
    'transfer',
    'backup',
    'compare',
    'structure',
    'oplog',
  ].map((area): [string, CommandEngine] => [area, 'mongodb']),
  ...['key', 'value', 'console', 'pubsub', 'server'].map((area): [string, CommandEngine] => [area, 'redis']),
]);

/** The engine of a command, from the area of its feature. */
export function engineOf(id: string): CommandEngine {
  return areaEngines[id.split('.')[0] ?? ''] ?? 'any';
}

/** The second keys the table of the card gives beside a command's own (Windows and Linux). */
const secondKeys: Readonly<Record<string, readonly string[]>> = {
  'tab.activate:next': ['Ctrl+PageDown'],
  'tab.activate:previous': ['Ctrl+PageUp'],
  'window.zoom:in': ['Ctrl++'],
};

/** The keys of macOS that are not the key with `Cmd` in the place of `Ctrl` (the last column of the card's table). */
const macKeys: Readonly<Record<string, readonly string[]>> = {
  'home.show': ['Cmd+Shift+H'],
  'nav.back:back': ['Cmd+['],
  'nav.back:forward': ['Cmd+]'],
  'tab.activate:next': ['Ctrl+Tab', 'Cmd+Option+Right'],
  'tab.activate:previous': ['Ctrl+Shift+Tab', 'Cmd+Option+Left'],
  'tab.reorder:left': ['Cmd+Shift+Option+Left'],
  'tab.reorder:right': ['Cmd+Shift+Option+Right'],
  'window.zoom:in': ['Cmd+=', 'Cmd++'],
  'window.full-screen': ['Ctrl+Cmd+F'],
};

/** A key of Windows written for macOS: `Cmd` in the place of `Ctrl`, `Option` in the place of `Alt`. */
function forMac(key: string): string {
  return key
    .split(/\+(?=.)/u)
    .map((part) => (part === 'Ctrl' ? 'Cmd' : part === 'Alt' ? 'Option' : part))
    .join('+');
}

/** The keys of a command on a platform. */
export function keysOf(registered: Command, platform: Platform): readonly string[] {
  if (registered.key === undefined) {
    return [];
  }
  const own = [registered.key, ...(secondKeys[registered.id] ?? [])];
  return platform === 'macos' ? (macKeys[registered.id] ?? own.map(forMac)) : own;
}

const macSigns: Readonly<Record<string, string>> = { Ctrl: '⌃', Option: '⌥', Shift: '⇧', Cmd: '⌘' };
const macOrder = ['Ctrl', 'Option', 'Shift', 'Cmd'];
const macKeyNames: Readonly<Record<string, string>> = { Left: '←', Right: '→', Up: '↑', Down: '↓' };

/** A key as it is shown: as written on Windows and Linux; with the system's signs on macOS (`⇧⌘P`). */
export function shownKeyOf(key: string, platform: Platform): string {
  if (platform !== 'macos') {
    return key;
  }
  const parts = key.split(/\+(?=.)/u);
  const last = parts.pop() ?? '';
  const signs = macOrder.filter((part) => parts.includes(part)).map((part) => macSigns[part] ?? part);
  return `${signs.join('')}${macKeyNames[last] ?? last}`;
}

/** The pin of the active tab, and whether it is pinned, when the active tab can be pinned. */
export function activePin(
  state: AppState,
): { readonly pinned: boolean; readonly connection: ConnectionId } | undefined {
  const active = activeTabOf(state.tabs);
  const pin = active === undefined ? undefined : pinOfTab(active.shows);
  if (active === undefined || pin === undefined || active.shows.kind === 'app') {
    return undefined;
  }
  const connection = active.shows.connection;
  return { pinned: (state.nav.pins[connection] ?? []).some((each) => isSamePin(each, pin)), connection };
}

/** The title of a command that switches between two states, for the state the window is in now. */
function titleNow(registered: Command, state: AppState | undefined): string {
  if (state === undefined) {
    return registered.title;
  }
  switch (registered.id) {
    case 'nav.toggle-explorer':
      return state.nav.explorerHidden ? navText.commands.showExplorer : navText.commands.hideExplorer;
    case 'nav.toggle-inspector':
      return state.nav.inspectorHidden ? navText.commands.showInspector : navText.commands.hideInspector;
    case 'table.toggle-formatting':
      return toggleTitle(state.table.formatting.hidden);
    case 'window.full-screen':
      return fullScreenTitle(state.window);
    case 'nav.pin':
      return activePin(state)?.pinned === true ? tabText.menu.unpin : tabText.menu.pin;
    case 'tree.exclude-from-searches':
      return exclusionTitle(state);
    case 'tab.collapse-group': {
      const active = activeTabOf(state.tabs);
      const connection = active === undefined ? undefined : tabConnectionOf(active);
      return connection !== undefined && isCollapsed(state, connection)
        ? tabText.menu.expandGroup
        : tabText.menu.collapseGroup;
    }
    default:
      return registered.title;
  }
}

/**
 * Every command, with the title that applies in `state` (or its registered title without one), its keys on the
 * platform and the engine of its feature, in the order the features are given.
 */
export function commands(features: readonly Command[], platform: Platform, state?: AppState): readonly CommandEntry[] {
  return features.map((registered) => {
    const keys = keysOf(registered, platform);
    const [first] = keys;
    return {
      id: registered.id,
      title: titleNow(registered, state),
      keys,
      ...(first === undefined ? {} : { shownKey: shownKeyOf(first, platform) }),
      engine: engineOf(registered.id),
      scope: 'window',
    };
  });
}
