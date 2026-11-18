/**
 * What the nav area decides from: the app's state, with the saved connections and their states (connection.md) and the
 * open tabs (tab.md) as the nav area shows them. The features and their tests take a {@link NavInput}.
 */
import type { EngineName, Json } from '../../shared/engine-request';
import { noDanger, type After, type Answers, type AppStep, type Plan } from '../../shared/feature';
import type { ConnectionId, TabId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import type { ServerInfo } from '../../shared/connection';
import type { ConnectionsState, LiveConnection } from '../../shared/state/connections';
import type { NavState } from '../../shared/state/nav';
import { activeTabOf, tabConnectionOf, type TabShows } from '../../shared/state/tabs';
import type { Work } from '../../shared/state/runner';
import { setting } from '../settings/read';
import { serverText } from '../connection/server-info';
import { titledTabs } from '../tab/title';

/** What the server said it is when the connection connected. */
export interface ServerFacts {
  /** `8.0`, `7.2`. */
  readonly version: string;
  /** `standalone`, the name of the replica set (`rs0`), `sharded cluster`; for Redis `standalone` or `replica`. */
  readonly topology: string;
}

/** The state of a connection, as `connection.state` keeps it. */
export type ConnectionStatus =
  | { readonly kind: 'not-connected' }
  | { readonly kind: 'connecting' }
  | { readonly kind: 'connected'; readonly server: ServerFacts }
  | { readonly kind: 'reconnecting'; readonly reason: string }
  | { readonly kind: 'failed'; readonly reason: string };

/** A saved connection, as the nav area shows it. */
export interface SavedConnection {
  readonly id: ConnectionId;
  readonly name: string;
  readonly engine: EngineName;
  readonly folder?: string;
  readonly readOnly: boolean;
  readonly status: ConnectionStatus;
  /** The Redis connection this MongoDB connection publishes its writes to (`connection.link-redis`). */
  readonly publishesTo?: ConnectionId;
}

/** What the page of the active tab has selected, for the inspector island (`nav.inspector`). */
export interface Inspection {
  /** How many rows are selected. */
  readonly selected: number;
  /** What the first row of the island says of one selected row: `orders · 65f1…a2c`. */
  readonly title?: string;
  /** The line under **Nothing selected**: *Select a document to see it here.* */
  readonly emptyLine: string;
  /** Since when the selected thing is being read, in milliseconds since 1970. */
  readonly loadingSince?: number;
  /** The message of the read that failed. */
  readonly error?: string;
}

/** What the active tab shows (`tab.same-target`), as the scope bar, the path and Copy path need it. */
export type { TabShows } from '../../shared/state/tabs';

/** The active tab: what it shows, its section, what its page counts and what it has selected. */
export type ActiveTab = TabShows & {
  readonly tab?: TabId;
  readonly section?: string;
  /** What the page counts, in the words of its feature: `2 of 1,204 documents · 38 ms`. */
  readonly count?: string;
  /** What the inspector island shows, for a page that has something to inspect. */
  readonly inspection?: Inspection;
};

/** An open tab of a connection, for the connection switcher's plan. */
export interface OpenTab {
  readonly id: TabId;
  readonly title: string;
  readonly connection?: ConnectionId;
  /** When it was last active, in milliseconds since 1970. */
  readonly lastActive: number;
}

/** Everything the nav area decides from. */
export interface NavInput {
  readonly nav: NavState;
  readonly connections: readonly SavedConnection[];
  readonly tabs: readonly OpenTab[];
  readonly activeTab: ActiveTab;
  readonly work: readonly Work[];
  /** The zoom of the window, in percent (`window.zoom`). */
  readonly zoom: number;
}

/** What the server is, as the nav area shows it: the first two numbers of the version and the topology. */
function serverFacts(server: ServerInfo | undefined): ServerFacts {
  if (server === undefined) {
    return { version: '', topology: '' };
  }
  const [version, topology] = serverText(server).split(' · ');
  return { version: (version ?? '').split(' ').slice(1).join(' '), topology: topology ?? '' };
}

/** The state of a connection, as `connection.state` keeps it in the app's state. */
export function statusOf(live: LiveConnection | undefined): ConnectionStatus {
  switch (live?.state ?? 'not-connected') {
    case 'not-connected':
      return { kind: 'not-connected' };
    case 'connecting':
      return { kind: 'connecting' };
    case 'connected':
      return { kind: 'connected', server: serverFacts(live?.server) };
    case 'reconnecting':
      return { kind: 'reconnecting', reason: live?.reason ?? '' };
    case 'failed':
      return { kind: 'failed', reason: live?.reason ?? '' };
  }
}

/** The saved connections as the nav area shows them, in the order they were saved, with their states. */
export function navConnections(connections: ConnectionsState): readonly SavedConnection[] {
  return connections.saved.map((saved) => ({
    id: saved.id,
    name: saved.name,
    engine: saved.engine,
    readOnly: saved.readOnly,
    status: statusOf(connections.live[saved.id]),
    ...(saved.folder === undefined ? {} : { folder: saved.folder }),
    ...(saved.publishesTo === undefined ? {} : { publishesTo: saved.publishesTo }),
  }));
}

/**
 * What the nav area decides from, in the app's state as it is now: the saved connections and their states
 * (connection.md), the open tabs and the active one (tab.md). With no tab open, the main island stands for Home.
 */
export function navInput(state: AppState): NavInput {
  const active = activeTabOf(state.tabs);
  const titles = titledTabs(state.tabs.tabs);
  return {
    nav: state.nav,
    connections: navConnections(state.connections),
    tabs: state.tabs.tabs.map((tab) => {
      const connection = tabConnectionOf(tab);
      return {
        id: tab.id,
        title: titles.get(tab.id) ?? '',
        ...(connection === undefined ? {} : { connection }),
        lastActive: tab.lastActive,
      };
    }),
    activeTab:
      active === undefined
        ? { kind: 'app', page: 'home' }
        : { ...active.shows, tab: active.id, ...(active.section === undefined ? {} : { section: active.section }) },
    work: state.runner.work,
    zoom: setting(state.settings, 'datardo.window.zoom'),
  };
}

/** Why the plans of this area cannot be undone, as their cards say. */
export const nothingRecorded = 'Nothing is written to a deployment, so nothing is recorded.';

/** A plan of app steps that runs at once and writes nothing to a deployment, as every Operation of this area. */
export function appPlan(title: string, steps: readonly AppStep[], after: readonly After[] = []): Plan {
  return { title, steps, danger: noDanger, undo: { cannot: nothingRecorded }, publishes: false, after };
}

/** One app step: its text, as the plan shows it, the action the main process carries out, and its arguments. */
export function appStep(stepText: string, action: string, args: Json): AppStep {
  return { kind: 'app', text: stepText, action, args };
}

/** The arguments an Operation was started with (`Intent.args`), as an object; empty when there are none. */
export function startArgs(answers: Answers): Readonly<Record<string, unknown>> {
  const args = answers['args'];
  return typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
}

/** The text a field of a Read's arguments holds, when the arguments are an object and the field a text. */
export function textArg(args: Json, name: string): string | undefined {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return undefined;
  }
  const value = (args as { readonly [key: string]: Json })[name];
  return typeof value === 'string' ? value : undefined;
}

/** The connection a tab belongs to, or none for a tab of the app. */
export function tabConnection(tab: TabShows): ConnectionId | undefined {
  return tab.kind === 'app' ? undefined : tab.connection;
}

/** A saved connection by its identifier, when it is still saved. */
export function findConnection(
  connections: readonly SavedConnection[],
  id: ConnectionId | undefined,
): SavedConnection | undefined {
  return id === undefined ? undefined : connections.find((connection) => connection.id === id);
}
