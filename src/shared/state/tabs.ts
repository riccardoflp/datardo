/**
 * The part of the app's state about the tab strip (tab.md): the open tabs in the order of the strip, which one is
 * active, which groups are collapsed, and the tabs closed in this run for **Reopen closed tab**.
 *
 * The tabs are kept in the order the strip shows them: the tabs of the app first, then the tabs of each connection
 * together, the groups in the order in which they were first opened (`tab.groups`). Every change keeps that order, so
 * the groups are read from the list as it is.
 */
import type { EngineName } from '../engine-request';
import type { ConnectionId, TabId } from '../ids';
import { tabId } from '../ids';

/** What a tab shows (`tab.same-target`); the kinds of tabs of the product page, "What a tab is". */
export type TabShows =
  | {
      readonly kind: 'app';
      readonly page: string;
      /** For the form of a saved connection: the connection it edits. */
      readonly edits?: ConnectionId;
      /** For the form of a new connection: its engine, which tells the two forms of new connections apart. */
      readonly engine?: EngineName;
      /** For the form of a new connection: the folder it was started on, which is not part of what the tab shows. */
      readonly folder?: string;
    }
  | {
      readonly kind: 'collection';
      readonly connection: ConnectionId;
      readonly database: string;
      readonly collection: string;
      readonly view?: boolean;
    }
  | {
      readonly kind: 'document';
      readonly connection: ConnectionId;
      readonly database: string;
      readonly collection: string;
      /** The `_id` as the table shows it: `ObjectId("65f1c0de9a7b4e00012f3a2c")`, `7`. */
      readonly id: string;
      /** The `_id` as canonical Extended JSON, which tells two `_id` apart by type and value. */
      readonly idJson?: string;
    }
  | {
      readonly kind: 'keys';
      readonly connection: ConnectionId;
      readonly database: number;
      /** The namespace, with its separator at the end (`orders:2026:`); absent for the keys of the database. */
      readonly namespace?: string;
      readonly separator: string;
    }
  | {
      readonly kind: 'key';
      readonly connection: ConnectionId;
      readonly database: number;
      /** The name of the key, as text (`value.format` writes the bytes of a name that is not text). */
      readonly key: string;
      /** The bytes of the name in hexadecimal; absent when the name is the text above. */
      readonly keyHex?: string;
      readonly separator: string;
    }
  | {
      readonly kind: 'page';
      readonly connection: ConnectionId;
      readonly title: string;
      readonly page: string;
      readonly database?: string;
      /** What the page is of, when more than a database: a bucket, or the two sides of a comparison in their order. */
      readonly of?: readonly string[];
    }
  | {
      readonly kind: 'playground';
      readonly connection: ConnectionId;
      /** **Playground 1** for one never saved; the name of its file otherwise. */
      readonly title: string;
      /** The full path of its file; absent while it was never saved. */
      readonly file?: string;
    }
  | { readonly kind: 'console'; readonly connection: ConnectionId };

/** What a tab keeps of what was typed in it, saved with the tabs (`tab.restore`) and given back by `tab.reopen`. */
export interface TabMemory {
  /** The text of the query bar of a collection tab. */
  readonly query?: string;
  /** The text of the pipeline of a collection tab. */
  readonly pipeline?: string;
  /** The pattern of a keys tab. */
  readonly pattern?: string;
  /** The type filter of a keys tab. */
  readonly typeFilter?: string;
  /** What a page of sections keeps of its controls, by name: **Auto**, the filters, the sorts (`server.show`). */
  readonly choices?: Readonly<Record<string, string>>;
}

/** The unsaved text of a document tab or a playground tab, kept aside so that a crash does not lose it (D33). */
export interface Draft {
  readonly text: string;
  /** The document as it was read, for a document tab. */
  readonly original?: string;
}

/** An open tab. */
export interface Tab {
  readonly id: TabId;
  readonly shows: TabShows;
  /** The section shown, for a page that has several. */
  readonly section?: string;
  readonly memory?: TabMemory;
  /** When it was last made active, in milliseconds since 1970; 0 when it never was in this run. */
  readonly lastActive: number;
  /** Whether its page has loaded: a tab opened in the background or restored loads when first made active. */
  readonly loaded: boolean;
  /** Whether it has unsaved changes (glossary, "unsaved changes"). */
  readonly unsaved?: boolean;
  readonly draft?: Draft;
}

/** A tab closed in this run, for **Reopen closed tab** (`tab.reopen`) and for **Back** (`nav.back`). */
export interface ClosedTab {
  /** What it showed, as `tab.same-target` compares it. */
  readonly key: string;
  readonly shows: TabShows;
  readonly section?: string;
  readonly memory?: TabMemory;
  /** Its place in its group when it was closed, from 0. */
  readonly place: number;
  /** False once 20 tabs were closed after it: **Reopen closed tab** no longer offers it, **Back** still can. */
  readonly reopenable: boolean;
}

/** The tab strip. */
export interface TabsState {
  /** Whether the tabs of the last run were restored, or the start went on without them. */
  readonly restored: boolean;
  /** In the order of the strip. */
  readonly tabs: readonly Tab[];
  readonly active?: TabId | undefined;
  /** The connections whose group is collapsed (`tab.collapse-group`). */
  readonly collapsed: readonly ConnectionId[];
  /** The tabs closed in this run, the last closed first. */
  readonly closed: readonly ClosedTab[];
  /** The number of the next tab opened, which makes its identifier. */
  readonly nextId: number;
}

/** A tab as it is restored or opened: what it shows and what it keeps. */
export interface TabSeed {
  readonly shows: TabShows;
  readonly section?: string;
  readonly memory?: TabMemory;
  readonly draft?: Draft;
}

/** How many closed tabs are kept: **Back** can open those it names. */
export const closedKept = 100;

/** How many of the last closed tabs **Reopen closed tab** offers (Datardo's choice). */
export const reopenLimit = 20;

/** The events of this part of the state. */
export type TabsEvent =
  | {
      readonly slice: 'tabs';
      readonly type: 'restored';
      readonly tabs: readonly TabSeed[];
      /** The index of the active tab in `tabs`. */
      readonly active?: number;
      readonly collapsed: readonly ConnectionId[];
      readonly at: number;
    }
  | {
      readonly slice: 'tabs';
      readonly type: 'opened';
      readonly seed: TabSeed;
      /** What it shows, as `tab.same-target` compares it: a closed tab of the same key is forgotten. */
      readonly key: string;
      readonly background: boolean;
      /** Its place in its group, for a tab reopened; at the end of its group otherwise. */
      readonly place?: number;
      readonly at: number;
    }
  | { readonly slice: 'tabs'; readonly type: 'activated'; readonly tab: TabId; readonly at: number }
  | {
      readonly slice: 'tabs';
      readonly type: 'closed';
      readonly tab: TabId;
      /** What it showed, kept for **Reopen closed tab**; absent when it is not to be reopened. */
      readonly key?: string;
      readonly at: number;
    }
  | { readonly slice: 'tabs'; readonly type: 'moved'; readonly tab: TabId; readonly to: number }
  | {
      readonly slice: 'tabs';
      readonly type: 'collapsed';
      readonly connection: ConnectionId;
      readonly collapsed: boolean;
    }
  | {
      readonly slice: 'tabs';
      readonly type: 'changed';
      readonly tab: TabId;
      readonly section?: string;
      readonly memory?: TabMemory;
      readonly unsaved?: boolean;
      /** The draft; `null` removes it. */
      readonly draft?: Draft | null;
    }
  | {
      readonly slice: 'tabs';
      readonly type: 'connection-removed';
      readonly connection: ConnectionId;
      readonly at: number;
    };

/** No tab yet: the tabs of the last run are restored when Datardo starts (`tab.restore`). */
export const initialTabsState: TabsState = { restored: false, tabs: [], collapsed: [], closed: [], nextId: 1 };

/** The connection a tab belongs to, or none for a tab of the app. */
export function connectionOfShows(shows: TabShows): ConnectionId | undefined {
  return shows.kind === 'app' ? undefined : shows.connection;
}

/** The connection of a tab. */
export function tabConnectionOf(tab: Tab): ConnectionId | undefined {
  return connectionOfShows(tab.shows);
}

/** The active tab, when there is one. */
export function activeTabOf(state: TabsState): Tab | undefined {
  return state.active === undefined ? undefined : state.tabs.find((tab) => tab.id === state.active);
}

/** The tabs of one group, in their order: a connection's, or the app's for `undefined`. */
export function tabsOfGroup(tabs: readonly Tab[], connection: ConnectionId | undefined): readonly Tab[] {
  return tabs.filter((tab) => tabConnectionOf(tab) === connection);
}

/** The tabs with a tab added to its group: at its place, or at the end of the group; a new group goes at the end. */
export function withTabAdded(tabs: readonly Tab[], tab: Tab, place?: number): readonly Tab[] {
  const connection = tabConnectionOf(tab);
  const indexes = tabs.flatMap((each, index) => (tabConnectionOf(each) === connection ? [index] : []));
  const first = indexes[0];
  const last = indexes[indexes.length - 1];
  let at: number;
  if (first === undefined || last === undefined) {
    at = connection === undefined ? 0 : tabs.length;
  } else {
    at = place === undefined ? last + 1 : first + Math.max(0, Math.min(place, indexes.length));
  }
  return [...tabs.slice(0, at), tab, ...tabs.slice(at)];
}

function makeTab(seed: TabSeed, id: number, more: Pick<Tab, 'lastActive' | 'loaded'>): Tab {
  return {
    id: tabId(`tab-${String(id)}`),
    shows: seed.shows,
    ...(seed.section === undefined ? {} : { section: seed.section }),
    ...(seed.memory === undefined ? {} : { memory: seed.memory }),
    ...(seed.draft === undefined ? {} : { draft: seed.draft, unsaved: true }),
    ...more,
  };
}

/** A time later than every tab's, so that the tab made active last is always the latest. */
function laterThanAll(tabs: readonly Tab[], at: number): number {
  return Math.max(at, ...tabs.map((tab) => tab.lastActive + 1));
}

/** The state with a tab made active: its page loads and its group is expanded. */
function activated(state: TabsState, id: TabId, at: number): TabsState {
  const tab = state.tabs.find((each) => each.id === id);
  if (tab === undefined) {
    return state;
  }
  const time = laterThanAll(state.tabs, at);
  const connection = tabConnectionOf(tab);
  return {
    ...state,
    active: id,
    tabs: state.tabs.map((each) => (each.id === id ? { ...each, lastActive: time, loaded: true } : each)),
    collapsed: state.collapsed.filter((each) => each !== connection),
  };
}

/** The tab that becomes active when the active one goes: the one active last, or its neighbor when none was. */
export function nextActive(before: readonly Tab[], left: readonly Tab[], gone: TabId): TabId | undefined {
  const latest = [...left].sort((one, other) => other.lastActive - one.lastActive)[0];
  if (latest !== undefined && latest.lastActive > 0) {
    return latest.id;
  }
  const index = before.findIndex((tab) => tab.id === gone);
  return (left[Math.min(index, left.length - 1)] ?? left[0])?.id;
}

/** The state without some tabs; when the active one is among them, the next one is made active. */
function withoutTabs(state: TabsState, gone: (tab: Tab) => boolean, at: number): TabsState {
  const left = state.tabs.filter((tab) => !gone(tab));
  const activeGone = state.tabs.some((tab) => tab.id === state.active && gone(tab));
  const removed = state.tabs.find((tab) => tab.id === state.active && gone(tab))?.id;
  const kept: TabsState = { ...state, tabs: left };
  if (!activeGone || removed === undefined) {
    return kept;
  }
  const next = nextActive(state.tabs, left, removed);
  return next === undefined ? { ...kept, active: undefined } : activated(kept, next, at);
}

function closed(state: TabsState, event: Extract<TabsEvent, { type: 'closed' }>): TabsState {
  const tab = state.tabs.find((each) => each.id === event.tab);
  if (tab === undefined) {
    return state;
  }
  const after = withoutTabs(state, (each) => each.id === event.tab, event.at);
  if (event.key === undefined) {
    return after;
  }
  const place = tabsOfGroup(state.tabs, tabConnectionOf(tab)).findIndex((each) => each.id === tab.id);
  const entry: ClosedTab = {
    key: event.key,
    shows: tab.shows,
    place,
    reopenable: true,
    ...(tab.section === undefined ? {} : { section: tab.section }),
    ...(tab.memory === undefined ? {} : { memory: tab.memory }),
  };
  const closedTabs = [entry, ...after.closed.filter((each) => each.key !== event.key)]
    .slice(0, closedKept)
    .map((each, index) => (index < reopenLimit ? each : { ...each, reopenable: false }));
  return { ...after, closed: closedTabs };
}

function opened(state: TabsState, event: Extract<TabsEvent, { type: 'opened' }>): TabsState {
  const tab = makeTab(event.seed, state.nextId, { lastActive: 0, loaded: !event.background });
  const added: TabsState = {
    ...state,
    tabs: withTabAdded(state.tabs, tab, event.place),
    nextId: state.nextId + 1,
    closed: state.closed.filter((each) => each.key !== event.key),
  };
  return event.background ? added : activated(added, tab.id, event.at);
}

function restored(state: TabsState, event: Extract<TabsEvent, { type: 'restored' }>): TabsState {
  const tabs = event.tabs.reduce<readonly Tab[]>(
    (list, seed, index) => withTabAdded(list, makeTab(seed, state.nextId + index, { lastActive: 0, loaded: false })),
    [],
  );
  const chosen = event.active === undefined ? undefined : tabId(`tab-${String(state.nextId + event.active)}`);
  const next: TabsState = {
    ...state,
    restored: true,
    tabs,
    collapsed: event.collapsed,
    nextId: state.nextId + event.tabs.length,
    active: undefined,
  };
  const active = tabs.find((tab) => tab.id === chosen)?.id ?? tabs[0]?.id;
  return active === undefined ? next : activated(next, active, event.at);
}

function moved(state: TabsState, id: TabId, to: number): TabsState {
  const tab = state.tabs.find((each) => each.id === id);
  if (tab === undefined) {
    return state;
  }
  const without = state.tabs.filter((each) => each.id !== id);
  return { ...state, tabs: withTabAdded(without, tab, to) };
}

function changed(state: TabsState, event: Extract<TabsEvent, { type: 'changed' }>): TabsState {
  const change = (tab: Tab): Tab => {
    const { draft: _draft, ...rest } = tab;
    const base = event.draft === null ? rest : tab;
    return {
      ...base,
      ...(event.section === undefined ? {} : { section: event.section }),
      ...(event.memory === undefined ? {} : { memory: event.memory }),
      ...(event.unsaved === undefined ? {} : { unsaved: event.unsaved }),
      ...(event.draft === undefined || event.draft === null ? {} : { draft: event.draft }),
    };
  };
  return { ...state, tabs: state.tabs.map((tab) => (tab.id === event.tab ? change(tab) : tab)) };
}

/** Changes this part of the state. */
export function reduceTabs(state: TabsState, event: TabsEvent): TabsState {
  switch (event.type) {
    case 'restored':
      return restored(state, event);
    case 'opened':
      return opened(state, event);
    case 'activated':
      return activated(state, event.tab, event.at);
    case 'closed':
      return closed(state, event);
    case 'moved':
      return moved(state, event.tab, event.to);
    case 'collapsed': {
      const others = state.collapsed.filter((each) => each !== event.connection);
      return { ...state, collapsed: event.collapsed ? [...others, event.connection] : others };
    }
    case 'changed':
      return changed(state, event);
    case 'connection-removed': {
      const gone = (tab: Tab): boolean => tabConnectionOf(tab) === event.connection;
      const after = withoutTabs(state, gone, event.at);
      return {
        ...after,
        closed: after.closed.filter((each) => connectionOfShows(each.shows) !== event.connection),
        collapsed: after.collapsed.filter((each) => each !== event.connection),
      };
    }
  }
}
