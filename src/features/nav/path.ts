/**
 * Feature: nav.path
 *
 * The path of the active tab in the scope bar: one segment for each level, separated by `/`; a click on a segment
 * opens a menu of what could be in its place. When it does not fit, the segments between the connection and the last
 * one become `…`.
 */
import { pageTitle } from './text';
import { findConnection, type NavInput, type SavedConnection, type TabShows } from './types';

/** The menu a segment opens, or `none` for a segment that is not a button. */
export type SegmentMenu =
  'connection' | 'mongodb-database' | 'redis-database' | 'collection' | 'namespace' | 'page' | 'none';

/** One segment of the path. */
export interface PathSegment {
  readonly label: string;
  readonly menu: SegmentMenu;
  /** A view shows the view's icon before its name. */
  readonly view?: boolean;
}

/** The path as the scope bar draws it. */
export interface PathView {
  /** The whole path, as a screen reader says it: `Local / shop / orders`. */
  readonly label: string;
  readonly segments: readonly PathSegment[];
}

/** The levels of a namespace, each with its separator: `orders:2026:` gives `orders:` and `2026:`. */
export function namespaceLevels(namespace: string, separator: string): readonly string[] {
  if (separator === '') {
    return [namespace];
  }
  const parts = namespace.split(separator);
  return parts.slice(0, -1).map((part) => `${part}${separator}`);
}

function connectionSegment(connection: SavedConnection | undefined, fallback: string): PathSegment {
  return { label: connection?.name ?? fallback, menu: 'connection' };
}

/** The segments of the path of what a tab shows. */
export function pathSegments(tab: TabShows, connections: readonly SavedConnection[]): readonly PathSegment[] {
  if (tab.kind === 'app') {
    return [{ label: pageTitle(tab.page), menu: 'none' }];
  }
  const first = connectionSegment(findConnection(connections, tab.connection), tab.connection);
  switch (tab.kind) {
    case 'collection':
      return [
        first,
        { label: tab.database, menu: 'mongodb-database' },
        { label: tab.collection, menu: 'collection', ...(tab.view === true ? { view: true } : {}) },
      ];
    case 'document':
      return [
        first,
        { label: tab.database, menu: 'mongodb-database' },
        { label: tab.collection, menu: 'collection' },
        { label: tab.id, menu: 'none' },
      ];
    case 'keys':
      return [first, ...redisLevels(tab.database, tab.namespace ?? '', tab.separator)];
    case 'key': {
      const levels = namespaceLevels(tab.key, tab.separator);
      const rest = tab.key.slice(levels.join('').length);
      return [first, ...redisLevels(tab.database, levels.join(''), tab.separator), { label: rest, menu: 'none' }];
    }
    case 'page':
      return tab.database === undefined
        ? [first, { label: tab.title, menu: 'page' }]
        : [first, { label: tab.database, menu: 'mongodb-database' }, { label: tab.title, menu: 'page' }];
    case 'playground':
      return [first, { label: tab.title, menu: 'none' }];
    case 'console':
      return [first, { label: 'Console', menu: 'page' }];
  }
}

function redisLevels(database: number, namespace: string, separator: string): readonly PathSegment[] {
  const levels = namespace === '' ? [] : namespaceLevels(namespace, separator);
  return [
    { label: `db${String(database)}`, menu: 'redis-database' },
    ...levels.map((level): PathSegment => ({ label: level, menu: 'namespace' })),
  ];
}

/** The path when it does not fit: the first and the last segment, and `…` for those between, which it lists. */
export function shortenedPath(segments: readonly PathSegment[]): {
  readonly shown: readonly PathSegment[];
  readonly hidden: readonly PathSegment[];
} {
  if (segments.length <= 2) {
    return { shown: segments, hidden: [] };
  }
  return {
    shown: [segments[0] as PathSegment, segments[segments.length - 1] as PathSegment],
    hidden: segments.slice(1, -1),
  };
}

/** The path of the active tab. */
export function view(input: NavInput): PathView {
  const segments = pathSegments(input.activeTab, input.connections);
  return { label: segments.map((segment) => segment.label).join(' / '), segments };
}
