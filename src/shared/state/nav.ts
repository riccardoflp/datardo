/**
 * The part of the app's state about getting around (the cards of nav.md): which islands the user hid and how wide
 * they are, the connection made current last, the page the main island shows until tabs exist, the places visited for
 * Back and Forward, the pins of each connection and the latency of the current connection.
 */
import type { Json } from '../engine-request';
import type { ConnectionId } from '../ids';

/** The widths the user gave the explorer and the inspector island, in px (`nav.resize`). */
export interface IslandWidths {
  readonly explorer: number;
  readonly inspector: number;
}

/** The widths before the user changes them: 280 and 360 px (`nav.resize`, Datardo's choice). */
export const defaultIslandWidths: IslandWidths = { explorer: 280, inspector: 360 };

/**
 * A place visited (`nav.back`): what a tab shows and which of its sections, not the tab itself. Until tabs exist (M4)
 * the places are the pages of the app shown in the main island.
 */
export interface NavPlace {
  /** What the tab shows, as `tab.same-target` compares it: `page:settings`. */
  readonly shows: string;
  /** The path of the place, as the plan's step writes it: `Settings`, `Local / shop / orders`. */
  readonly path: string;
  /** The page of the app the place shows, for a place of the app. */
  readonly page?: string;
  /** The connection the place belongs to, when it belongs to one. */
  readonly connection?: ConnectionId;
  /** The section shown, for a tab that has several (`Documents`, `Indexes`). */
  readonly section?: string;
}

/** The places visited in this run, and which one is shown (`nav.back`). */
export interface NavHistory {
  readonly places: readonly NavPlace[];
  readonly index: number;
}

/** Something of a connection the user pinned (`nav.pin`). */
export type Pin =
  | { readonly kind: 'collection'; readonly database: string; readonly collection: string; readonly view?: boolean }
  | { readonly kind: 'namespace'; readonly database: number; readonly namespace: string }
  /** A key: its name as the hexadecimal of its bytes, so that a name that is not text survives. */
  | { readonly kind: 'key'; readonly database: number; readonly keyHex: string }
  | { readonly kind: 'page'; readonly page: string; readonly title: string; readonly database?: string }
  /**
   * A saved query (`saved-query.connection-list`): for one for me, its name and the query itself; for one in the
   * folder, the path of its file inside the queries folder, so that the pin follows the file and goes with it.
   */
  | {
      readonly kind: 'saved-query';
      readonly database: string;
      readonly collection: string;
      readonly name: string;
      readonly place?: 'me' | 'folder';
      readonly file?: string;
      readonly query?: Json;
    };

/** The last latency read for a connection (`nav.ping`): in milliseconds, or no answer. */
export interface Latency {
  readonly connection: ConnectionId;
  readonly milliseconds?: number;
}

/** What the nav area keeps. */
export interface NavState {
  /** The connection made current last (`nav.current-connection`). */
  readonly current?: ConnectionId | undefined;
  /** Whether the user hid the explorer (`nav.toggle-explorer`), not whether a narrow window hides it. */
  readonly explorerHidden: boolean;
  /** Whether the user hid the inspector island (`nav.toggle-inspector`). */
  readonly inspectorHidden: boolean;
  readonly widths: IslandWidths;
  /** The page of the app the main island shows, until the tabs of M4 take its place: `home`, `settings`, `log`. */
  readonly page: string;
  readonly history: NavHistory;
  /** The pins of each connection, in the user's order, by connection id. */
  readonly pins: Readonly<Record<string, readonly Pin[]>>;
  readonly latency?: Latency | undefined;
}

/** The events of this part of the state: the fields given replace those of the state. */
export type NavEvent = { readonly slice: 'nav'; readonly type: 'changed'; readonly nav: Partial<NavState> };

/** The place of the Home page, the first of every run. */
export const homePlace: NavPlace = { shows: 'page:home', path: 'Home', page: 'home' };

/** Every island shown at its default width, no connection current, Home in the main island. */
export const initialNavState: NavState = {
  explorerHidden: false,
  inspectorHidden: false,
  widths: defaultIslandWidths,
  page: 'home',
  history: { places: [homePlace], index: 0 },
  pins: {},
};

/** Changes this part of the state. */
export function reduceNav(state: NavState, event: NavEvent): NavState {
  return { ...state, ...event.nav };
}
