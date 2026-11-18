/**
 * Go to and Home in the main process: `home.json` (data.md), which keeps the recent places (`palette.recent`) and what
 * Home remembers (the engine of its filter, the folders collapsed), loaded at start and written after each change. The
 * places of a connection that is removed go with it (`tab.connection-gone`). Home is the tab shown when no tab is
 * restored at start and when the last tab is gone (`home.show`, D7). It imports nothing of Electron, so that the tests
 * read it.
 */
import type { Json } from '../shared/engine-request';
import type { AppState } from '../shared/state';
import type { EngineChoice, HomeChoices, RecentPlace } from '../shared/state/palette';
import { readRecentPlace, recentKept, withSavedOnly } from '../features/palette/recent';
import { tabWhenNoneLeft } from '../features/tab/types';
import { Store, type JsonObject, type StoredFile } from '../storage/store';
import type { MainServices } from './services';
import { openTab } from './actions/tab';

/** What `home.json` holds. */
export interface HomeFile {
  readonly places: readonly RecentPlace[];
  readonly home: HomeChoices;
}

function isEngineChoice(value: unknown): value is EngineChoice {
  return value === 'all' || value === 'mongodb' || value === 'redis';
}

/** The kind of `home.json`: `{ "version": 1, "places": [{ shows, section?, at }], "engine", "collapsed": [] }`. */
export const homeFile: StoredFile<HomeFile> = {
  path: 'home.json',
  holds: 'The recent places and the choices of Home',
  version: 1,
  migrations: {},
  empty: () => ({ places: [], home: { engine: 'all', collapsed: [] } }),
  read: (object: JsonObject): HomeFile => {
    const places = Array.isArray(object['places']) ? object['places'] : [];
    const collapsed = Array.isArray(object['collapsed']) ? object['collapsed'] : [];
    const engine = object['engine'];
    return {
      places: places
        .map(readRecentPlace)
        .filter((place): place is RecentPlace => place !== undefined)
        .slice(0, recentKept),
      home: {
        engine: isEngineChoice(engine) ? engine : 'all',
        collapsed: collapsed.filter((folder): folder is string => typeof folder === 'string'),
      },
    };
  },
  write: (value: HomeFile): JsonObject => ({
    places: JSON.parse(JSON.stringify(value.places)) as Json,
    engine: value.home.engine,
    collapsed: [...value.home.collapsed],
  }),
};

/** Takes the places of the connections no longer saved out of the list. */
function forgetRemoved(services: MainServices): void {
  const state = services.state.get();
  if (!state.connections.loaded) {
    return;
  }
  const saved = new Set<string>(state.connections.saved.map((connection) => connection.id));
  const recent = withSavedOnly(state.palette.recent, (connection) => saved.has(connection));
  if (recent.length !== state.palette.recent.length) {
    services.state.dispatch({ slice: 'palette', type: 'recent-changed', recent });
  }
}

/** Opens the Home tab when the strip has no tab left (D7): at start with nothing restored, and after the last is gone. */
export function openHomeWhenNoneLeft(services: MainServices): void {
  const state = services.state.get();
  if (tabWhenNoneLeft !== undefined && state.tabs.tabs.length === 0) {
    openTab(services, { shows: tabWhenNoneLeft }, { background: false, visiting: 'visit' });
  }
}

function fileOf(state: AppState): HomeFile {
  return { places: state.palette.recent, home: state.palette.home };
}

/** Loads `home.json` into the state, writes it after each change, and keeps a tab in the strip. */
export async function start(services: MainServices): Promise<void> {
  const store = new Store(services.dataFolder, homeFile, (error) => {
    logLine(services, `The recent places could not be saved: ${String(error)}`);
  });
  try {
    const found = await store.load();
    if (found.kind === 'damaged') {
      logLine(services, `The recent places could not be read and were set aside as ${found.setAsideAs}.`);
    }
  } catch (error: unknown) {
    logLine(services, `The recent places could not be read: ${String(error)}`);
  }
  const loaded = store.get();
  services.state.dispatch({ slice: 'palette', type: 'loaded', recent: loaded.places, home: loaded.home });
  forgetRemoved(services);
  openHomeWhenNoneLeft(services);
  let homeAsked = false;
  services.state.listen((event, state) => {
    if (event.slice === 'palette' && event.type !== 'go-to-asked') {
      store.set(fileOf(state));
    }
    if (event.slice === 'connections' && (event.type === 'loaded' || event.type === 'removed')) {
      forgetRemoved(services);
    }
    // The last tab gone by any way (closed, its connection removed): Home comes back once the change is done.
    if (event.slice === 'tabs' && state.tabs.tabs.length === 0 && !homeAsked) {
      homeAsked = true;
      queueMicrotask(() => {
        homeAsked = false;
        openHomeWhenNoneLeft(services);
      });
    }
  });
  services.onQuit(() => store.flush());
}

function logLine(services: MainServices, text: string): void {
  services.state.dispatch({
    slice: 'runner',
    type: 'logged',
    lines: [{ time: Date.now(), source: 'palette.recent', kind: 'info', text: `[palette.recent] ${text}` }],
  });
}
