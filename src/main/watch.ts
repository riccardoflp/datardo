/**
 * The Watch changes pages in the main process (watch.md): one {@link WatchStreams} for the run, whose actions the
 * runner carries out, and what follows the tabs. A tab of the page just opened gets its page and its stream; a tab
 * restored at start gets its page, stopped (`tab.restore`: Datardo opens no stream by itself at start); a tab closed
 * loses its page and its stream. A plan that asked the open pages to read again (`watch.enable-pre-images`) makes the
 * pages of its connection read again whether their collection records pre-images.
 */
import type { AppEvent, AppState } from '../shared/state';
import { connectionEngines } from './connections';
import type { MainServices } from './services';
import { watchedOfTab } from './watch-facts';
import { WatchStreams } from './watch-streams';

const made = new WeakMap<MainServices, WatchStreams>();

/** The streams of the run. */
export function watchStreamsOf(services: MainServices): WatchStreams {
  const found = made.get(services);
  if (found !== undefined) {
    return found;
  }
  const streams = new WatchStreams({
    engines: connectionEngines,
    state: services.state,
    now: () => Date.now(),
    platform: services.platform,
  });
  made.set(services, streams);
  return streams;
}

/** Gives a page to each tab of the page that has none, and forgets the pages of the tabs closed. */
export function followTabs(streams: WatchStreams, state: AppState, restored: boolean): void {
  const open = new Set<string>(state.tabs.tabs.map((tab) => tab.id));
  for (const tab of state.tabs.tabs) {
    if (watchedOfTab(tab) === undefined || state.watch[tab.id] !== undefined) {
      continue;
    }
    streams.opened(tab);
    const args = streams.streamOf(tab.id);
    if (!restored && args !== undefined) {
      void streams.open(args, new AbortController().signal);
    }
  }
  for (const tab of Object.keys(state.watch)) {
    if (!open.has(tab)) {
      void streams.closed(tab);
    }
  }
}

/** What follows an event of the app's state: the tabs, or a plan that asked the pages to read again. */
export function followEvent(streams: WatchStreams, event: AppEvent, state: AppState): void {
  if (event.slice === 'tabs') {
    followTabs(streams, state, event.type === 'restored');
    return;
  }
  if (event.slice === 'runner' && event.type === 'refresh-asked') {
    for (const [tab, page] of Object.entries(state.watch)) {
      if (event.connection === undefined || page.watched.connection === event.connection) {
        void streams.readPreImages(tab);
      }
    }
  }
}

/** Follows the tabs and the plans for the run; closes every stream when Datardo quits. */
export function start(services: MainServices): Promise<void> {
  const streams = watchStreamsOf(services);
  services.state.listen((event) => {
    // After the event: what follows changes the state again, which is not done while a change is being told.
    queueMicrotask(() => {
      followEvent(streams, event, services.state.get());
    });
  });
  services.onQuit(() => streams.closeAll());
  return Promise.resolve();
}
