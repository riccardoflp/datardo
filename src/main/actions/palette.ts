/**
 * The actions of Go to the runner carries out: the recent places (`palette.recent`, read; `palette.remember-place`,
 * `palette.forget-places`, written by `tab.activate` and `home.forget-recent`), opening Go to in the window from the
 * main process (`palette.open`, for the menu bar on macOS), and running a command chosen in it
 * (`palette.run-command`).
 */
import type { Json } from '../../shared/engine-request';
import type { Intent } from '../../shared/bridge';
import type { RecentPlace } from '../../shared/state/palette';
import type { Tab } from '../../shared/state/tabs';
import { withPlace, withoutPlaces } from '../../features/palette/recent';
import type { MainServices } from '../services';
import type { AreaActions } from '.';

function field(args: Json, name: string): Json | undefined {
  return typeof args === 'object' && args !== null && !Array.isArray(args)
    ? (args as { readonly [key: string]: Json })[name]
    : undefined;
}

/** Makes the place of a tab of a connection the most recent one (`palette.recent`); other tabs are not places. */
export function rememberPlace(services: MainServices, tab: Tab): void {
  const state = services.state.get();
  const place: RecentPlace = {
    shows: tab.shows,
    ...(tab.section === undefined ? {} : { section: tab.section }),
    at: Date.now(),
  };
  const recent = withPlace(state.palette.recent, place, state.app.platform);
  if (recent !== state.palette.recent) {
    services.state.dispatch({ slice: 'palette', type: 'recent-changed', recent });
  }
}

function remember(services: MainServices, args: Json): Promise<void> {
  const id = field(args, 'tab');
  const tab = services.state.get().tabs.tabs.find((each) => each.id === id);
  if (tab !== undefined) {
    rememberPlace(services, tab);
  }
  return Promise.resolve();
}

function forget(services: MainServices, args: Json): Promise<void> {
  const state = services.state.get();
  const keys = field(args, 'keys');
  const recent =
    field(args, 'all') === true
      ? []
      : withoutPlaces(
          state.palette.recent,
          Array.isArray(keys) ? keys.filter((key): key is string => typeof key === 'string') : [],
          state.app.platform,
        );
  services.state.dispatch({ slice: 'palette', type: 'recent-changed', recent });
  return Promise.resolve();
}

function show(services: MainServices, args: Json): Promise<void> {
  const prefix = field(args, 'prefix');
  services.state.dispatch({ slice: 'palette', type: 'go-to-asked', prefix: typeof prefix === 'string' ? prefix : '' });
  return Promise.resolve();
}

/** Starts the command's own feature; the step does not wait for it, which may ask and confirm on its own. */
async function runCommand(args: Json): Promise<void> {
  const feature = field(args, 'feature');
  if (typeof feature !== 'string') {
    throw new Error('The action needs the command to run.');
  }
  // Loaded when a command is run, so that this module and the tab area's actions need no window to be read.
  const [{ whenRunnerReady }, { start }] = await Promise.all([import('../bridge'), import('../../runner/start')]);
  const ports = await whenRunnerReady();
  void start(ports, args as unknown as Intent);
}

/** The actions of this area, by name. */
export const actions: AreaActions = (services) => ({
  'palette.recent': () => Promise.resolve(services.state.get().palette.recent as unknown as Json),
  'palette.remember-place': (args) => remember(services, args),
  'palette.forget-places': (args) => forget(services, args),
  'palette.show': (args) => show(services, args),
  'palette.run-command': (args) => runCommand(args),
});
