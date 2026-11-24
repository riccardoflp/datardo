/**
 * Feature: tab.strip
 *
 * The open tabs, in groups, one group for each connection, in the first row of the main island. A click makes a tab
 * active, a click with the middle button closes it, a right click opens its menu, a drag reorders it.
 */
import type { ConnectionColor } from '../../shared/connection';
import type { TabId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import type { Tab, TabShows } from '../../shared/state/tabs';
import { pathSegments } from '../nav/path';
import type { SavedConnection } from '../nav/types';
import { isOffered as isCloseOffered } from './close';
import { groupConnections, groups, type GroupLabel } from './groups';
import { text } from './text';
import { titledTabs } from './title';
import { connectionName } from './types';

/** A tab as the strip draws it. */
export interface StripTab {
  readonly id: TabId;
  readonly title: string;
  /** The Codicon of its kind, or of its page. */
  readonly icon: string;
  /** The color its icon is drawn in (`tab.groups`): that of its collection or database; absent for its usual color. */
  readonly color?: ConnectionColor;
  readonly active: boolean;
  readonly unsaved: boolean;
  /** Whether it has a close button: every tab but Home while it is the only tab. */
  readonly closable: boolean;
  /** Its whole path, as the scope bar writes it: `Local / shop / orders`. */
  readonly path: string;
  /** What a screen reader says: `orders, collection tab, Local`, and `unsaved changes` when it has them. */
  readonly spoken: string;
}

/** A group as the strip draws it. */
export interface StripGroup {
  /** The connection's identifier; absent for the app's group. */
  readonly connection?: string;
  readonly label?: GroupLabel & { readonly spoken: string };
  readonly collapsed: boolean;
  /** How many tabs it has, shown beside the label of a collapsed group. */
  readonly count: number;
  readonly tabs: readonly StripTab[];
}

/** The strip. */
export interface StripView {
  readonly label: string;
  readonly groups: readonly StripGroup[];
  /** **All tabs**, shown while the strip scrolls: Go to on the open tabs (`palette.open` with the prefix `=`). */
  readonly allTabs: {
    readonly label: string;
    readonly element: string;
    readonly feature: string;
    readonly prefix: string;
  };
}

const pageIcons: Readonly<Record<string, string>> = {
  home: 'home',
  settings: 'settings-gear',
  undo: 'history',
  tasks: 'watch',
  log: 'output',
  'connection-form': 'plug',
  overview: 'info',
  monitor: 'pulse',
  server: 'server',
  pubsub: 'broadcast',
  users: 'person',
  advisor: 'lightbulb',
  search: 'search',
  watch: 'eye',
  diagram: 'type-hierarchy',
  gridfs: 'files',
  compare: 'diff',
  structure: 'diff',
};

/** The icon of what a tab shows. */
export function iconOf(shows: TabShows): string {
  switch (shows.kind) {
    case 'app':
    case 'page':
      return pageIcons[shows.page] ?? 'window';
    case 'collection':
      return shows.view === true ? 'eye' : 'table';
    case 'document':
      return 'json';
    case 'keys':
      return 'key';
    case 'key':
      return 'symbol-key';
    case 'playground':
      return 'code';
    case 'console':
      return 'terminal';
  }
}

/** The saved connections as the path needs them. */
function pathConnections(state: AppState): readonly SavedConnection[] {
  return state.connections.saved.map((saved) => ({
    id: saved.id,
    name: saved.name,
    engine: saved.engine,
    readOnly: saved.readOnly,
    status: { kind: 'not-connected' },
  }));
}

/** The whole path of what a tab shows, as the scope bar writes it: `Local / shop / orders`, `Settings`. */
export function pathOf(state: AppState, shows: TabShows): string {
  return pathSegments(shows, pathConnections(state))
    .map((segment) => segment.label)
    .join(' / ');
}

function stripTab(state: AppState, tab: Tab, title: string, color: ConnectionColor | undefined): StripTab {
  const connection = tab.shows.kind === 'app' ? undefined : connectionName(state, tab.shows.connection);
  const spoken = [title, text.kinds[tab.shows.kind], ...(connection === undefined ? [] : [connection])];
  return {
    id: tab.id,
    title,
    icon: iconOf(tab.shows),
    ...(color === undefined ? {} : { color }),
    active: tab.id === state.tabs.active,
    unsaved: tab.unsaved === true,
    closable: isCloseOffered(state, tab),
    path: pathOf(state, tab.shows),
    spoken: [...spoken, ...(tab.unsaved === true ? [text.strip.unsaved] : [])].join(', '),
  };
}

/**
 * Feature: tab.strip
 *
 * The groups in their order, and in each its tabs in theirs, with the one that is active.
 */
export function view(state: AppState): StripView {
  const titles = titledTabs(state.tabs.tabs, (id) => connectionName(state, id));
  const found = groups(state.tabs.tabs, groupConnections(state), {
    collapsed: state.tabs.collapsed,
    active: state.tabs.active,
    current: state.nav.current,
  });
  return {
    label: text.strip.label,
    groups: found.map((group) => ({
      ...(group.connection === undefined ? {} : { connection: group.connection }),
      ...(group.label === undefined
        ? {}
        : {
            label: {
              ...group.label,
              spoken: group.collapsed
                ? text.strip.collapsedLabel(group.label.fullName, group.tabs.length)
                : `${group.label.fullName}, ${text.strip.states[group.label.dot]}`,
            },
          }),
      collapsed: group.collapsed,
      count: group.tabs.length,
      tabs: group.shown.map((tab) => stripTab(state, tab, titles.get(tab.id) ?? '', group.colors[tab.id])),
    })),
    allTabs: { label: text.strip.allTabs, element: 'palette.open@tab-strip', feature: 'palette.open', prefix: '=' },
  };
}
