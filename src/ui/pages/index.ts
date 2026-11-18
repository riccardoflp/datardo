/**
 * The pages the main island can show, by name. Each area that has a page adds one line here; the tabs of M4 open
 * them.
 */
import { ConnectionFormPage } from './connection/form-page';
import { OverviewPage } from './connection/overview-page';
import { HomePage } from './home/home-page';
import { LogPage } from './log/log-page';
import { SettingsPage } from './settings/settings-page';

/** A page as the main island draws it. */
export type PageView = () => React.JSX.Element | null;

/** Every page, by name. */
export const pages: Readonly<Record<string, PageView>> = {
  home: HomePage,
  settings: SettingsPage,
  log: LogPage,
  'connection-form': ConnectionFormPage,
  overview: OverviewPage,
};
