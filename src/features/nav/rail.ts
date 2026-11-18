/**
 * Feature: nav.rail
 *
 * The column of icons at the left edge of the window: the ways to the pages of the app, and the switch of the
 * explorer. Each entry says what it starts; the window draws it and sends that intent.
 */
import type { Json } from '../../shared/engine-request';
import { currentOf } from './current-connection';
import { text } from './text';
import type { NavInput } from './types';

/** An entry of the rail. */
export interface RailEntry {
  readonly name: 'home' | 'explorer' | 'search' | 'undo' | 'tasks' | 'settings';
  readonly label: string;
  /** The Codicon drawn for it. */
  readonly icon: string;
  /** The key that starts it, when it has one, as the cards write it. */
  readonly key?: string;
  /** What resting the pointer on it shows: the name and the key, or why it is disabled. */
  readonly tooltip: string;
  readonly marked: boolean;
  readonly disabled: boolean;
  /** The control's identifier, the feature's name at the place `rail`. */
  readonly element: string;
  /** The feature it starts, and with what. */
  readonly feature: string;
  readonly args?: Json;
  readonly position: 'top' | 'bottom';
}

/** The rail. */
export interface RailView {
  readonly label: string;
  readonly entries: readonly RailEntry[];
}

function tooltip(label: string, key?: string): string {
  return key === undefined ? label : `${label} (${key})`;
}

function isPageActive(input: NavInput, page: string): boolean {
  return input.activeTab.kind === 'app' && input.activeTab.page === page;
}

function searchEntry(input: NavInput): RailEntry {
  const current = currentOf(input);
  const base = { name: 'search', label: text.rail.search, icon: 'search', position: 'top' } as const;
  const marked = input.activeTab.kind === 'page' && input.activeTab.page === 'search';
  if (current === undefined) {
    const tip = text.rail.searchNeedsConnection;
    return { ...base, tooltip: tip, marked, disabled: true, element: 'search.show@rail', feature: 'search.show' };
  }
  if (current.engine === 'redis') {
    const tab = input.activeTab;
    const database = (tab.kind === 'keys' || tab.kind === 'key') && tab.connection === current.id ? tab.database : 0;
    return {
      ...base,
      tooltip: text.rail.search,
      marked: tab.kind === 'keys' && tab.namespace === undefined && tab.connection === current.id,
      disabled: false,
      element: 'key.show@rail',
      feature: 'key.show',
      args: { connection: current.id, database, focus: 'pattern' },
    };
  }
  const args = { connection: current.id };
  return {
    ...base,
    tooltip: text.rail.search,
    marked,
    disabled: false,
    element: 'search.show@rail',
    feature: 'search.show',
    args,
  };
}

/** The six entries of the rail, from the top, with which is marked and which is disabled. */
export function view(input: NavInput): RailView {
  const page = (
    name: 'home' | 'undo' | 'tasks' | 'settings',
    label: string,
    icon: string,
    ids: { readonly element: string; readonly feature: string; readonly key?: string },
  ): RailEntry => ({
    name,
    label,
    icon,
    ...(ids.key === undefined ? {} : { key: ids.key }),
    tooltip: tooltip(label, ids.key),
    marked: isPageActive(input, name),
    disabled: false,
    element: ids.element,
    feature: ids.feature,
    position: name === 'settings' ? 'bottom' : 'top',
  });
  const explorer: RailEntry = {
    name: 'explorer',
    label: text.rail.explorer,
    icon: 'list-tree',
    key: 'Ctrl+B',
    tooltip: tooltip(text.rail.explorer, 'Ctrl+B'),
    marked: !input.nav.explorerHidden,
    disabled: false,
    element: 'nav.toggle-explorer@rail',
    feature: 'nav.toggle-explorer',
    position: 'top',
  };
  return {
    label: text.rail.label,
    entries: [
      page('home', text.rail.home, 'home', { element: 'home.show@rail', feature: 'home.show', key: 'Alt+Home' }),
      explorer,
      searchEntry(input),
      page('undo', text.rail.undo, 'history', { element: 'undo.show@rail', feature: 'undo.show' }),
      page('tasks', text.rail.tasks, 'watch', { element: 'task.show@rail', feature: 'task.show' }),
      page('settings', text.rail.settings, 'settings-gear', {
        element: 'settings.page@rail',
        feature: 'settings.page',
        key: 'Ctrl+,',
      }),
    ],
  };
}
