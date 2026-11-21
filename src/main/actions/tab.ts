/**
 * The actions of the tab area the runner carries out for app steps: they change the tabs through the one reducer, and
 * make the rest of the window follow the active tab: its connection becomes the current one and a place is added for
 * **Back** (`tab.activate`, `nav.back`).
 */
import type { Json } from '../../shared/engine-request';
import { connectionId, featureId, tabId, type TabId } from '../../shared/ids';
import { activeTabOf, tabConnectionOf, type Draft, type Tab, type TabSeed } from '../../shared/state/tabs';
import { visit } from '../../features/nav/back';
import { targetKey } from '../../features/tab/same-target';
import { readMemory, readTabShows } from '../../features/tab/types';
import type { MainServices } from '../services';
import { openSavedTabs, placeOf, saveTabsNow } from '../tabs';
import { rememberPlace } from './palette';
import type { AreaActions } from '.';

function field(args: Json, name: string): Json | undefined {
  return typeof args === 'object' && args !== null && !Array.isArray(args)
    ? (args as { readonly [key: string]: Json })[name]
    : undefined;
}

function tabOf(services: MainServices, args: Json): Tab {
  const id = field(args, 'tab');
  const tab = typeof id === 'string' ? services.state.get().tabs.tabs.find((each) => each.id === id) : undefined;
  if (tab === undefined) {
    throw new Error('That tab is not open.');
  }
  return tab;
}

/** Whether a change of the active tab adds a place for **Back**: not when Back and Forward themselves move. */
export type Visiting = 'visit' | 'without-visit';

/**
 * Makes the window follow the active tab when it changed: its connection becomes current (a tab of the app leaves the
 * current connection as it is), its place is visited, and a tab of a connection becomes a recent place
 * (`palette.remember-place`).
 */
export function followActive(services: MainServices, before: TabId | undefined, visiting: Visiting): void {
  const state = services.state.get();
  const active = activeTabOf(state.tabs);
  if (active === undefined || active.id === before) {
    return;
  }
  const connection = tabConnectionOf(active);
  services.state.dispatch({
    slice: 'nav',
    type: 'changed',
    nav: {
      ...(visiting === 'visit' ? { history: visit(state.nav.history, placeOf(state, active)) } : {}),
      ...(connection === undefined ? {} : { current: connection }),
    },
  });
  rememberPlace(services, active);
}

/** How a tab is opened. */
export interface Opening {
  readonly background: boolean;
  /** Its place in its group, for a tab reopened. */
  readonly place?: number;
  readonly visiting: Visiting;
}

/** Opens a tab, or makes the tab that shows the same thing active and gives it what came with the request. */
export function openTab(services: MainServices, seed: TabSeed, opening: Opening): void {
  const state = services.state.get();
  const before = state.tabs.active;
  const key = targetKey(seed.shows, state.app.platform);
  const open = state.tabs.tabs.find((tab) => targetKey(tab.shows, state.app.platform) === key);
  const at = Date.now();
  if (open === undefined) {
    services.state.dispatch({
      slice: 'tabs',
      type: 'opened',
      seed,
      key,
      background: opening.background,
      ...(opening.place === undefined ? {} : { place: opening.place }),
      at,
    });
  } else {
    if (seed.section !== undefined || seed.memory !== undefined) {
      services.state.dispatch({
        slice: 'tabs',
        type: 'changed',
        tab: open.id,
        ...(seed.section === undefined ? {} : { section: seed.section }),
        ...(seed.memory === undefined ? {} : { memory: seed.memory }),
      });
    }
    if (!opening.background) {
      services.state.dispatch({ slice: 'tabs', type: 'activated', tab: open.id, at });
    }
  }
  followActive(services, before, opening.visiting);
}

/** Makes a tab active. */
export function activateTab(services: MainServices, id: TabId, visiting: Visiting): void {
  const before = services.state.get().tabs.active;
  services.state.dispatch({ slice: 'tabs', type: 'activated', tab: id, at: Date.now() });
  followActive(services, before, visiting);
}

/** Closes a tab; it is remembered for **Reopen closed tab** unless forgotten, or a playground never saved. */
export function closeTab(services: MainServices, tab: Tab, remembered: 'remember' | 'forget'): void {
  const state = services.state.get();
  const before = state.tabs.active;
  const neverSaved = tab.shows.kind === 'playground' && tab.shows.file === undefined;
  const key = remembered === 'remember' && !neverSaved ? targetKey(tab.shows, state.app.platform) : undefined;
  services.state.dispatch({
    slice: 'tabs',
    type: 'closed',
    tab: tab.id,
    ...(key === undefined ? {} : { key }),
    at: Date.now(),
  });
  followActive(services, before, 'visit');
}

function seedOf(args: Json): TabSeed {
  const shows = readTabShows(field(args, 'shows'));
  if (shows === undefined) {
    throw new Error('The action needs what the tab shows.');
  }
  const section = field(args, 'section');
  const memory = readMemory(field(args, 'memory'));
  const draft = draftOf(field(args, 'draft'));
  return {
    shows,
    ...(typeof section === 'string' ? { section } : {}),
    ...(memory === undefined ? {} : { memory }),
    ...(draft === undefined ? {} : { draft }),
  };
}

function draftOf(value: Json | undefined): Draft | undefined {
  const text = field(value ?? null, 'text');
  const original = field(value ?? null, 'original');
  if (typeof text !== 'string') {
    return undefined;
  }
  return typeof original === 'string' ? { text, original } : { text };
}

/** Keeps the draft of a tab, or drops it once the tab has no unsaved changes (`tab.restore`, D33). */
function keepDraft(services: MainServices, args: Json): Promise<void> {
  const tab = tabOf(services, args);
  const draft = draftOf(field(args, 'draft'));
  services.state.dispatch({
    slice: 'tabs',
    type: 'changed',
    tab: tab.id,
    unsaved: draft !== undefined,
    draft: draft ?? null,
  });
  return Promise.resolve();
}

/**
 * Saves a tab before it closes (`tab.close`, **Save**): the save of its page, as `Ctrl+S` there; a refusal or a
 * failure stops the plan, and the tab stays open with its changes.
 */
async function saveTab(services: MainServices, args: Json): Promise<void> {
  const tab = tabOf(services, args);
  const shows = tab.shows;
  if (shows.kind !== 'document') {
    throw new Error('Datardo cannot save this tab.');
  }
  const feature = shows.newDocument === undefined ? 'document.save' : 'document.insert-from-tab';
  const result = await services.start({
    feature: featureId(feature),
    target: {
      kind: 'collection',
      connection: shows.connection,
      database: shows.database,
      collection: shows.collection,
    },
    args: { tab: tab.id },
  });
  if (result.kind !== 'done') {
    throw new Error(result.kind === 'failed' || result.kind === 'refused' ? result.message : 'Not saved.');
  }
  services.state.dispatch({ slice: 'tabs', type: 'changed', tab: tab.id, unsaved: false, draft: null });
}

function open(services: MainServices, args: Json): Promise<void> {
  const place = field(args, 'place');
  openTab(services, seedOf(args), {
    background: field(args, 'background') === true,
    ...(typeof place === 'number' ? { place } : {}),
    visiting: 'visit',
  });
  return Promise.resolve();
}

function activate(services: MainServices, args: Json): Promise<void> {
  const tab = tabOf(services, args);
  const section = field(args, 'section');
  const memory = readMemory(field(args, 'memory'));
  if (typeof section === 'string' || memory !== undefined) {
    services.state.dispatch({
      slice: 'tabs',
      type: 'changed',
      tab: tab.id,
      ...(typeof section === 'string' ? { section } : {}),
      ...(memory === undefined ? {} : { memory }),
    });
  }
  activateTab(services, tab.id, 'visit');
  return Promise.resolve();
}

function dispatchOnly(services: MainServices, change: () => void): Promise<void> {
  change();
  return Promise.resolve();
}

/** The actions of this area, by name. */
export const actions: AreaActions = (services) => ({
  'tab.open': (args) => open(services, args),
  'tab.activate': (args) => activate(services, args),
  'tab.close': (args) =>
    dispatchOnly(services, () => {
      closeTab(services, tabOf(services, args), field(args, 'forget') === true ? 'forget' : 'remember');
    }),
  'tab.move': (args) =>
    dispatchOnly(services, () => {
      const to = field(args, 'to');
      services.state.dispatch({
        slice: 'tabs',
        type: 'moved',
        tab: tabId(tabOf(services, args).id),
        to: typeof to === 'number' ? to : 0,
      });
    }),
  'tab.collapse': (args) =>
    dispatchOnly(services, () => {
      const connection = field(args, 'connection');
      if (typeof connection !== 'string') {
        throw new Error('The action needs the connection of the group.');
      }
      services.state.dispatch({
        slice: 'tabs',
        type: 'collapsed',
        connection: connectionId(connection),
        collapsed: field(args, 'collapsed') === true,
      });
    }),
  'tab.save-session': () => saveTabsNow(services),
  'tab.keep-draft': (args) => keepDraft(services, args),
  'tab.save': (args) => saveTab(services, args),
  'tab.open-saved': () => openSavedTabs(services),
});
