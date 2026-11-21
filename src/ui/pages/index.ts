/**
 * The pages the main island can show, by name. Each area that has a page adds one line here; the tabs of M4 open
 * them.
 */
import { ConnectionFormPage } from './connection/form-page';
import { OverviewPage } from './connection/overview-page';
import { HomePage } from './home/home-page';
import { LogPage } from './log/log-page';
import { SettingsPage } from './settings/settings-page';
import { UndoHistoryPage } from './undo/undo-page';
import { KeyPage } from './key/key-page';
import { KeyInspector } from './keys/key-inspector';
import { KeysPage } from './keys/keys-page';
import { keysExtras } from './keys/keys-state';
import { useKeysTab } from './keys/keys-store';
import { ValueItemInspector } from './value/value-inspector';
import { valueExtras } from './value/value-state';
import { useValueTab } from './value/value-store';

/** A page as the main island draws it. */
export type PageView = () => React.JSX.Element | null;

/** Every page, by name. */
export const pages: Readonly<Record<string, PageView>> = {
  home: HomePage,
  settings: SettingsPage,
  log: LogPage,
  'connection-form': ConnectionFormPage,
  overview: OverviewPage,
  undo: UndoHistoryPage,
};

/** The pages of the tabs that show a target of a connection, by the kind of what they show (`keys`, `key`). */
export const tabPages: Readonly<Partial<Record<string, PageView>>> = {
  keys: KeysPage,
  key: KeyPage,
};

/** What the inspector island draws for one thing selected in a page, by the kind of what the active tab shows. */
export const inspectors: Readonly<
  Partial<Record<string, (props: { readonly tabId: string }) => React.JSX.Element | null>>
> = { keys: KeyInspector, key: ValueItemInspector };

/** What a page adds to the active tab, by its kind: what the status line counts, what the inspector island shows. */
export const tabExtras: Readonly<Partial<Record<string, typeof keysExtras>>> = { keys: keysExtras, key: valueExtras };

/** Draws the shell again whenever what a page keeps in the window changes: what a tab adds to it is drawn from that. */
export function usePageStores(): void {
  useKeysTab(undefined);
  useValueTab(undefined);
}
