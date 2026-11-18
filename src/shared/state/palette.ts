/**
 * The part of the app's state that Go to and Home share (palette.md, home.md): the recent places, kept across starts
 * (`palette.recent`); how many times the main process asked the window to open Go to (the menu bar on macOS); and what
 * Home remembers across starts: the engine chosen in its filter (`home.filter`) and the folders collapsed
 * (`home.connections`). The text of the filter and of Go to is the window's own state.
 */
import type { TabShows } from './tabs';

/** A recent place: what a tab of a connection showed when it was last made active, and when. Names only, no text. */
export interface RecentPlace {
  readonly shows: TabShows;
  /** The section it showed, for a page that has several. */
  readonly section?: string;
  /** When it was last made active, in milliseconds since 1970. */
  readonly at: number;
}

/** The engines of the filter of Home: **All**, **MongoDB**, **Redis**. */
export type EngineChoice = 'all' | 'mongodb' | 'redis';

/** What Home remembers across starts. */
export interface HomeChoices {
  readonly engine: EngineChoice;
  /** The folders whose group is collapsed, by name. */
  readonly collapsed: readonly string[];
}

/** What the main process asked of Go to: open it, with a prefix typed (`>`, `=`), for the menu bar on macOS. */
export interface GoToAsk {
  readonly count: number;
  readonly prefix: string;
}

/** This part of the state. */
export interface PaletteState {
  /** Whether the recent places and Home's choices were read from the data folder. */
  readonly loaded: boolean;
  /** Most recent first. */
  readonly recent: readonly RecentPlace[];
  readonly home: HomeChoices;
  readonly goToAsked: GoToAsk;
}

/** The events of this part of the state. */
export type PaletteEvent =
  | {
      readonly slice: 'palette';
      readonly type: 'loaded';
      readonly recent: readonly RecentPlace[];
      readonly home: HomeChoices;
    }
  | { readonly slice: 'palette'; readonly type: 'recent-changed'; readonly recent: readonly RecentPlace[] }
  | { readonly slice: 'palette'; readonly type: 'home-changed'; readonly home: Partial<HomeChoices> }
  | { readonly slice: 'palette'; readonly type: 'go-to-asked'; readonly prefix: string };

/** Nothing read yet: no recent place, every engine, no folder collapsed. */
export const initialPaletteState: PaletteState = {
  loaded: false,
  recent: [],
  home: { engine: 'all', collapsed: [] },
  goToAsked: { count: 0, prefix: '' },
};

/** Changes this part of the state. */
export function reducePalette(state: PaletteState, event: PaletteEvent): PaletteState {
  switch (event.type) {
    case 'loaded':
      return { ...state, loaded: true, recent: event.recent, home: event.home };
    case 'recent-changed':
      return { ...state, recent: event.recent };
    case 'home-changed':
      return { ...state, home: { ...state.home, ...event.home } };
    case 'go-to-asked':
      return { ...state, goToAsked: { count: state.goToAsked.count + 1, prefix: event.prefix } };
  }
}
