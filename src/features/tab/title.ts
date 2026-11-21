/**
 * Feature: tab.title
 *
 * What a tab is called in the strip, in the name of the window and in the lists that name tabs. The title never names
 * the connection: its group does.
 */
import type { ConnectionId, TabId } from '../../shared/ids';
import type { Tab, TabShows } from '../../shared/state/tabs';
import { connectionOfShows } from '../../shared/state/tabs';
import { pageTitle } from '../nav/text';
import { text } from './text';

/** How an `_id` is cut in the middle: its first 4 and last 3 characters (Datardo's choice). */
export const idCut = { first: 4, last: 3 } as const;

/** How the name of a key is cut in the middle: its first 20 and last 11 characters (Datardo's choice). */
export const keyCut = { first: 20, last: 11 } as const;

/** A title, and what is added to it when another tab of the group has the same one. */
export interface TabTitle {
  /** The title as the strip writes it. */
  readonly text: string;
  readonly base: string;
  /** What tells it apart from a tab of the same title: `shop`; absent when the kind of tab has nothing to add. */
  readonly added?: string;
}

/** The names of the saved connections, for the title of a connection form. */
export type ConnectionNames = (connection: ConnectionId) => string | undefined;

/** A text cut in the middle, `first…last`, when it is longer than both and the `…`. */
export function cutInTheMiddle(whole: string, cut: { readonly first: number; readonly last: number }): string {
  const characters = Array.from(whole);
  if (characters.length <= cut.first + cut.last + 1) {
    return whole;
  }
  return `${characters.slice(0, cut.first).join('')}…${characters.slice(-cut.last).join('')}`;
}

/** The `_id` as the title shows it: the hexadecimal of an ObjectId, or the value as the table shows it. */
function idShown(id: string): string {
  const objectId = /^ObjectId\(["']([0-9a-fA-F]{24})["']\)$/u.exec(id);
  return objectId?.[1] ?? id;
}

function lastPart(path: string): string {
  const parts = path.split(/[\\/]/u).filter((part) => part !== '');
  return parts[parts.length - 1] ?? path;
}

function folderOf(path: string): string | undefined {
  const parts = path.split(/[\\/]/u).filter((part) => part !== '');
  return parts.length > 1 ? parts[parts.length - 2] : undefined;
}

function playgroundParts(shows: Extract<TabShows, { kind: 'playground' }>): readonly [string, string?] {
  if (shows.file === undefined) {
    return [shows.title];
  }
  const folder = folderOf(shows.file);
  return folder === undefined ? [lastPart(shows.file)] : [lastPart(shows.file), folder];
}

function appTitle(shows: Extract<TabShows, { kind: 'app' }>, names: ConnectionNames): string {
  if (shows.page !== 'connection-form') {
    return pageTitle(shows.page);
  }
  return shows.edits === undefined
    ? text.titles.newConnection
    : text.titles.editConnection(names(shows.edits) ?? shows.edits);
}

/** The title of what a tab shows, alone, and what is added when two of its group are alike. */
function parts(shows: TabShows, names: ConnectionNames): readonly [string, string?] {
  switch (shows.kind) {
    case 'app':
      return [appTitle(shows, names)];
    case 'collection':
      return [shows.collection, shows.database];
    case 'document':
      // A new document has no `_id` yet: its name, **New document 1**, is shown whole (`document.open`).
      return [
        `${shows.collection} · ${shows.newDocument === undefined ? cutInTheMiddle(idShown(shows.id), idCut) : shows.id}`,
        shows.database,
      ];
    case 'keys':
      if (shows.namespace === undefined) {
        return [shows.database === 0 ? text.titles.keys : `${text.titles.keys} · db${String(shows.database)}`];
      }
      return [shows.namespace, `db${String(shows.database)}`];
    case 'key':
      return [cutInTheMiddle(shows.key, keyCut), `db${String(shows.database)}`];
    case 'playground':
      return playgroundParts(shows);
    case 'console':
      return [text.titles.console];
    case 'page':
      return [shows.database === undefined ? shows.title : `${shows.title} · ${shows.database}`];
  }
}

const noNames: ConnectionNames = () => undefined;

/**
 * Feature: tab.title
 *
 * The title of a tab, given the other tabs of its group: `orders`, or `orders · shop` when another tab of the group is
 * titled `orders` too.
 */
export function tabTitle(tab: TabShows, siblings: readonly TabShows[], names: ConnectionNames = noNames): TabTitle {
  const [base, added] = parts(tab, names);
  const alike = siblings.some((sibling) => sibling !== tab && parts(sibling, names)[0] === base);
  return {
    text: alike && added !== undefined ? `${base} · ${added}` : base,
    base,
    ...(added === undefined ? {} : { added }),
  };
}

/** The title of every tab, by identifier, each told apart from the others of its group. */
export function titledTabs(tabs: readonly Tab[], names: ConnectionNames = noNames): ReadonlyMap<TabId, string> {
  return new Map(
    tabs.map((tab) => {
      const connection = connectionOfShows(tab.shows);
      const siblings = tabs
        .filter((other) => other.id !== tab.id && connectionOfShows(other.shows) === connection)
        .map((other) => other.shows);
      return [tab.id, tabTitle(tab.shows, siblings, names).text];
    }),
  );
}

/** The title of a new playground never saved: **Playground** and the lowest number free in its group. */
export function newPlaygroundTitle(siblings: readonly TabShows[]): string {
  const taken = new Set(
    siblings.flatMap((shows) => (shows.kind === 'playground' && shows.file === undefined ? [shows.title] : [])),
  );
  let number = 1;
  while (taken.has(text.titles.playground(number))) {
    number += 1;
  }
  return text.titles.playground(number);
}
