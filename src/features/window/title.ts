/**
 * Feature: window.title
 *
 * The name of the window for the system: the taskbar, the Dock and the window switcher name it, though it has no
 * title bar.
 */
import { appName } from './text';

/** The active tab as the name of the window needs it: its title and, for a tab of a connection, its name. */
export interface TitledTab {
  readonly title: string;
  /** The name of the tab's connection; absent for a tab of the app. */
  readonly connection?: string;
}

/**
 * Feature: window.title
 *
 * `<tab> — <connection> — Datardo`, `<tab> — Datardo`, or `Datardo` with no active tab. Nothing else is ever in it.
 */
export function windowTitle(activeTab: TitledTab | undefined): string {
  if (activeTab === undefined) {
    return appName;
  }
  return activeTab.connection === undefined
    ? `${activeTab.title} — ${appName}`
    : `${activeTab.title} — ${activeTab.connection} — ${appName}`;
}
