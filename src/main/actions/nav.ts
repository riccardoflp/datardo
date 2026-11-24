/**
 * The actions of the nav area the runner carries out for app steps and app reads: they change the nav state through
 * the one reducer, and copy to the clipboard.
 */
import { clipboard } from 'electron';
import type { Json } from '../../shared/engine-request';
import { connectionId } from '../../shared/ids';
import type { NavState, Pin } from '../../shared/state/nav';
import { targetKey } from '../../features/tab/same-target';
import { withPin, withPinMoved, withoutPin } from '../../features/nav/pin';
import { queryPaneWidthOf } from '../nav';
import type { MainServices } from '../services';
import type { AreaActions } from '.';
import { activateTab, openTab } from './tab';

function field(args: Json, name: string): Json | undefined {
  return typeof args === 'object' && args !== null && !Array.isArray(args)
    ? (args as { readonly [key: string]: Json })[name]
    : undefined;
}

function textField(args: Json, name: string): string {
  const value = field(args, name);
  if (typeof value !== 'string') {
    throw new Error(`The action needs the text ${name}.`);
  }
  return value;
}

function change(services: MainServices, nav: Partial<NavState>): Promise<void> {
  services.state.dispatch({ slice: 'nav', type: 'changed', nav });
  return Promise.resolve();
}

function changePins(
  services: MainServices,
  args: Json,
  edit: (pins: readonly Pin[], pin: Pin) => readonly Pin[],
): Promise<void> {
  const connection = textField(args, 'connection');
  const pin = field(args, 'pin') as unknown as Pin;
  const all = services.state.get().nav.pins;
  return change(services, { pins: { ...all, [connection]: edit(all[connection] ?? [], pin) } });
}

/** Shows a page of the app in the main island: opens its tab, or makes it active (`tab.open`). */
function showPage(services: MainServices, args: Json): Promise<void> {
  openTab(
    services,
    { shows: { kind: 'app', page: textField(args, 'page') } },
    { background: false, visiting: 'visit' },
  );
  return Promise.resolve();
}

/**
 * Moves in the places visited, without adding to them, and shows the place (`nav.back`): its tab is made active, or
 * opened again as it was when it closed.
 */
function goToPlace(services: MainServices, args: Json): Promise<void> {
  const index = field(args, 'index');
  const state = services.state.get();
  const nav = state.nav;
  const place = typeof index === 'number' ? nav.history.places[index] : undefined;
  if (typeof index !== 'number' || place === undefined) {
    throw new Error('There is no such place to go to.');
  }
  services.state.dispatch({ slice: 'nav', type: 'changed', nav: { history: { ...nav.history, index } } });
  const platform = state.app.platform;
  const open = state.tabs.tabs.find((tab) => targetKey(tab.shows, platform) === place.shows);
  const closed = state.tabs.closed.find((each) => each.key === place.shows);
  if (open !== undefined) {
    activateTab(services, open.id, 'without-visit');
  } else if (closed !== undefined) {
    const seed = { shows: closed.shows, ...(closed.memory === undefined ? {} : { memory: closed.memory }) };
    openTab(
      services,
      { ...seed, ...(place.section === undefined ? {} : { section: place.section }) },
      {
        background: false,
        place: closed.place,
        visiting: 'without-visit',
      },
    );
  } else if (place.page !== undefined) {
    openTab(services, { shows: { kind: 'app', page: place.page } }, { background: false, visiting: 'without-visit' });
  }
  return Promise.resolve();
}

/** The widths of the islands (`nav.resize`), and of the query pane (`queryPane`, `query.position`). */
function widths(services: MainServices, args: Json): Promise<void> {
  const now = services.state.get().nav.widths;
  const explorer = field(args, 'explorer');
  const inspector = field(args, 'inspector');
  const queryPane = field(args, 'queryPane');
  return change(services, {
    widths: {
      explorer: typeof explorer === 'number' ? explorer : now.explorer,
      inspector: typeof inspector === 'number' ? inspector : now.inspector,
    },
    ...(typeof queryPane === 'number' ? { queryPaneWidth: queryPaneWidthOf(queryPane) } : {}),
  });
}

/** The actions of this area, by name. */
export const actions: AreaActions = (services) => ({
  'nav.set-explorer': (args) => change(services, { explorerHidden: field(args, 'hidden') === true }),
  'nav.set-inspector': (args) => {
    const view = field(args, 'view');
    return change(services, {
      inspectorHidden: field(args, 'hidden') === true,
      ...(view === 'formatting' || view === 'selection' ? { inspectorView: view } : {}),
    });
  },
  'nav.set-widths': (args) => widths(services, args),
  'nav.show-page': (args) => showPage(services, args),
  'nav.go-to-place': (args) => goToPlace(services, args),
  'nav.make-current': (args) => change(services, { current: connectionId(textField(args, 'connection')) }),
  'nav.add-pin': (args) => changePins(services, args, withPin),
  'nav.remove-pin': (args) => changePins(services, args, withoutPin),
  'nav.move-pin': (args) => {
    const to = field(args, 'to');
    return changePins(services, args, (pins, pin) => withPinMoved(pins, pin, typeof to === 'number' ? to : 0));
  },
  'nav.copy': (args) => clipboard.writeText(textField(args, 'text')),
  /** The pins of a removed connection go (`connection.remove`). */
  'nav.forget-pins': (args) => {
    const { [textField(args, 'connection')]: _gone, ...kept } = services.state.get().nav.pins;
    return change(services, { pins: kept });
  },
});
