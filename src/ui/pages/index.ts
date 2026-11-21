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
import { HistoryInspector, historyExtras } from './history/history-inspector';
import { HistoryPage } from './history/history-page';
import { useHistoryChanges } from './history/history-store';
import { WatchInspector, watchExtras } from './watch/watch-inspector';
import { WatchPage } from './watch/watch-page';
import { useWatchChanges } from './watch/watch-store';

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
  history: HistoryPage,
  watch: WatchPage,
};

/** The pages of the tabs that show a target of a connection, by the kind of what they show (`keys`, `key`). */
export const tabPages: Readonly<Partial<Record<string, PageView>>> = {
  keys: KeysPage,
  key: KeyPage,
};

/**
 * What the inspector island draws for one thing selected in a page, by the kind of what the active tab shows, or by
 * the name of its page for a page tab ({@link pageKindOf}).
 */
export const inspectors: Readonly<
  Partial<Record<string, (props: { readonly tabId: string }) => React.JSX.Element | null>>
> = { keys: KeyInspector, history: HistoryInspector, watch: WatchInspector };

/** What a page adds to the active tab, by its kind: what the status line counts, what the inspector island shows. */
export const tabExtras: Readonly<Partial<Record<string, typeof keysExtras>>> = {
  keys: keysExtras,
  history: historyExtras,
  watch: watchExtras,
};

/** What the lookups above are keyed by: the kind of what a tab shows, or the name of its page for a page tab. */
export function pageKindOf(shows: { readonly kind: string; readonly page?: string }): string {
  return shows.kind === 'page' && shows.page !== undefined ? shows.page : shows.kind;
}

/** Draws again when a page keeps what it adds to the active tab in the window alone (the history, Watch changes). */
export function usePageExtrasChanges(): void {
  useHistoryChanges();
  useWatchChanges();
}
