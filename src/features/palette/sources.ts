/**
 * Feature: palette.sources
 *
 * Turns the text typed into the sources to look in, the terms to look for, and the candidates of each source. A text
 * that starts with a prefix looks in that source only; any other text looks in every source. A connection that is not
 * connected gives its name and nothing else: Go to never connects in order to look.
 */
import type { ConnectionView } from '../../shared/connection';
import type { ConnectionId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { connectionState } from '../../shared/state/connections';
import { connectionOfShows, type TabShows } from '../../shared/state/tabs';
import { runArgs } from '../saved-query/connection-list';
import type { SavedQuery } from '../saved-query/types';
import { targetKey } from '../tab/same-target';
import { iconOf } from '../tab/strip';
import { titledTabs } from '../tab/title';
import { recentEntries } from './recent';
import { text } from './text';
import {
  everySource,
  sourcePrefixes,
  type Candidate,
  type CollectionName,
  type PaletteKnowledge,
  type SourceName,
} from './types';

/** How many rows a prefix with nothing after it lists at most (Datardo's choice). */
export const mostListed = 50;

/** What the text typed asks for. */
export type Looked =
  | { readonly kind: 'nothing-typed' }
  | {
      readonly kind: 'look';
      readonly sources: readonly SourceName[];
      /** The text split at spaces. */
      readonly terms: readonly string[];
      readonly candidates: readonly Candidate[];
      /** A prefix with nothing after it: the whole source is listed, in its own order. */
      readonly whole: boolean;
    };

/** What `sources` looks at: the app's state and what the window knows besides. */
export interface SourcesInput {
  readonly state: AppState;
  readonly knowledge: PaletteKnowledge;
}

/** The pages of the app Go to finds, in this order. */
export const appPages: readonly (keyof typeof text.pages)[] = ['home', 'settings', 'undo', 'tasks', 'log'];

/** The pages of a connection, as **Pages of** lists them (`tree.pages`). */
export const connectionPages = {
  mongodb: ['overview', 'monitor', 'users', 'advisor', 'search', 'watch', 'playground', 'tasks'],
  redis: ['overview', 'server', 'console', 'pubsub'],
} as const;

/** The prefix and the terms of a text: `> zoom` is the commands and `zoom`. */
export function readText(typed: string): { readonly prefix?: SourceName; readonly terms: readonly string[] } {
  const trimmed = typed.trim();
  const first = trimmed.slice(0, 1);
  const prefix = sourcePrefixes[first];
  const rest = prefix === undefined ? trimmed : trimmed.slice(1);
  const terms = rest.split(' ').filter((term) => term !== '');
  return prefix === undefined ? { terms } : { prefix, terms };
}

/** Whether a connection is connected now. */
function isConnected(state: AppState, connection: ConnectionId): boolean {
  return connectionState(state.connections, connection) === 'connected';
}

/** The facts a candidate of what a tab would show has: open, recent, of the current connection. */
interface Facts {
  readonly openKeys: ReadonlySet<string>;
  readonly recentKeys: ReadonlySet<string>;
  readonly current: ConnectionId | undefined;
}

function factsOf(state: AppState): Facts {
  const platform = state.app.platform;
  return {
    openKeys: new Set(state.tabs.tabs.map((tab) => targetKey(tab.shows, platform))),
    recentKeys: new Set(recentEntries(state).map((entry) => entry.key)),
    current: state.nav.current,
  };
}

/** A candidate of something a tab shows. */
function shownCandidate(
  input: SourcesInput,
  facts: Facts,
  shown: Pick<Candidate, 'source' | 'kind' | 'name' | 'context'> & { readonly shows: TabShows },
): Candidate {
  const key = targetKey(shown.shows, input.state.app.platform);
  const connection = connectionOfShows(shown.shows);
  return {
    id: `${shown.source}:${key}`,
    source: shown.source,
    kind: shown.kind,
    name: shown.name,
    context: shown.context,
    icon: iconOf(shown.shows),
    opens: { kind: 'show', shows: shown.shows },
    sameKey: key,
    open: facts.openKeys.has(key),
    recent: facts.recentKeys.has(key),
    current: connection !== undefined && connection === facts.current,
  };
}

function tabCandidates(input: SourcesInput, facts: Facts): readonly Candidate[] {
  const { state } = input;
  const names = (id: ConnectionId): string | undefined => state.connections.saved.find((each) => each.id === id)?.name;
  const titles = titledTabs(state.tabs.tabs, names);
  return state.tabs.tabs.map((tab) => {
    const connection = connectionOfShows(tab.shows);
    const key = targetKey(tab.shows, state.app.platform);
    return {
      id: `tabs:${tab.id}`,
      source: 'tabs',
      kind: 'tab',
      name: titles.get(tab.id) ?? '',
      context: connection === undefined ? '' : (names(connection) ?? connection),
      icon: iconOf(tab.shows),
      opens: { kind: 'tab', tab: tab.id },
      sameKey: key,
      open: true,
      recent: facts.recentKeys.has(key),
      current: connection !== undefined && connection === facts.current,
    };
  });
}

function collectionShows(connection: ConnectionId, name: CollectionName): TabShows {
  if (name.kind === 'bucket') {
    return { kind: 'page', connection, page: 'gridfs', title: name.name, database: name.database, of: [name.name] };
  }
  return {
    kind: 'collection',
    connection,
    database: name.database,
    collection: name.name,
    ...(name.kind === 'view' ? { view: true } : {}),
  };
}

/** The names of a connection by database and name. */
function sortedNames(names: readonly CollectionName[]): readonly CollectionName[] {
  return [...names].sort((one, other) => compare(one.database, other.database) || compare(one.name, other.name));
}

function compare(one: string, other: string): number {
  if (one === other) {
    return 0;
  }
  return one < other ? -1 : 1;
}

/** The connected connections of an engine, or of every engine, in the order they were saved. */
function connectedOf(state: AppState, engine: 'mongodb' | 'redis' | 'any'): readonly ConnectionView[] {
  return state.connections.saved.filter(
    (saved) => (engine === 'any' || saved.engine === engine) && isConnected(state, saved.id),
  );
}

function collectionCandidates(input: SourcesInput, facts: Facts, whole: boolean): readonly Candidate[] {
  const connections = connectedOf(input.state, 'mongodb').filter((saved) => !whole || saved.id === facts.current);
  return connections.flatMap((saved) =>
    sortedNames(input.knowledge.collections[saved.id]?.names ?? []).map((name) =>
      shownCandidate(input, facts, {
        source: 'collections',
        kind: name.kind,
        name: name.name,
        context: `${saved.name} / ${name.database}`,
        shows: collectionShows(saved.id, name),
      }),
    ),
  );
}

/** What a page of a connection shows in its tab. */
export function connectionPageShows(connection: ConnectionId, page: string): TabShows {
  if (page === 'playground') {
    return { kind: 'playground', connection, title: '' };
  }
  if (page === 'console') {
    return { kind: 'console', connection };
  }
  return { kind: 'page', connection, page, title: text.pages[page as keyof typeof text.pages] };
}

function pageCandidates(input: SourcesInput, facts: Facts, whole: boolean): readonly Candidate[] {
  const connections = connectedOf(input.state, 'any').filter((saved) => !whole || saved.id === facts.current);
  const ofConnections = connections.flatMap((saved) =>
    connectionPages[saved.engine].map((page) => ({
      ...shownCandidate(input, facts, {
        source: 'pages',
        kind: 'page',
        name: text.pages[page],
        context: saved.name,
        shows: connectionPageShows(saved.id, page),
      }),
      // A playground opens a new tab each time: it is never the same as one open.
      ...(page === 'playground' ? { id: `pages:playground:${saved.id}`, open: false, recent: false } : {}),
    })),
  );
  const ofTheApp = appPages.map((page) =>
    shownCandidate(input, facts, {
      source: 'pages',
      kind: 'page',
      name: text.pages[page],
      context: text.appContext,
      shows: { kind: 'app', page },
    }),
  );
  return [...ofConnections, ...ofTheApp];
}

/** The saved connections as the connection switcher orders them: those in no folder, then the folders by name. */
export function switcherOrder(saved: readonly ConnectionView[]): readonly ConnectionView[] {
  const loose = saved.filter((connection) => connection.folder === undefined);
  const folders = [...new Set(saved.flatMap((connection) => connection.folder ?? []))].sort(compare);
  return [...loose, ...folders.flatMap((folder) => saved.filter((connection) => connection.folder === folder))];
}

function connectionCandidates(input: SourcesInput, facts: Facts): readonly Candidate[] {
  return switcherOrder(input.state.connections.saved).map((saved) => {
    const engine = text.engines[saved.engine];
    return {
      id: `connections:${saved.id}`,
      source: 'connections',
      kind: 'connection',
      name: saved.name,
      context: saved.folder === undefined ? engine : `${saved.folder} · ${engine}`,
      icon: 'plug',
      opens: { kind: 'connection', connection: saved.id },
      open: false,
      recent: false,
      current: saved.id === facts.current,
    };
  });
}

function commandCandidates(input: SourcesInput): readonly Candidate[] {
  return input.knowledge.commands.map((command) => ({
    id: `commands:${command.id}`,
    source: 'commands',
    kind: 'command',
    name: command.title,
    context: '',
    icon: 'symbol-event',
    opens: { kind: 'command', command: command.id },
    ...(command.key === undefined ? {} : { key: command.key }),
    open: false,
    recent: false,
    current: false,
  }));
}

/** What a saved query is, among those of its connection: its file, or its place, collection and name. */
function savedQueryKey(query: SavedQuery): string {
  return query.place === 'folder' ? `folder:${query.file}` : `me:${query.database}.${query.collection}:${query.name}`;
}

/**
 * The saved queries of every saved MongoDB connection, connected or not, by name (`saved-query.connection-list`): the
 * context is *shop.orders · Folder*, with the connection's name first for another connection than the current one.
 */
function savedQueryCandidates(input: SourcesInput, facts: Facts): readonly Candidate[] {
  const known = input.knowledge.savedQueries ?? {};
  return input.state.connections.saved
    .filter((saved) => saved.engine === 'mongodb')
    .flatMap((saved) =>
      (known[saved.id]?.items ?? []).map((item) => ({
        id: `saved-queries:${saved.id}:${encodeURIComponent(savedQueryKey(item.query))}`,
        source: 'saved-queries' as const,
        kind: 'saved-query' as const,
        name: item.title,
        context: saved.id === facts.current ? item.context : `${saved.name} / ${item.context}`,
        icon: 'bookmark',
        opens: { kind: 'saved-query' as const, args: runArgs(saved.id, item.query) },
        open: false,
        recent: false,
        current: saved.id === facts.current,
      })),
    )
    .sort((one, other) => compare(one.name, other.name));
}

function candidatesOf(input: SourcesInput, facts: Facts, source: SourceName, whole: boolean): readonly Candidate[] {
  switch (source) {
    case 'tabs':
      return tabCandidates(input, facts);
    case 'collections':
      return collectionCandidates(input, facts, whole);
    case 'pages':
      return pageCandidates(input, facts, whole);
    case 'connections':
      return connectionCandidates(input, facts);
    case 'commands':
      return [...commandCandidates(input)].sort((one, other) => compare(one.name, other.name));
    case 'saved-queries':
      return savedQueryCandidates(input, facts);
    case 'keys':
      // Keys come from their own scan (`palette.find-keys`).
      return [];
  }
}

/** Two candidates that show the same thing are one row, which keeps the kind of the tab when a tab is open. */
function oneRowEach(candidates: readonly Candidate[]): readonly Candidate[] {
  const tabKeys = new Set(
    candidates.flatMap((each) => (each.kind === 'tab' && each.sameKey !== undefined ? [each.sameKey] : [])),
  );
  const seen = new Set<string>();
  return candidates.filter((each) => {
    if (each.kind !== 'tab' && each.sameKey !== undefined && tabKeys.has(each.sameKey)) {
      return false;
    }
    if (seen.has(each.id)) {
      return false;
    }
    seen.add(each.id);
    return true;
  });
}

/** The sources to look in, the terms, and the candidates of each source, for the text typed. */
export function sources(typed: string, input: SourcesInput): Looked {
  if (typed.trim() === '') {
    return { kind: 'nothing-typed' };
  }
  const { prefix, terms } = readText(typed);
  const looked = prefix === undefined ? everySource : [prefix];
  const whole = prefix !== undefined && terms.length === 0;
  const facts = factsOf(input.state);
  const candidates = oneRowEach(looked.flatMap((source) => candidatesOf(input, facts, source, whole)));
  return {
    kind: 'look',
    sources: looked,
    terms,
    candidates: whole ? candidates.slice(0, mostListed) : candidates,
    whole,
  };
}
