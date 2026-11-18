/**
 * Feature: window.app-menu
 *
 * On macOS the system's menu bar stays, with the commands a Mac user looks for there. Each entry that is not the
 * system's own is one command of Go to, with its title and its key.
 */
import type { Intent } from '../../shared/bridge';
import type { Json } from '../../shared/engine-request';
import { featureId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { appTarget } from '../../shared/target';
import { product, type Product } from '../../shared/product';
import { commands as allCommands, type Command } from '../commands';
import { isSizeOffered, type SizeVariant } from './size';
import { themeChoice, themeNames } from './theme';
import { isZoomOffered, zoomInUse, type ZoomVariant } from './zoom';
import { fullScreenTitle } from './full-screen';
import { appName, windowText } from './text';

/** The intent a command sends: the feature before `:`, the variant after it as the intent's arguments. */
export function commandIntent(id: string, place?: Intent['place']): Intent {
  const [feature = id, variant] = id.split(':');
  return {
    feature: featureId(feature),
    target: appTarget,
    ...(place === undefined ? {} : { place }),
    ...(variant === undefined ? {} : { args: variant }),
  };
}

/** Whether a command of the window area is offered now; the commands of other areas say so on their own cards. */
export function isWindowCommandOffered(state: AppState, id: string): boolean {
  const [feature, variant = ''] = id.split(':');
  if (feature === 'window.zoom') {
    return isZoomOffered(zoomInUse(state.settings), variant as ZoomVariant);
  }
  if (feature === 'window.size') {
    return isSizeOffered(state.window, variant as SizeVariant);
  }
  return true;
}

/** An entry of a menu: a command, a system role, a separator or a submenu. */
export type MenuEntry =
  | {
      readonly kind: 'command';
      readonly title: string;
      /** The key as the cards write it (`Ctrl+K`); the main process writes it as macOS does. */
      readonly key?: string;
      /** The control's identifier; none while the card of its command does not list the menu bar among its places. */
      readonly element?: string;
      readonly intent: Intent;
      readonly enabled: boolean;
      readonly checked?: boolean;
    }
  | {
      readonly kind: 'role';
      readonly role: string;
      /** The control's identifier, for a system entry whose feature's card lists the menu bar among its places. */
      readonly element?: string;
    }
  | { readonly kind: 'separator' }
  | { readonly kind: 'submenu'; readonly title: string; readonly entries: readonly MenuEntry[] };

/** One menu of the bar. */
export interface Menu {
  /** The identifier of the menus of the bar, which this feature draws. */
  readonly element: 'window.app-menu@app-menu';
  readonly title: string;
  readonly entries: readonly MenuEntry[];
  /** Whether its entries stay enabled while a dialog is open (Datardo, Edit, Window). */
  readonly whileDialog: boolean;
}

/** What one entry is made of: its command, the identifier of its control, and what to show while it is unregistered. */
interface EntrySpec {
  readonly command: string;
  readonly element?: string;
  readonly title: string;
  readonly key?: string;
  readonly args?: Json;
  readonly checked?: boolean;
  /** A title that wins over the command's: the theme's name in its submenu, a title that changes with the state. */
  readonly shownTitle?: string;
  /** A key that wins over the command's: macOS's own key for full screen. */
  readonly shownKey?: string;
}

const separator: MenuEntry = { kind: 'separator' };

function role(name: string, element?: string): MenuEntry {
  return { kind: 'role', role: name, ...(element === undefined ? {} : { element }) };
}

/** A menu of the bar, with the identifier every menu of the bar carries. */
function menu(title: string, whileDialog: boolean, entries: readonly MenuEntry[]): Menu {
  return { element: 'window.app-menu@app-menu', title, whileDialog, entries };
}

/** The menus as they are now. */
interface Now {
  readonly state: AppState;
  readonly registered: ReadonlyMap<string, Command>;
  readonly dialogOpen: boolean;
}

function entry(now: Now, spec: EntrySpec, whileDialog: boolean): MenuEntry {
  const command = now.registered.get(spec.command);
  const offered = command !== undefined && isWindowCommandOffered(now.state, spec.command);
  const intent = commandIntent(spec.command, 'app-menu');
  const key = spec.shownKey ?? command?.key ?? spec.key;
  return {
    kind: 'command',
    title: spec.shownTitle ?? command?.title ?? spec.title,
    ...(key === undefined ? {} : { key }),
    ...(spec.element === undefined ? {} : { element: spec.element }),
    intent: spec.args === undefined ? intent : { ...intent, args: spec.args },
    enabled: offered && (whileDialog || !now.dialogOpen),
    ...(spec.checked === undefined ? {} : { checked: spec.checked }),
  };
}

function appMenu(now: Now): Menu {
  return menu(appName, true, [
    entry(now, { command: 'window.about', element: 'window.about@app-menu', title: windowText.aboutTitle }, true),
    separator,
    entry(now, { command: 'settings.page', element: 'settings.page@app-menu', title: 'Settings…' }, true),
    separator,
    role('services'),
    separator,
    role('hide'),
    role('hideOthers'),
    role('unhide'),
    separator,
    entry(now, { command: 'window.quit', element: 'window.quit@app-menu', title: windowText.quitTitle }, true),
  ]);
}

function fileMenu(now: Now): Menu {
  return menu('File', false, [
    // The cards of connection.add, playground.open, nav.switch-connection and tab.activate do not list the menu bar
    // among their places yet: their entries have no element.
    entry(now, { command: 'connection.add', title: 'Add connection…' }, false),
    entry(now, { command: 'playground.open', title: 'New playground' }, false),
    separator,
    entry(now, { command: 'tab.close', element: 'tab.close@app-menu', title: 'Close tab', key: 'Ctrl+W' }, false),
    entry(
      now,
      { command: 'tab.reopen', element: 'tab.reopen@app-menu', title: 'Reopen closed tab', key: 'Ctrl+Shift+T' },
      false,
    ),
  ]);
}

function editMenu(): Menu {
  return menu('Edit', true, [
    role('undo'),
    role('redo'),
    separator,
    role('cut'),
    role('copy'),
    role('paste'),
    role('selectAll'),
  ]);
}

function themeEntries(now: Now): MenuEntry[] {
  const choice = themeChoice(now.state.settings);
  return (['system', 'dark', 'light'] as const).map((value) =>
    entry(
      now,
      {
        command: `window.theme:${value}`,
        element: 'window.theme@app-menu',
        title: themeNames[value],
        shownTitle: themeNames[value],
        checked: choice === value,
      },
      false,
    ),
  );
}

function viewMenu(now: Now): Menu {
  const { nav, window } = now.state;
  const explorer = nav.explorerHidden ? 'Show explorer' : 'Hide explorer';
  const inspector = nav.inspectorHidden ? 'Show inspector' : 'Hide inspector';
  const zoom = (variant: ZoomVariant, title: string): MenuEntry =>
    entry(now, { command: `window.zoom:${variant}`, element: 'window.zoom@app-menu', title }, false);
  return menu('View', false, [
    entry(now, { command: 'palette.open', element: 'palette.open@app-menu', title: 'Go to…', key: 'Ctrl+K' }, false),
    entry(
      now,
      {
        command: 'nav.toggle-explorer',
        element: 'nav.toggle-explorer@app-menu',
        title: explorer,
        shownTitle: explorer,
      },
      false,
    ),
    entry(
      now,
      {
        command: 'nav.toggle-inspector',
        element: 'nav.toggle-inspector@app-menu',
        title: inspector,
        shownTitle: inspector,
      },
      false,
    ),
    separator,
    { kind: 'submenu', title: 'Theme', entries: themeEntries(now) },
    separator,
    zoom('in', 'Zoom in'),
    zoom('out', 'Zoom out'),
    zoom('reset', 'Reset zoom'),
    separator,
    entry(
      now,
      {
        command: 'window.full-screen',
        element: 'window.full-screen@app-menu',
        title: fullScreenTitle(window),
        shownTitle: fullScreenTitle(window),
        shownKey: 'Ctrl+Cmd+F',
      },
      false,
    ),
  ]);
}

function goMenu(now: Now): Menu {
  return menu('Go', false, [
    entry(now, { command: 'nav.back:back', element: 'nav.back@app-menu', title: 'Back', key: 'Ctrl+[' }, false),
    entry(now, { command: 'nav.back:forward', element: 'nav.back@app-menu', title: 'Forward', key: 'Ctrl+]' }, false),
    entry(now, { command: 'home.show', element: 'home.show@app-menu', title: 'Home', key: 'Ctrl+Shift+H' }, false),
    entry(
      now,
      {
        command: 'nav.switch-connection',
        title: 'Switch connection…',
        key: 'Ctrl+Shift+O',
      },
      false,
    ),
    separator,
    entry(now, { command: 'tab.activate:next', title: 'Next tab' }, false),
    entry(now, { command: 'tab.activate:previous', title: 'Previous tab' }, false),
  ]);
}

/** The system's own **Minimize** and **Zoom**, which minimize, maximize and restore the window (`window.size`). */
function windowMenu(): Menu {
  return menu('Window', true, [
    role('minimize', 'window.size@app-menu'),
    role('zoom', 'window.size@app-menu'),
    separator,
    role('front'),
  ]);
}

function helpMenu(now: Now, repository: string | undefined): Menu {
  if (repository === undefined) {
    return menu('Help', false, []);
  }
  const link = (title: string, address: string): MenuEntry => ({
    kind: 'command',
    title,
    element: 'window.open-link@app-menu',
    intent: { ...commandIntent('window.open-link', 'app-menu'), args: { address } },
    enabled: !now.dialogOpen,
  });
  return menu('Help', false, [
    link(windowText.aboutDocumentation, documentationAddress(repository)),
    link(windowText.aboutReportIssue, issuesAddress(repository)),
  ]);
}

/** The address of the documentation: the repository's README. */
export function documentationAddress(repository: string): string {
  return `${repository}#readme`;
}

/** The address where an issue is reported. */
export function issuesAddress(repository: string): string {
  return `${repository}/issues`;
}

/**
 * Feature: window.app-menu
 *
 * The menus **Datardo**, **File**, **Edit**, **View**, **Go**, **Window** and **Help**, in this order. An entry whose
 * command is not offered now, or not registered yet, is disabled; while a dialog is open only the entries of
 * **Datardo**, **Edit** and **Window** stay enabled.
 */
export function view(
  state: AppState,
  commands: readonly Command[] = allCommands,
  known: Product = product,
): readonly Menu[] {
  const { repository } = known;
  const now: Now = {
    state,
    registered: new Map(commands.map((command) => [command.id as string, command])),
    dialogOpen: state.runner.dialogs.length > 0,
  };
  return [appMenu(now), fileMenu(now), editMenu(), viewMenu(now), goMenu(now), windowMenu(), helpMenu(now, repository)];
}
