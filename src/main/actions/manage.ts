/**
 * The action of the manage area the runner carries out for the second step of `manage.rename-collection`: what
 * Datardo keeps for `shop.orders` moves to `shop.orders_2024` once MongoDB renamed the collection. The recent queries
 * and the columns with their expanded paths (`state/<connection id>.json`, and the columns in the app's state), the
 * saved queries *for me* (`saved-queries/<connection id>.json`), the pins of the collection and of its saved queries,
 * its own color on the connection (`tree.color-of`), and the open tab of the collection, which shows the new name with
 * the same query. The saved queries in the folder,
 * the undo history and the other tabs stay under the old name (the card's acceptance).
 */
import type { Json } from '../../shared/engine-request';
import { connectionId, type ConnectionId } from '../../shared/ids';
import type { Pin } from '../../shared/state/nav';
import { columnsKey, nothingRemembered, rememberedColumns } from '../../shared/state/table';
import { withCollectionRenamed as stateRenamed } from '../../storage/connection-state';
import { renamedColors } from '../../features/tree/color-of';
import { findConnection, writeConnection } from '../connections';
import { moveExclusion, withMaps } from './tree';
import { savedQueriesData } from '../saved-queries';
import type { MainServices } from '../services';
import { connectionStateStore } from '../table';
import type { AreaActions } from '.';

/** What the action is given: `{ connection, database, from, to }`. */
interface Renamed {
  readonly connection: ConnectionId;
  readonly database: string;
  readonly from: string;
  readonly to: string;
}

function textField(args: Json, name: string): string {
  const value =
    typeof args === 'object' && args !== null && !Array.isArray(args)
      ? (args as { readonly [key: string]: Json })[name]
      : undefined;
  if (typeof value !== 'string' || value === '') {
    throw new Error(`The action needs ${name}.`);
  }
  return value;
}

function renamedOf(args: Json): Renamed {
  return {
    connection: connectionId(textField(args, 'connection')),
    database: textField(args, 'database'),
    from: textField(args, 'from'),
    to: textField(args, 'to'),
  };
}

/** The recent queries, the columns and the expanded paths, in the connection's file and in the app's state. */
async function moveConnectionState(services: MainServices, renamed: Renamed): Promise<void> {
  const store = await connectionStateStore(services, renamed.connection);
  store.set(stateRenamed(store.get(), renamed.database, renamed));
  const where = { connection: renamed.connection, database: renamed.database };
  const columns = rememberedColumns(services.state.get().table, { ...where, collection: renamed.from });
  const fromKey = columnsKey(renamed.connection, renamed.database, renamed.from);
  const toKey = columnsKey(renamed.connection, renamed.database, renamed.to);
  services.state.dispatch({ slice: 'table', type: 'columns-saved', key: toKey, columns });
  services.state.dispatch({ slice: 'table', type: 'columns-saved', key: fromKey, columns: nothingRemembered });
}

/** The saved queries *for me* take the collection's new name; a missing file has nothing to move. */
async function moveSavedQueries(renamed: Renamed): Promise<void> {
  await savedQueriesData().renameCollection(renamed.connection, renamed.database, renamed);
}

function movedPin(pin: Pin, renamed: Renamed): Pin {
  const isOfCollection =
    (pin.kind === 'collection' || pin.kind === 'saved-query') &&
    pin.database === renamed.database &&
    pin.collection === renamed.from;
  return isOfCollection ? { ...pin, collection: renamed.to } : pin;
}

/** The pins of the collection and of its saved queries. */
function movePins(services: MainServices, renamed: Renamed): void {
  const all = services.state.get().nav.pins;
  const pins = all[renamed.connection];
  if (pins === undefined) {
    return;
  }
  const moved = pins.map((pin) => movedPin(pin, renamed));
  if (moved.some((pin, index) => pin !== pins[index])) {
    services.state.dispatch({ slice: 'nav', type: 'changed', nav: { pins: { ...all, [renamed.connection]: moved } } });
  }
}

/** The tab of the collection shows the new name; its page keeps its query and runs it again on the refresh. */
function moveTab(services: MainServices, renamed: Renamed): void {
  for (const tab of services.state.get().tabs.tabs) {
    const shows = tab.shows;
    if (
      shows.kind === 'collection' &&
      shows.connection === renamed.connection &&
      shows.database === renamed.database &&
      shows.collection === renamed.from
    ) {
      services.state.dispatch({
        slice: 'tabs',
        type: 'shows-changed',
        tab: tab.id,
        shows: { ...shows, collection: renamed.to },
      });
    }
  }
}

/**
 * The own color of the collection, kept on the connection, moves to the new name; the saved connections are read and
 * written only when it has one.
 */
function moveColor(services: MainServices, renamed: Renamed): void {
  const shown = services.state.get().connections.saved.find((each) => each.id === renamed.connection);
  const colors = shown?.collectionColors;
  if (renamedColors(colors, renamed.database, renamed.from, renamed.to) === colors) {
    return;
  }
  const connection = findConnection(renamed.connection);
  if (connection !== undefined) {
    const collectionColors = renamedColors(connection.collectionColors, renamed.database, renamed.from, renamed.to);
    writeConnection(withMaps(connection, { databaseColors: connection.databaseColors, collectionColors }));
  }
}

/** `manage.rename-collection`: what Datardo keeps for a collection follows its new name. */
export async function moveCollection(services: MainServices, args: Json): Promise<void> {
  const renamed = renamedOf(args);
  await moveConnectionState(services, renamed);
  await moveSavedQueries(renamed);
  movePins(services, renamed);
  moveColor(services, renamed);
  moveExclusion(services, renamed);
  moveTab(services, renamed);
}

/** The actions of this area, by name. */
export const actions: AreaActions = (services) => ({
  'manage.rename-collection': (args) => moveCollection(services, args),
});
