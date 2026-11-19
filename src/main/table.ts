/**
 * What the table area does in the main process: it loads what `state/<connection id>.json` remembers of the columns
 * of each collection into the app's state when Datardo starts, and writes it again when `table.expand`,
 * `table.collapse` or `table.arrange-columns` change it (`table.save-columns`). The file keeps every field it does
 * not know, so the recent queries and the other parts data.md lists stay as they are.
 */
import type { Json } from '../shared/engine-request';
import { connectionId, type ConnectionId } from '../shared/ids';
import { columnsKey, rememberedColumns, type RememberedColumns, type RememberedLayout } from '../shared/state/table';
import { columnsIn, connectionStateFile, withColumns, type ConnectionStateFile } from '../storage/connection-state';
import { Store, type JsonObject } from '../storage/store';
import type { MainServices } from './services';

/** The store of each connection's state file, opened once. */
const stores = new Map<ConnectionId, Promise<Store<ConnectionStateFile>>>();

function logLine(services: MainServices, text: string): void {
  services.state.dispatch({
    slice: 'runner',
    type: 'logged',
    lines: [{ time: Date.now(), source: 'table.columns', kind: 'info', text: `[table.columns] ${text}` }],
  });
}

async function opened(services: MainServices, connection: ConnectionId): Promise<Store<ConnectionStateFile>> {
  const store = new Store(services.dataFolder, connectionStateFile(connection), (error) => {
    logLine(services, `The columns could not be saved: ${String(error)}`);
  });
  try {
    const found = await store.load();
    if (found.kind === 'damaged') {
      logLine(services, `What Datardo remembers of a connection was set aside as ${found.setAsideAs}.`);
    }
  } catch (error: unknown) {
    logLine(services, `What Datardo remembers of a connection could not be read: ${String(error)}`);
  }
  services.onQuit(() => store.flush());
  return store;
}

/**
 * The store of a connection's state file, read the first time it is needed; the one store of that file, which the
 * playgrounds use too (playground.save).
 */
export function connectionStateStore(
  services: MainServices,
  connection: ConnectionId,
): Promise<Store<ConnectionStateFile>> {
  const known = stores.get(connection);
  if (known !== undefined) {
    return known;
  }
  const store = opened(services, connection);
  stores.set(connection, store);
  return store;
}

function rememberedOf(layout: JsonObject, expanded: readonly string[]): RememberedColumns {
  return { layout, expanded };
}

/** Loads the columns a connection's file remembers into the app's state. */
async function loadColumns(services: MainServices, connection: ConnectionId): Promise<void> {
  const store = await connectionStateStore(services, connection);
  const columns = Object.fromEntries(
    columnsIn(store.get()).map((each) => [
      columnsKey(connection, each.database, each.collection),
      rememberedOf(each.columns.layout, each.columns.expanded),
    ]),
  );
  services.state.dispatch({ slice: 'table', type: 'columns-loaded', connection, columns });
}

/** Loads the columns of every saved connection, and forgets those of a connection removed. */
export async function start(services: MainServices): Promise<void> {
  for (const connection of services.state.get().connections.saved) {
    await loadColumns(services, connection.id);
  }
  services.state.listen((event) => {
    if (event.slice === 'tabs' && event.type === 'connection-removed') {
      stores.delete(event.connection);
      services.state.dispatch({ slice: 'table', type: 'connection-forgotten', connection: event.connection });
    }
  });
}

function field(args: Json, name: string): Json | undefined {
  return typeof args === 'object' && args !== null && !Array.isArray(args)
    ? (args as { readonly [key: string]: Json })[name]
    : undefined;
}

function textField(args: Json, name: string): string {
  const value = field(args, name);
  if (typeof value !== 'string') {
    throw new Error(`The action needs ${name}.`);
  }
  return value;
}

/**
 * `table.save-columns`: remembers the expanded paths (`{ connection, database, collection, expanded }`) or the layout
 * (`{ …, layout }`) of a collection, in the app's state and in the connection's file.
 */
export async function saveColumns(services: MainServices, args: Json): Promise<void> {
  const where = {
    connection: textField(args, 'connection'),
    database: textField(args, 'database'),
    collection: textField(args, 'collection'),
  };
  const before = rememberedColumns(services.state.get().table, where);
  const expanded = field(args, 'expanded');
  const layout = field(args, 'layout');
  const after: RememberedColumns = {
    layout:
      typeof layout === 'object' && layout !== null && !Array.isArray(layout)
        ? (layout as RememberedLayout)
        : before.layout,
    expanded: Array.isArray(expanded)
      ? expanded.filter((each): each is string => typeof each === 'string')
      : before.expanded,
  };
  const key = columnsKey(where.connection, where.database, where.collection);
  services.state.dispatch({ slice: 'table', type: 'columns-saved', key, columns: after });
  const store = await connectionStateStore(services, connectionId(where.connection));
  store.set(withColumns(store.get(), where, { layout: after.layout as JsonObject, expanded: after.expanded }));
}
