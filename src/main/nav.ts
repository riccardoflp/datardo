/**
 * The nav area in the main process: `pins.json` (data.md) loaded at start and written after each change of the pins,
 * and the fields of `window.json` that remember the islands (`nav.toggle-explorer`, `nav.toggle-inspector`,
 * `nav.resize`), which the window area's store keeps. It imports nothing of Electron, so that the tests read it.
 */
import type { Json } from '../shared/engine-request';
import type { NavState, Pin } from '../shared/state/nav';
import { Store, type JsonObject, type StoredFile } from '../storage/store';
import type { MainServices } from './services';

/** The pins of every connection, by connection id, in the user's order. */
export type PinsByConnection = Readonly<Record<string, readonly Pin[]>>;

function isText(value: unknown): value is string {
  return typeof value === 'string';
}

function isWhole(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** A pinned saved query: its place, and its file or the query itself, when the pin holds them (`nav.pin`). */
function savedQueryPin(
  pin: Record<string, unknown>,
  named: { readonly database: string; readonly collection: string; readonly name: string },
): Pin {
  const place = pin['place'] === 'me' || pin['place'] === 'folder' ? pin['place'] : undefined;
  const query = pin['query'];
  return {
    kind: 'saved-query',
    ...named,
    ...(place === undefined ? {} : { place }),
    ...(isText(pin['file']) ? { file: pin['file'] } : {}),
    ...(typeof query === 'object' && query !== null && !Array.isArray(query) ? { query: query as Json } : {}),
  };
}

/** A pin as stored, or `undefined` when it is not one (it is then left out, and the others are kept). */
export function readPin(value: unknown): Pin | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const pin = value as Record<string, unknown>;
  switch (pin['kind']) {
    case 'collection':
      return isText(pin['database']) && isText(pin['collection'])
        ? {
            kind: 'collection',
            database: pin['database'],
            collection: pin['collection'],
            ...(pin['view'] === true ? { view: true } : {}),
          }
        : undefined;
    case 'namespace':
      return isWhole(pin['database']) && isText(pin['namespace'])
        ? { kind: 'namespace', database: pin['database'], namespace: pin['namespace'] }
        : undefined;
    case 'key':
      return isWhole(pin['database']) && isText(pin['keyHex']) && /^(?:[0-9a-f]{2})*$/u.test(pin['keyHex'])
        ? { kind: 'key', database: pin['database'], keyHex: pin['keyHex'] }
        : undefined;
    case 'page':
      return isText(pin['page']) && isText(pin['title'])
        ? {
            kind: 'page',
            page: pin['page'],
            title: pin['title'],
            ...(isText(pin['database']) ? { database: pin['database'] } : {}),
          }
        : undefined;
    case 'saved-query':
      return isText(pin['database']) && isText(pin['collection']) && isText(pin['name'])
        ? savedQueryPin(pin, { database: pin['database'], collection: pin['collection'], name: pin['name'] })
        : undefined;
    default:
      return undefined;
  }
}

/** The kind of `pins.json`: `{ "version": 1, "connections": { "<connection id>": [pin, …] } }`. */
export const pinsFile: StoredFile<PinsByConnection> = {
  path: 'pins.json',
  holds: 'The pins',
  version: 1,
  migrations: {},
  empty: () => ({}),
  read: (object: JsonObject): PinsByConnection => {
    const connections = object['connections'];
    if (typeof connections !== 'object' || connections === null || Array.isArray(connections)) {
      throw new Error('pins.json has no connections.');
    }
    return Object.fromEntries(
      Object.entries(connections as Record<string, Json>).map(([id, pins]) => [
        id,
        Array.isArray(pins) ? pins.map(readPin).filter((pin): pin is Pin => pin !== undefined) : [],
      ]),
    );
  },
  write: (value: PinsByConnection): JsonObject => ({
    connections: Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((id) => (value[id] ?? []).length > 0)
        .map((id) => [id, (value[id] ?? []) as unknown as Json]),
    ),
  }),
};

/** The fields of `window.json` that remember the islands, from the nav state. */
export function islandFields(nav: NavState): Record<string, Json> {
  return {
    explorerWidth: nav.widths.explorer,
    inspectorWidth: nav.widths.inspector,
    explorerHidden: nav.explorerHidden,
    inspectorHidden: nav.inspectorHidden,
  };
}

/** What the fields of `window.json` say of the islands; a field missing or of the wrong type is left at its default. */
export function islandsOf(fields: Readonly<Record<string, Json>>, nav: NavState): Partial<NavState> {
  const width = (name: string, fallback: number): number => {
    const value = fields[name];
    return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  };
  const flag = (name: string, fallback: boolean): boolean => {
    const value = fields[name];
    return typeof value === 'boolean' ? value : fallback;
  };
  return {
    widths: {
      explorer: width('explorerWidth', nav.widths.explorer),
      inspector: width('inspectorWidth', nav.widths.inspector),
    },
    explorerHidden: flag('explorerHidden', nav.explorerHidden),
    inspectorHidden: flag('inspectorHidden', nav.inspectorHidden),
  };
}

/** The store of `pins.json`, once the area has started. */
let pinsStore: Store<PinsByConnection> | undefined;

/** Loads `pins.json` into the state, and writes it again after each change of the pins. */
export async function start(services: MainServices): Promise<void> {
  const store = new Store(services.dataFolder, pinsFile, (error) => {
    logLine(services, `The pins could not be saved: ${String(error)}`);
  });
  pinsStore = store;
  try {
    const found = await store.load();
    if (found.kind === 'damaged') {
      logLine(services, `The pins could not be read and were set aside as ${found.setAsideAs}.`);
    }
  } catch (error: unknown) {
    logLine(services, `The pins could not be read: ${String(error)}`);
  }
  services.state.dispatch({ slice: 'nav', type: 'changed', nav: { pins: store.get() } });
  services.state.listen((event, state) => {
    if (event.slice === 'nav' && event.nav.pins !== undefined) {
      store.set(state.nav.pins);
    }
  });
  services.onQuit(() => store.flush());
}

/** Whether `pins.json` can be written: never one written by a newer Datardo (R15.3). */
export function arePinsWritable(): boolean {
  return pinsStore?.isWritable() ?? true;
}

function logLine(services: MainServices, text: string): void {
  services.state.dispatch({
    slice: 'runner',
    type: 'logged',
    lines: [{ time: Date.now(), source: 'nav.pin', kind: 'info', text: `[nav.pin] ${text}` }],
  });
}
