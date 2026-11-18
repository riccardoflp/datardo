/**
 * The tab area in the main process: `session.json` at version 1 (data.md), read at start to restore the tabs
 * (`tab.restore`), and written 1 second after the last change of the tabs and at quit. The tabs of a connection that
 * is no longer saved are closed and forgotten (`tab.connection-gone`). It imports nothing of Electron, so that the
 * tests read it.
 */
import { basename } from 'node:path';
import type { Json } from '../shared/engine-request';
import { featureId, type ConnectionId } from '../shared/ids';
import type { AppState } from '../shared/state';
import type { NavPlace } from '../shared/state/nav';
import { tabConnectionOf, type Draft, type Tab, type TabSeed } from '../shared/state/tabs';
import { appTarget } from '../shared/target';
import { withoutUnreachable } from '../features/nav/back';
import { closedByRemoval } from '../features/tab/connection-gone';
import { emptySession, restoredSession, saveDelayMs, sessionOf, type Session } from '../features/tab/restore';
import { targetKey } from '../features/tab/same-target';
import { pathOf } from '../features/tab/strip';
import { readMemory, readTabShows } from '../features/tab/types';
import { setting } from '../features/settings/read';
import { Store, type JsonObject, type StoredFile } from '../storage/store';
import { notify } from '../runner/notify';
import type { MainServices } from './services';

/** What `session.json` holds: the saved tabs, and the fields of the file this version does not know. */
export interface SessionFile {
  readonly session: Session;
  readonly rest: JsonObject;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readDraft(value: unknown): Draft | undefined {
  if (!isObject(value) || typeof value['text'] !== 'string') {
    return undefined;
  }
  const original = value['original'];
  return { text: value['text'], ...(typeof original === 'string' ? { original } : {}) };
}

/** A saved tab, or `undefined` when it is not one (it is then left out, and the others are kept). */
export function readSeed(value: unknown): TabSeed | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const shows = readTabShows(value['shows']);
  const memory = readMemory(value['memory']);
  const draft = readDraft(value['draft']);
  const section = value['section'];
  return shows === undefined
    ? undefined
    : {
        shows,
        ...(typeof section === 'string' ? { section } : {}),
        ...(memory === undefined ? {} : { memory }),
        ...(draft === undefined ? {} : { draft }),
      };
}

function readSession(object: JsonObject): Session {
  const tabs = object['tabs'];
  if (!Array.isArray(tabs)) {
    throw new Error('session.json has no tabs.');
  }
  const seeds: TabSeed[] = [];
  let active: number | undefined;
  tabs.forEach((value, index) => {
    const seed = readSeed(value);
    if (seed !== undefined) {
      if (index === object['active']) {
        active = seeds.length;
      }
      seeds.push(seed);
    }
  });
  const collapsed = Array.isArray(object['collapsed']) ? object['collapsed'] : [];
  return {
    tabs: seeds,
    ...(active === undefined ? {} : { active }),
    collapsed: collapsed.filter((each): each is string => typeof each === 'string') as unknown as ConnectionId[],
  };
}

const knownFields = new Set(['version', 'tabs', 'active', 'collapsed']);

/** The kind of `session.json`: `{ "version": 1, "tabs": [{ shows, section?, memory?, draft? }], "active"?, "collapsed" }`. */
export const sessionFile: StoredFile<SessionFile> = {
  path: 'session.json',
  holds: 'The open tabs',
  version: 1,
  migrations: {},
  empty: () => ({ session: emptySession, rest: {} }),
  read: (object) => ({
    session: readSession(object),
    rest: Object.fromEntries(Object.entries(object).filter(([name]) => !knownFields.has(name))),
  }),
  write: (value) => ({
    ...value.rest,
    tabs: JSON.parse(JSON.stringify(value.session.tabs)) as Json,
    ...(value.session.active === undefined ? {} : { active: value.session.active }),
    collapsed: [...value.session.collapsed],
  }),
};

/** The place of a tab, for **Back** and **Forward** (`nav.back`). */
export function placeOf(state: AppState, tab: Tab): NavPlace {
  const connection = tabConnectionOf(tab);
  return {
    shows: targetKey(tab.shows, state.app.platform),
    path: pathOf(state, tab.shows),
    ...(tab.shows.kind === 'app' ? { page: tab.shows.page } : {}),
    ...(connection === undefined ? {} : { connection }),
    ...(tab.section === undefined ? {} : { section: tab.section }),
  };
}

/** The store of `session.json`, once the area has started. */
let store: Store<SessionFile> | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

function isRestoreOn(state: AppState): boolean {
  return setting(state.settings, 'datardo.tab.restore');
}

function keepTabs(services: MainServices): void {
  const opened = store;
  if (opened !== undefined) {
    const state = services.state.get();
    opened.set({ session: sessionOf(state.tabs, isRestoreOn(state)), rest: opened.get().rest });
  }
}

/** Saves the open tabs now and waits for the file to be written (`tab.restore`, at quit). */
export async function saveTabsNow(services: MainServices): Promise<void> {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
  keepTabs(services);
  await store?.flush();
}

function saveSoon(services: MainServices): void {
  if (timer !== undefined) {
    clearTimeout(timer);
  }
  timer = setTimeout(() => {
    timer = undefined;
    keepTabs(services);
  }, saveDelayMs);
}

/** The connections that are saved, when they were read. */
function savedConnections(state: AppState): ((connection: ConnectionId) => boolean) | undefined {
  return state.connections.loaded
    ? (connection) => state.connections.saved.some((saved) => saved.id === connection)
    : undefined;
}

/** Opens the saved tabs, as `tab.restore` says, with the active one as the first place of **Back**. */
export function openSavedTabs(services: MainServices): Promise<void> {
  const state = services.state.get();
  const session = restoredSession(store?.get().session ?? emptySession, isRestoreOn(state), savedConnections(state));
  services.state.dispatch({ slice: 'tabs', type: 'restored', ...session, at: Date.now() });
  const now = services.state.get();
  const active = now.tabs.tabs.find((tab) => tab.id === now.tabs.active);
  if (active !== undefined) {
    const place = placeOf(now, active);
    services.state.dispatch({
      slice: 'nav',
      type: 'changed',
      nav: {
        history: { places: [place], index: 0 },
        ...(place.connection === undefined ? {} : { current: place.connection }),
      },
    });
  }
  return Promise.resolve();
}

/** Closes the tabs of the connections that are not saved, forgets them, and takes their places out of **Back**. */
function forgetRemoved(services: MainServices): void {
  const state = services.state.get();
  const isSaved = savedConnections(state);
  if (isSaved === undefined) {
    return;
  }
  const gone = new Set<ConnectionId>();
  for (const tab of state.tabs.tabs) {
    if (tab.shows.kind !== 'app' && !isSaved(tab.shows.connection)) {
      gone.add(tab.shows.connection);
    }
  }
  for (const connection of gone) {
    for (const tab of closedByRemoval(services.state.get(), connection).tabs) {
      services.state.dispatch({ slice: 'tabs', type: 'closed', tab: tab.id, at: Date.now() });
    }
    services.state.dispatch({ slice: 'tabs', type: 'connection-removed', connection, at: Date.now() });
  }
  const reachable = state.connections.saved.map((saved) => ({
    id: saved.id,
    name: saved.name,
    engine: saved.engine,
    readOnly: saved.readOnly,
    status: { kind: 'not-connected' } as const,
  }));
  services.state.dispatch({
    slice: 'nav',
    type: 'changed',
    nav: { history: withoutUnreachable(state.nav.history, reachable) },
  });
}

function tellAboutTheFile(services: MainServices, found: Awaited<ReturnType<Store<SessionFile>['load']>>): void {
  const ports = { state: services.state, now: () => Date.now() };
  if (found.kind === 'newer') {
    notify(ports, {
      feature: featureId('tab.restore'),
      level: 'warning',
      text: 'This data was written by a newer version of Datardo. Changes to the open tabs are not saved until Datardo is updated.',
    });
  } else if (found.kind === 'damaged') {
    notify(ports, {
      feature: featureId('tab.restore'),
      level: 'warning',
      text: `The open tabs could not be read and was set aside as ${basename(found.setAsideAs)}.`,
      actions: [{ label: 'Open data folder', feature: featureId('window.open-data-folder'), target: appTarget }],
    });
  }
}

/** Restores the tabs, then saves them after each change and at quit. */
export async function start(services: MainServices): Promise<void> {
  const ports = { state: services.state, now: () => Date.now() };
  const opened = new Store(services.dataFolder, sessionFile, (error: unknown) => {
    notify(ports, {
      feature: featureId('tab.restore'),
      level: 'error',
      text: `The open tabs could not be saved: ${String(error)}`,
    });
  });
  store = opened;
  try {
    tellAboutTheFile(services, await opened.load());
  } catch (error: unknown) {
    // An unreadable data folder never stops Datardo (data.md): it starts with no tab restored, and says why.
    notify(ports, {
      feature: featureId('tab.restore'),
      level: 'error',
      text: `The open tabs could not be read: ${String(error)}`,
    });
  }
  await openSavedTabs(services);
  services.state.listen((event) => {
    if (event.slice === 'tabs' || (event.slice === 'settings' && event.type === 'changed')) {
      saveSoon(services);
    }
    if (event.slice === 'connections' && (event.type === 'loaded' || event.type === 'removed')) {
      forgetRemoved(services);
    }
  });
  services.onQuit(() => saveTabsNow(services));
}
