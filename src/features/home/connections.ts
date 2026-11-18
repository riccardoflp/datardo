/**
 * Feature: home.connections
 *
 * Every saved connection in its folder: first those in no folder, under no heading; then a group for each folder, the
 * folders sorted by name, with the number of their cards shown. A folder with no card left after the filter is not
 * shown; while a filter is on, every group with a card left is expanded.
 */
import type { ConnectionView } from '../../shared/connection';
import type { AppState } from '../../shared/state';
import { currentConnection } from '../nav/current-connection';
import { navInput } from '../nav/types';
import { view as cardView, type CardView } from './card';
import { filterConnections, type Filtered } from './filter';
import { text } from './text';

/** A group of cards: the loose ones (no folder) or the cards of one folder. */
export interface CardGroup {
  /** The folder; none for the connections in no folder, which have no heading. */
  readonly folder?: string;
  /** The heading: the name of the folder and the number of its cards shown (`Live 1`). */
  readonly heading?: string;
  readonly count: number;
  readonly collapsed: boolean;
  /** The cards; empty while the group is collapsed. */
  readonly cards: readonly CardView[];
  readonly menuLabel?: string;
}

/** **Connections**, with the filter applied. */
export interface ConnectionsView {
  readonly heading: string;
  readonly groups: readonly CardGroup[];
  readonly filtered: Filtered;
  /** *No connection matches "\<text\>".*, when the filter leaves no card. */
  readonly noMatch?: string;
}

/** What the part is drawn from: the app's state, and the text typed in the filter (which is not remembered). */
export interface ConnectionsInput {
  readonly state: AppState;
  readonly typed: string;
}

function byFolder(shown: readonly ConnectionView[]): ReadonlyMap<string, readonly ConnectionView[]> {
  const folders = new Map<string, ConnectionView[]>();
  for (const connection of shown) {
    if (connection.folder !== undefined && connection.folder !== '') {
      folders.set(connection.folder, [...(folders.get(connection.folder) ?? []), connection]);
    }
  }
  return folders;
}

function byName(first: string, second: string): number {
  return first.localeCompare(second, 'en', { sensitivity: 'base', numeric: true }) || first.localeCompare(second);
}

/** The groups of **Connections**, in order, with the cards each shows. */
export function view(input: ConnectionsInput): ConnectionsView {
  const { state, typed } = input;
  const filtered = filterConnections(typed, state.palette.home.engine, state.connections.saved);
  const nav = navInput(state);
  const current = currentConnection(nav.activeTab, nav.nav.current, nav.connections)?.id;
  const card = (connection: ConnectionView): CardView =>
    cardView({ connections: state.connections, current, connection });
  const filtering = typed.trim() !== '';
  const loose = filtered.shown.filter((connection) => connection.folder === undefined || connection.folder === '');
  const folders = byFolder(filtered.shown);
  const groups: CardGroup[] =
    loose.length === 0 ? [] : [{ count: loose.length, collapsed: false, cards: loose.map(card) }];
  for (const folder of [...folders.keys()].sort(byName)) {
    const members = folders.get(folder) ?? [];
    const collapsed = !filtering && state.palette.home.collapsed.includes(folder);
    groups.push({
      folder,
      heading: text.connections.folder(folder, members.length),
      count: members.length,
      collapsed,
      cards: collapsed ? [] : members.map(card),
      menuLabel: text.connections.folderMenu(folder),
    });
  }
  return {
    heading: text.connections.heading,
    groups,
    filtered,
    ...(filtered.shown.length === 0 && state.connections.saved.length > 0
      ? { noMatch: text.filter.noMatch(typed.trim()) }
      : {}),
  };
}
