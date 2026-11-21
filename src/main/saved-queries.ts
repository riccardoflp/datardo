/**
 * The saved-query area in the main process: the queries saved *for me* of each connection
 * (`saved-queries/<connection id>.json`), the recent queries of each collection (in `state/<connection id>.json`), and
 * the queries folders, read with the limits of T5, watched, and read again 250 ms after the last change
 * (`saved-query.read-folder`). After each change it tells the window which connection's queries changed (the
 * `changed` event of the saved-query slice), so that the open queries list, Go to and **Pinned** read them again. It
 * imports nothing of Electron, so that the tests read it.
 */
import { watch, type FSWatcher } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { folderQueriesOf, readAgainAfterMs, skippedWarning } from '../features/saved-query/read-folder';
import { isSamePin } from '../features/nav/pin';
import { notify } from '../runner/notify';
import type { Json } from '../shared/engine-request';
import { connectionId, type ConnectionId } from '../shared/ids';
import type { Pin } from '../shared/state/nav';
import { recentQueriesIn, withRecentQueries, type StoredRecentQuery } from '../storage/connection-state';
import {
  deleteQueryFile,
  readQueriesFolder,
  renameQueryFile,
  writeQueryFile,
  type QueryFolderReading,
} from '../storage/queries-folder';
import {
  noSavedQueries,
  savedQueriesFile,
  savedQueryOf,
  storedQueryOf,
  withCollectionRenamed,
  withCollectionQueries,
  type SavedQueriesFile,
  type StoredSavedQuery,
} from '../storage/saved-queries';
import { Store, type JsonObject } from '../storage/store';
import type { AppStateHolder } from './app-state';
import { connectionStateStore } from './connection-state';
import { readPin } from './nav';

/** What the area needs: the state, the data folder, saving at quit. */
export interface SavedQueriesServices {
  readonly state: Pick<AppStateHolder, 'get' | 'dispatch' | 'listen'>;
  readonly dataFolder: string;
  readonly onQuit: (flush: () => Promise<void>) => void;
}

/** A collection of a connection. */
export interface CollectionWhere {
  readonly connection: ConnectionId;
  readonly database: string;
  readonly collection: string;
}

/** A collection's name before and after a rename. */
type Renamed = { readonly from: string; readonly to: string };

/** One queries folder: its last reading, what was reported of it, and its watcher. */
interface WatchedFolder {
  reading?: Promise<QueryFolderReading>;
  reported: Readonly<Record<string, string>>;
  watcher?: FSWatcher | undefined;
  timer?: ReturnType<typeof setTimeout> | undefined;
  /** A change arrived while the folder was being read: it is read once more. */
  again: boolean;
  busy: boolean;
}

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The key of a queries folder: the same folder written two ways is watched once. */
function folderKey(folder: string): string {
  const full = resolve(folder);
  return process.platform === 'win32' || process.platform === 'darwin' ? full.toLowerCase() : full;
}

/** The saved queries, the recent queries and the queries folders of every connection. */
export class SavedQueriesData {
  private readonly mine = new Map<ConnectionId, Promise<Store<SavedQueriesFile>>>();
  private readonly folders = new Map<string, WatchedFolder>();
  private closed = false;

  constructor(private readonly services: SavedQueriesServices) {}

  private log(text: string): void {
    this.services.state.dispatch({
      slice: 'runner',
      type: 'logged',
      lines: [{ time: Date.now(), source: 'saved-query', kind: 'info', text: `[saved-query] ${text}` }],
    });
  }

  /** Tells the window that the queries of a connection changed. */
  changed(connection: ConnectionId): void {
    this.services.state.dispatch({ slice: 'saved-query', type: 'changed', connection });
  }

  private connectionName(connection: ConnectionId): string {
    return this.services.state.get().connections.saved.find((each) => each.id === connection)?.name ?? connection;
  }

  /** The connections whose queries folder is this one. */
  private connectionsOfFolder(key: string): readonly ConnectionId[] {
    return this.services.state
      .get()
      .connections.saved.filter((each) => {
        const folder = each.queriesFolder?.trim() ?? '';
        return folder !== '' && folderKey(folder) === key;
      })
      .map((each) => each.id);
  }

  // The queries for me.

  private mineStore(connection: ConnectionId): Promise<Store<SavedQueriesFile>> {
    const known = this.mine.get(connection);
    if (known !== undefined) {
      return known;
    }
    const opened = (async () => {
      const store = new Store(this.services.dataFolder, savedQueriesFile(connection), (error) => {
        this.log(`The saved queries could not be saved: ${String(error)}`);
      });
      try {
        const found = await store.load();
        if (found.kind === 'damaged') {
          this.log(`The saved queries of a connection were set aside as ${found.setAsideAs}.`);
        }
      } catch (error: unknown) {
        this.log(`The saved queries of a connection could not be read: ${String(error)}`);
      }
      this.services.onQuit(() => store.flush());
      return store;
    })();
    this.mine.set(connection, opened);
    return opened;
  }

  /** Every query saved for me on a connection. */
  async mineOf(connection: ConnectionId): Promise<readonly StoredSavedQuery[]> {
    return (await this.mineStore(connection)).get().queries;
  }

  /** `saved-query.set-mine`: the queries saved for me of one collection, the whole list after the change. */
  async setMine(where: CollectionWhere, queries: readonly Json[]): Promise<void> {
    const store = await this.mineStore(where.connection);
    const read = queries.flatMap((each) => {
      const query = isObject(each) ? savedQueryOf(each) : undefined;
      return query === undefined ? [] : [query];
    });
    if (!store.set(withCollectionQueries(store.get(), where, read))) {
      throw new Error('The saved queries were written by a newer Datardo: they are not changed.');
    }
    this.changed(where.connection);
  }

  /** The queries saved for me of a collection renamed take its new name (`manage.rename-collection`), written now. */
  async renameCollection(connection: ConnectionId, database: string, names: Renamed): Promise<void> {
    const store = await this.mineStore(connection);
    if (!store.get().queries.some((each) => each.database === database && each.collection === names.from)) {
      return;
    }
    if (!store.set(withCollectionRenamed(store.get(), database, names))) {
      throw new Error('The saved queries were written by a newer Datardo and were not moved.');
    }
    await store.flush();
    this.changed(connection);
  }

  /** `saved-query.forget-connection`: deletes the file of the queries saved for me of a connection removed. */
  async forgetConnection(connection: ConnectionId): Promise<void> {
    const store = this.mine.get(connection);
    this.mine.delete(connection);
    if (store !== undefined) {
      (await store).set(noSavedQueries);
      await (await store).flush();
    }
    await rm(join(this.services.dataFolder, savedQueriesFile(connection).path), { force: true });
  }

  /** How many queries are saved for me on a connection, and whether it has a file of `state/`. */
  async removalCounts(
    connection: ConnectionId,
  ): Promise<{ readonly savedQueries: number; readonly remembers: boolean }> {
    const savedQueries = (await this.mineOf(connection)).length;
    const remembers = await stat(join(this.services.dataFolder, 'state', `${connection}.json`)).then(
      () => true,
      () => false,
    );
    return { savedQueries, remembers };
  }

  // The recent queries.

  private stateStore(connection: ConnectionId) {
    return connectionStateStore(
      {
        dataFolder: this.services.dataFolder,
        onQuit: this.services.onQuit,
        log: (text) => {
          this.log(text);
        },
      },
      connection,
    );
  }

  /** The recent queries of a collection, newest first. */
  async recentOf(where: CollectionWhere): Promise<readonly StoredRecentQuery[]> {
    return recentQueriesIn((await this.stateStore(where.connection)).get(), where.database, where.collection);
  }

  /** `saved-query.set-recent`: the recent queries of one collection, the whole list after the change. */
  async setRecent(where: CollectionWhere, recent: readonly Json[]): Promise<void> {
    const store = await this.stateStore(where.connection);
    const read = recent.flatMap((each): StoredRecentQuery[] => {
      if (!isObject(each)) {
        return [];
      }
      const query = storedQueryOf(each['query']);
      const at = each['at'];
      return query === undefined || typeof at !== 'number' ? [] : [{ query, at }];
    });
    if (!store.set(withRecentQueries(store.get(), where, read))) {
      throw new Error('What Datardo remembers of the connection was written by a newer Datardo: it is not changed.');
    }
    this.changed(where.connection);
  }

  // The queries folders.

  private watched(key: string): WatchedFolder {
    const known = this.folders.get(key);
    if (known !== undefined) {
      return known;
    }
    const fresh: WatchedFolder = { reported: {}, again: false, busy: false };
    this.folders.set(key, fresh);
    return fresh;
  }

  /** The files of a queries folder: the last reading, or a new one the first time; it is watched from then on. */
  reading(folder: string): Promise<QueryFolderReading> {
    const key = folderKey(folder);
    const entry = this.watched(key);
    if (entry.reading === undefined) {
      entry.reading = this.readNow(folder, key, entry);
    }
    return entry.reading.then((reading) => ({ ...reading, folder }));
  }

  /** Reads the folder now, reports the files not reported yet, and starts watching it when it exists. */
  private async readNow(folder: string, key: string, entry: WatchedFolder): Promise<QueryFolderReading> {
    entry.busy = true;
    try {
      const reading = await readQueriesFolder(folder);
      const exists = await stat(folder).then(
        (found) => found.isDirectory(),
        () => false,
      );
      this.report(key, entry, reading);
      if (exists) {
        this.forgetPinsOfGoneFiles(key, reading);
        this.watch(folder, key, entry);
      }
      return reading;
    } catch (error: unknown) {
      this.log(`The queries folder ${folder} could not be read: ${String(error)}`);
      return { folder, files: [] };
    } finally {
      entry.busy = false;
    }
  }

  /** The warning about the files skipped that were not reported yet, for the first connection with this folder. */
  private report(key: string, entry: WatchedFolder, reading: QueryFolderReading): void {
    const read = folderQueriesOf(reading, entry.reported);
    entry.reported = read.reported;
    const [connection] = this.connectionsOfFolder(key);
    const warning = connection === undefined ? undefined : skippedWarning(read.fresh, connection);
    if (warning?.kind !== 'notify') {
      return;
    }
    notify(
      { state: this.services.state, now: () => Date.now() },
      {
        feature: 'saved-query.read-folder',
        element: 'saved-query.read-folder@notification',
        level: warning.level,
        text: warning.text,
        ...(warning.actions === undefined ? {} : { actions: warning.actions }),
        ...(connection === undefined ? {} : { connection }),
      },
    );
  }

  /** The pins of the queries in the folder whose file is no longer there are taken away. */
  private forgetPinsOfGoneFiles(key: string, reading: QueryFolderReading): void {
    const files = new Set(reading.files.map((each) => each.file));
    const state = this.services.state.get();
    const pins: Record<string, readonly Pin[]> = { ...state.nav.pins };
    let changed = false;
    for (const connection of this.connectionsOfFolder(key)) {
      const before = pins[connection] ?? [];
      const after = before.filter(
        (pin) => pin.kind !== 'saved-query' || pin.place !== 'folder' || pin.file === undefined || files.has(pin.file),
      );
      if (after.length !== before.length) {
        pins[connection] = after;
        changed = true;
      }
    }
    if (changed) {
      this.services.state.dispatch({ slice: 'nav', type: 'changed', nav: { pins } });
    }
  }

  private watch(folder: string, key: string, entry: WatchedFolder): void {
    if (entry.watcher !== undefined || this.closed) {
      return;
    }
    try {
      const watcher = watch(folder, { recursive: true }, () => {
        this.scheduleRead(folder, key, entry);
      });
      watcher.on('error', () => {
        // The folder was deleted or moved: it is read again, as an empty one, and watched once it is back.
        watcher.close();
        entry.watcher = undefined;
        this.scheduleRead(folder, key, entry);
      });
      entry.watcher = watcher;
    } catch (error: unknown) {
      this.log(`The queries folder ${folder} cannot be watched: ${String(error)}`);
    }
  }

  /** Reads the folder again 250 ms after the last change; a change during a reading makes one more. */
  private scheduleRead(folder: string, key: string, entry: WatchedFolder): void {
    if (entry.timer !== undefined) {
      clearTimeout(entry.timer);
    }
    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      if (entry.busy) {
        entry.again = true;
        return;
      }
      void this.readAgain(folder, key, entry);
    }, readAgainAfterMs);
  }

  private async readAgain(folder: string, key: string, entry: WatchedFolder): Promise<void> {
    if (this.closed) {
      return;
    }
    const reading = this.readNow(folder, key, entry);
    entry.reading = reading;
    await reading;
    for (const connection of this.connectionsOfFolder(key)) {
      this.changed(connection);
    }
    if (entry.again) {
      entry.again = false;
      await this.readAgain(folder, key, entry);
    }
  }

  /** Something in the folder was changed by Datardo: it is read again at once, without waiting for the watcher. */
  async folderChanged(folder: string): Promise<void> {
    const key = folderKey(folder);
    await this.readAgain(folder, key, this.watched(key));
  }

  /** The folders no connection has any longer stop being watched. */
  forgetUnusedFolders(): void {
    const used = new Set(
      this.services.state
        .get()
        .connections.saved.flatMap((each) =>
          each.queriesFolder === undefined || each.queriesFolder.trim() === '' ? [] : [folderKey(each.queriesFolder)],
        ),
    );
    for (const [key, entry] of this.folders) {
      if (!used.has(key)) {
        entry.watcher?.close();
        if (entry.timer !== undefined) {
          clearTimeout(entry.timer);
        }
        this.folders.delete(key);
      }
    }
  }

  /** Writes, renames or deletes a file of a queries folder (`saved-query.file`); the error starts with `failure`. */
  async changeFile(
    action: 'write' | 'rename' | 'delete',
    args: { readonly queriesFolder: string; readonly file: string; readonly text?: string; readonly to?: string },
    failure: string,
  ): Promise<void> {
    try {
      switch (action) {
        case 'write':
          await writeQueryFile(args.queriesFolder, args.file, args.text ?? '');
          break;
        case 'rename':
          await renameQueryFile(args.queriesFolder, args.file, args.to ?? '');
          break;
        case 'delete':
          await deleteQueryFile(args.queriesFolder, args.file);
          break;
      }
    } catch (error: unknown) {
      throw new Error(`${failure} ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    await this.folderChanged(args.queriesFolder);
  }

  /** `saved-query.set-pin`: the pin of a saved query follows it (`to`), or goes with it (`to` is `null`). */
  setPin(connection: ConnectionId, from: Json, to: Json): void {
    const before = readPin(from);
    if (before === undefined) {
      return;
    }
    const after = to === null ? undefined : readPin(to);
    const pins = this.services.state.get().nav.pins;
    const list = pins[connection] ?? [];
    const next = list.flatMap((pin) => (isSamePin(pin, before) ? (after === undefined ? [] : [after]) : [pin]));
    this.services.state.dispatch({ slice: 'nav', type: 'changed', nav: { pins: { ...pins, [connection]: next } } });
  }

  /** Stops watching every folder: at quit, and at the end of a test. */
  close(): void {
    this.closed = true;
    for (const entry of this.folders.values()) {
      entry.watcher?.close();
      if (entry.timer !== undefined) {
        clearTimeout(entry.timer);
      }
    }
    this.folders.clear();
  }
}

/** The area's data, once it has started. */
let data: SavedQueriesData | undefined;

/** The area's data; throws before the area has started. */
export function savedQueriesData(): SavedQueriesData {
  if (data === undefined) {
    throw new Error('The saved queries are not ready yet.');
  }
  return data;
}

/** The connection named by an action's arguments. */
export function connectionOfArgs(args: Json): ConnectionId {
  const value = isObject(args) ? args['connection'] : undefined;
  if (typeof value !== 'string' || value === '') {
    throw new Error('The action needs the id of a connection.');
  }
  return connectionId(value);
}

/** Starts the area: the folders no connection has any longer stop being watched; at quit, none is. */
export function start(services: SavedQueriesServices): Promise<void> {
  const started = new SavedQueriesData(services);
  data = started;
  services.state.listen((event) => {
    if (event.slice === 'connections') {
      started.forgetUnusedFolders();
    }
  });
  services.onQuit(() => {
    started.close();
    return Promise.resolve();
  });
  return Promise.resolve();
}
