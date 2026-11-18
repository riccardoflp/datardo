/**
 * Feature: palette.recent
 *
 * The things used last, most recent first: what Go to lists before anything is typed, and what Home offers under
 * **Jump back in**. A place is added, or moved to the front, each time a tab of a connection becomes active; the list
 * keeps 50 and holds names only. Nothing is asked of a deployment: the list is in Datardo's own data.
 */
import type { ConnectionColor } from '../../shared/connection';
import type { Json } from '../../shared/engine-request';
import type { Context, Platform, ReadRequest } from '../../shared/feature';
import type { ConnectionId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { savedConnection } from '../../shared/state/connections';
import type { RecentPlace } from '../../shared/state/palette';
import { activeTabOf, connectionOfShows, type TabShows } from '../../shared/state/tabs';
import { pathSegments } from '../nav/path';
import type { SavedConnection } from '../nav/types';
import { targetKey } from '../tab/same-target';
import { iconOf } from '../tab/strip';
import { tabTitle } from '../tab/title';
import { readTabShows } from '../tab/types';

/** How many recent places are kept, across starts (Datardo's choice). */
export const recentKept = 50;

/** How many Go to lists with nothing typed (Datardo's choice). */
export const recentInGoTo = 12;

/** The app read that answers with the stored list. */
export const recentAction = 'palette.recent';

/** A recent place as Go to and Home show it. */
export interface RecentEntry {
  readonly place: RecentPlace;
  /** What it shows, as `tab.same-target` compares it. */
  readonly key: string;
  /** Its title, as the strip would write it (`tab.title`). */
  readonly title: string;
  readonly icon: string;
  readonly connection: {
    readonly id: ConnectionId;
    readonly name: string;
    readonly color?: ConnectionColor;
  };
  /** Its path as the scope bar writes it: `Local / shop / orders`. */
  readonly path: string;
  /** The same without the connection: `shop / orders`. */
  readonly pathInConnection: string;
  /** Where it is, as Go to writes the context of a row: the path without its last part, `Local / shop`. */
  readonly context: string;
}

/** Whether what a tab shows can be a recent place: never a tab of the app, nor a playground never saved. */
export function isRecentPlace(shows: TabShows): boolean {
  if (shows.kind === 'app') {
    return false;
  }
  return shows.kind !== 'playground' || shows.file !== undefined;
}

/** The list with a place at its front, once, and no more than {@link recentKept}. */
export function withPlace(
  recent: readonly RecentPlace[],
  place: RecentPlace,
  platform: Platform,
): readonly RecentPlace[] {
  if (!isRecentPlace(place.shows)) {
    return recent;
  }
  const key = targetKey(place.shows, platform);
  const others = recent.filter((each) => targetKey(each.shows, platform) !== key);
  return [place, ...others].slice(0, recentKept);
}

/** The list without the places of some keys (`home.forget-recent`). */
export function withoutPlaces(
  recent: readonly RecentPlace[],
  keys: readonly string[],
  platform: Platform,
): readonly RecentPlace[] {
  return recent.filter((each) => !keys.includes(targetKey(each.shows, platform)));
}

/** The list without the places of the connections that are not saved (`tab.connection-gone`). */
export function withSavedOnly(
  recent: readonly RecentPlace[],
  isSaved: (connection: ConnectionId) => boolean,
): readonly RecentPlace[] {
  return recent.filter((each) => {
    const connection = connectionOfShows(each.shows);
    return connection !== undefined && isSaved(connection);
  });
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A stored place, or `undefined` when it is not one (it is then left out, and the others are kept). */
export function readRecentPlace(value: unknown): RecentPlace | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const shows = readTabShows(value['shows']);
  const at = value['at'];
  const section = value['section'];
  if (shows === undefined || !isRecentPlace(shows) || typeof at !== 'number' || !Number.isFinite(at)) {
    return undefined;
  }
  return { shows, at, ...(typeof section === 'string' ? { section } : {}) };
}

/** Asks Datardo's own data for the list. Nothing is sent to a deployment. */
export function request(_context: Context, _args: Json): ReadRequest {
  return { kind: 'app', action: recentAction, args: null };
}

/** The places of the reply, most recent first, at most {@link recentKept}; what is not a place is left out. */
export function parse(replies: readonly unknown[]): readonly RecentPlace[] {
  const [list] = replies;
  return Array.isArray(list)
    ? list
        .flatMap((value) => {
          const place = readRecentPlace(value);
          return place === undefined ? [] : [place];
        })
        .slice(0, recentKept)
    : [];
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

/** A place as Go to and Home show it, with the name and the color its connection has now. */
export function entryOf(state: AppState, place: RecentPlace): RecentEntry | undefined {
  const id = connectionOfShows(place.shows);
  const saved = id === undefined ? undefined : savedConnection(state.connections, id);
  if (id === undefined || saved === undefined) {
    return undefined;
  }
  const names = (connection: ConnectionId): string | undefined => savedConnection(state.connections, connection)?.name;
  const segments = pathSegments(place.shows, pathConnections(state)).map((segment) => segment.label);
  return {
    place,
    key: targetKey(place.shows, state.app.platform),
    title: tabTitle(place.shows, [], names).text,
    icon: iconOf(place.shows),
    connection: { id, name: saved.name, ...(saved.color === undefined ? {} : { color: saved.color }) },
    path: segments.join(' / '),
    pathInConnection: segments.slice(1).join(' / '),
    context: segments.slice(0, -1).join(' / '),
  };
}

/** Every recent place of a saved connection, most recent first. */
export function recentEntries(state: AppState): readonly RecentEntry[] {
  return parse([state.palette.recent]).flatMap((place) => {
    const entry = entryOf(state, place);
    return entry === undefined ? [] : [entry];
  });
}

/** What Go to lists under **Recent**: the first 12, leaving out what the active tab shows. */
export function recentInGoToOf(state: AppState): readonly RecentEntry[] {
  const active = activeTabOf(state.tabs);
  const activeKey = active === undefined ? undefined : targetKey(active.shows, state.app.platform);
  return recentEntries(state)
    .filter((entry) => entry.key !== activeKey)
    .slice(0, recentInGoTo);
}
