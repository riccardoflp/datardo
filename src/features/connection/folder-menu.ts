/**
 * Feature: connection.folder-menu — the entries offered on a folder of connections: on its heading of the Home page
 * (`@home`) and of the connection switcher (`@connection-switcher`). Each starts its feature with the folder in its
 * arguments, so that **Add connection** fills **Folder**, **Import connections…** imports into it without asking, and
 * **Export connections…** starts with its connections checked.
 */
import { folderMenuText } from './text';

/** The places the menu of a folder is drawn in. */
export type FolderMenuPlace = 'home' | 'connection-switcher';

/** An entry: its text, the feature it starts with `{ folder }`, and the element of its control in this place. */
export interface FolderMenuItem {
  readonly kind: 'item';
  readonly label: string;
  readonly feature: string;
  readonly element: string;
}

/** An entry, or the line between two groups. */
export type FolderMenuEntry = FolderMenuItem | { readonly kind: 'separator' };

/** The menu of one folder. */
export interface FolderMenuView {
  readonly label: string;
  /** The `…` button that opens it, and the menu itself, in this place. */
  readonly element: string;
  readonly folder: string;
  readonly entries: readonly FolderMenuEntry[];
}

type Elements = Readonly<Record<FolderMenuPlace, string>>;

/** The elements of each entry, by place, each written whole (R10.3). */
const elements = {
  menu: { home: 'connection.folder-menu@home', 'connection-switcher': 'connection.folder-menu@connection-switcher' },
  add: { home: 'connection.add@home', 'connection-switcher': 'connection.add@connection-switcher' },
  rename: {
    home: 'connection.rename-folder@home',
    'connection-switcher': 'connection.rename-folder@connection-switcher',
  },
  remove: {
    home: 'connection.remove-folder@home',
    'connection-switcher': 'connection.remove-folder@connection-switcher',
  },
  import: { home: 'connection.import@home', 'connection-switcher': 'connection.import@connection-switcher' },
  export: { home: 'connection.export@home', 'connection-switcher': 'connection.export@connection-switcher' },
} as const satisfies Readonly<Record<string, Elements>>;

const separator: FolderMenuEntry = { kind: 'separator' };

function item(label: string, feature: string, element: string): FolderMenuEntry {
  return { kind: 'item', label, feature, element };
}

/** Feature: connection.folder-menu — the entries of the menu of a folder, in the order of the card. */
export function view(state: { readonly folder: string; readonly place: FolderMenuPlace }): FolderMenuView {
  const { folder, place } = state;
  return {
    label: folderMenuText.label(folder),
    element: elements.menu[place],
    folder,
    entries: [
      item(folderMenuText.add, 'connection.add', elements.add[place]),
      separator,
      item(folderMenuText.rename, 'connection.rename-folder', elements.rename[place]),
      item(folderMenuText.remove, 'connection.remove-folder', elements.remove[place]),
      separator,
      item(folderMenuText.importConnections, 'connection.import', elements.import[place]),
      item(folderMenuText.exportConnections, 'connection.export', elements.export[place]),
    ],
  };
}
