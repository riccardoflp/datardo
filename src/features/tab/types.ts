/**
 * What the features of the tab area share: what a tab is named in the steps of a plan, the arguments an Operation of
 * the area is started with, and what a tab shows read back from JSON (from the bridge or from `session.json`).
 */
import type { Json } from '../../shared/engine-request';
import type { Answers } from '../../shared/feature';
import { connectionId, tabId, type ConnectionId, type TabId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import type { Tab, TabMemory, TabShows, TabsState } from '../../shared/state/tabs';
import { tabConnectionOf } from '../../shared/state/tabs';
import { pageTitle } from '../nav/text';
import { text } from './text';

/** What the strip shows when its last tab closes and when nothing is restored at start: the Home tab (`home.show`). */
export const tabWhenNoneLeft: TabShows | undefined = { kind: 'app', page: 'home' };

/** The name of a saved connection, or its identifier while the connections are not read. */
export function connectionName(state: AppState, connection: ConnectionId): string {
  return state.connections.saved.find((saved) => saved.id === connection)?.name ?? connection;
}

/** Whether a connection is saved. */
export function isSaved(state: AppState, connection: ConnectionId): boolean {
  return state.connections.saved.some((saved) => saved.id === connection);
}

function shownName(shows: TabShows): string {
  switch (shows.kind) {
    case 'app':
      return pageTitle(shows.page);
    case 'collection':
      return `${shows.database}.${shows.collection}`;
    case 'document':
      return `${shows.database}.${shows.collection} ${shows.id}`;
    case 'keys':
      return shows.namespace === undefined
        ? `db${String(shows.database)}`
        : `${shows.namespace} in db${String(shows.database)}`;
    case 'key':
      return `${shows.key} in db${String(shows.database)}`;
    case 'page':
      return shows.database === undefined ? shows.title : `${shows.title} · ${shows.database}`;
    case 'playground':
      return shows.title;
    case 'console':
      return text.titles.console;
  }
}

/** What a tab is named in the steps of a plan: `shop.orders of Local`, `Settings`. */
export function stepName(state: AppState, shows: TabShows): string {
  const name = shownName(shows);
  return shows.kind === 'app' ? name : text.steps.of(name, connectionName(state, shows.connection));
}

/** A tab by its identifier. */
export function findTab(tabs: TabsState, id: TabId | undefined): Tab | undefined {
  return id === undefined ? undefined : tabs.tabs.find((tab) => tab.id === id);
}

/**
 * The tabs that are shown, in the order of the strip: the tabs of a collapsed group are not, except the active one
 * (`tab.groups`).
 */
export function shownTabs(tabs: TabsState): readonly Tab[] {
  return tabs.tabs.filter((tab) => {
    const connection = tabConnectionOf(tab);
    return connection === undefined || !tabs.collapsed.includes(connection) || tab.id === tabs.active;
  });
}

/** The arguments an Operation was started with: an object, or the variant of a command (`next`, `others`). */
export type StartedWith =
  | { readonly kind: 'object'; readonly args: Readonly<Record<string, Json>> }
  | { readonly kind: 'variant'; readonly variant: string }
  | { readonly kind: 'none' };

/** The arguments of `answers.args`. */
export function startedWith(answers: Answers): StartedWith {
  const args = answers['args'];
  if (typeof args === 'string') {
    return { kind: 'variant', variant: args };
  }
  if (typeof args === 'object' && args !== null && !Array.isArray(args)) {
    return { kind: 'object', args: args as Readonly<Record<string, Json>> };
  }
  return { kind: 'none' };
}

/** The tab an Operation was started on: `args.tab`, or the active tab. */
export function tabOfArgs(tabs: TabsState, answers: Answers): Tab | undefined {
  const started = startedWith(answers);
  const named = started.kind === 'object' ? started.args['tab'] : undefined;
  return findTab(tabs, typeof named === 'string' ? tabId(named) : tabs.active);
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string';
}

function isWhole(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** The fields of an object that are text, among those named. */
function texts<K extends string>(
  object: Readonly<Record<string, unknown>>,
  names: readonly K[],
): Partial<Record<K, string>> {
  return Object.fromEntries(names.flatMap((name) => (isText(object[name]) ? [[name, object[name]]] : []))) as Partial<
    Record<K, string>
  >;
}

function readConnectionShows(
  object: Readonly<Record<string, unknown>>,
  connection: ConnectionId,
): TabShows | undefined {
  const { database } = object;
  switch (object['kind']) {
    case 'collection':
      return isText(database) && isText(object['collection'])
        ? {
            kind: 'collection',
            connection,
            database,
            collection: object['collection'],
            ...(object['view'] === true ? { view: true } : {}),
          }
        : undefined;
    case 'document':
      return isText(database) && isText(object['collection']) && isText(object['id'])
        ? {
            kind: 'document',
            connection,
            database,
            collection: object['collection'],
            id: object['id'],
            ...texts(object, ['idJson']),
          }
        : undefined;
    case 'keys':
      return isWhole(database) && isText(object['separator'])
        ? { kind: 'keys', connection, database, separator: object['separator'], ...texts(object, ['namespace']) }
        : undefined;
    case 'key':
      return isWhole(database) && isText(object['key']) && isText(object['separator'])
        ? {
            kind: 'key',
            connection,
            database,
            key: object['key'],
            separator: object['separator'],
            ...texts(object, ['keyHex']),
          }
        : undefined;
    default:
      return readOtherShows(object, connection);
  }
}

function readOtherShows(object: Readonly<Record<string, unknown>>, connection: ConnectionId): TabShows | undefined {
  switch (object['kind']) {
    case 'page': {
      const of = object['of'];
      const sides = Array.isArray(of) && of.every(isText) ? { of: of as readonly string[] } : {};
      return isText(object['page']) && isText(object['title'])
        ? {
            kind: 'page',
            connection,
            page: object['page'],
            title: object['title'],
            ...texts(object, ['database']),
            ...sides,
          }
        : undefined;
    }
    case 'playground':
      return isText(object['title'])
        ? { kind: 'playground', connection, title: object['title'], ...texts(object, ['file']) }
        : undefined;
    case 'console':
      return { kind: 'console', connection };
    default:
      return undefined;
  }
}

/** What a tab shows, read from JSON; `undefined` when it is not one. Fields that are not part of it are left out. */
export function readTabShows(value: unknown): TabShows | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  if (value['kind'] === 'app') {
    const engine = value['engine'];
    return isText(value['page'])
      ? {
          kind: 'app',
          page: value['page'],
          ...(isText(value['edits']) ? { edits: connectionId(value['edits']) } : {}),
          ...(engine === 'mongodb' || engine === 'redis' ? { engine } : {}),
          ...(isText(value['folder']) ? { folder: value['folder'] } : {}),
        }
      : undefined;
  }
  return isText(value['connection']) ? readConnectionShows(value, connectionId(value['connection'])) : undefined;
}

/** What a tab keeps, read from JSON; `undefined` when nothing is kept. */
export function readMemory(value: unknown): TabMemory | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const memory = texts(value, ['query', 'pipeline', 'pattern', 'typeFilter']);
  return Object.keys(memory).length === 0 ? undefined : memory;
}
