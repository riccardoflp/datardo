/**
 * The actions of the saved-query area the runner carries out for app steps and app reads: the lists of a collection
 * and of a connection (`saved-query.list`, `saved-query.connection-list`), the files of a queries folder
 * (`saved-query.read-folder`), the queries saved for me and the recent queries (`saved-query.set-mine`,
 * `saved-query.set-recent`), the queries folder of a connection and the system's folder dialog
 * (`saved-query.set-folder`, `saved-query.pick-folder`), the file manager (`saved-query.reveal`), the query put back in
 * its tab (`saved-query.load`), the pin that follows a query (`saved-query.set-pin`), and what a connection removed
 * leaves (`saved-query.forget-connection`, `connection.removal-counts`).
 */
import { app, dialog, shell, type OpenDialogOptions } from 'electron';
import { access } from 'node:fs/promises';
import { chooseButton } from '../../features/connection/form';
import { text } from '../../features/saved-query/text';
import type { AppAction } from '../../runner/ports';
import type { Json } from '../../shared/engine-request';
import type { ConnectionId } from '../../shared/ids';
import type { Tab } from '../../shared/state/tabs';
import { pathInQueriesFolder } from '../../storage/queries-folder';
import { findConnection, writeConnection } from '../connections';
import { connectionOfArgs, savedQueriesData, type CollectionWhere } from '../saved-queries';
import type { MainServices } from '../services';
import { openTab } from './tab';
import type { AreaActions } from '.';

type Fields = { readonly [key: string]: Json };

function fieldsOf(args: Json): Fields {
  return typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as Fields) : {};
}

function textOf(args: Json, name: string): string {
  const value = fieldsOf(args)[name];
  if (typeof value !== 'string') {
    throw new Error(`The action needs ${name}.`);
  }
  return value;
}

function listOf(args: Json, name: string): readonly Json[] {
  const value = fieldsOf(args)[name];
  return Array.isArray(value) ? (value as readonly Json[]) : [];
}

function folderOf(args: Json): string | undefined {
  const value = fieldsOf(args)['queriesFolder'];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function whereOf(args: Json): CollectionWhere {
  return {
    connection: connectionOfArgs(args),
    database: textOf(args, 'database'),
    collection: textOf(args, 'collection'),
  };
}

function nameOf(services: MainServices, connection: ConnectionId): string {
  return services.state.get().connections.saved.find((each) => each.id === connection)?.name ?? connection;
}

/** `saved-query.list` `{ connection, database, collection, queriesFolder }`: the queries of one collection. */
function list(services: MainServices): AppAction {
  return async (args) => {
    const where = whereOf(args);
    const data = savedQueriesData();
    const folder = folderOf(args);
    const mine = (await data.mineOf(where.connection)).filter(
      (each) => each.database === where.database && each.collection === where.collection,
    );
    return {
      connectionName: nameOf(services, where.connection),
      mine: mine as unknown as Json,
      recent: (await data.recentOf(where)) as unknown as Json,
      folder: folder === undefined ? null : ((await data.reading(folder)) as unknown as Json),
    };
  };
}

/** `saved-query.connection-list` `{ connection, queriesFolder, databases? }`: the saved queries of a connection. */
function connectionList(services: MainServices): AppAction {
  return async (args) => {
    const connection = connectionOfArgs(args);
    const data = savedQueriesData();
    const folder = folderOf(args);
    const databases = fieldsOf(args)['databases'];
    return {
      connectionName: nameOf(services, connection),
      mine: (await data.mineOf(connection)) as unknown as Json,
      folder: folder === undefined ? null : ((await data.reading(folder)) as unknown as Json),
      ...(Array.isArray(databases) ? { databases } : {}),
    };
  };
}

/** `saved-query.read-folder` `{ connection, queriesFolder }`: the files of the folder, or `null` without one. */
const readFolder: AppAction = async (args) => {
  const folder = folderOf(args);
  return folder === undefined ? null : await savedQueriesData().reading(folder);
};

/** `saved-query.set-folder` `{ connection, queriesFolder }`: saves the connection with its queries folder. */
const setFolder: AppAction = (args) => {
  const id = connectionOfArgs(args);
  const connection = findConnection(id);
  if (connection === undefined) {
    throw new Error(`No connection is saved with the id ${id}.`);
  }
  writeConnection({ ...connection, queriesFolder: textOf(args, 'queriesFolder') });
  savedQueriesData().changed(id);
  return Promise.resolve();
};

/** `saved-query.pick-folder` `{ title, start }`: the system's folder dialog; the folder chosen, or `null`. */
function pickFolder(services: MainServices): AppAction {
  return async (args) => {
    const fields = fieldsOf(args);
    const start = typeof fields['start'] === 'string' ? fields['start'] : app.getPath('home');
    const options: OpenDialogOptions = {
      title: typeof fields['title'] === 'string' ? fields['title'] : '',
      buttonLabel: chooseButton,
      defaultPath: start,
      properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
    };
    const window = services.window();
    const chosen =
      window === undefined ? await dialog.showOpenDialog(options) : await dialog.showOpenDialog(window, options);
    return chosen.canceled ? null : (chosen.filePaths[0] ?? null);
  };
}

/** `saved-query.reveal` `{ queriesFolder, file }`: the file selected in the system's file manager. */
const reveal: AppAction = async (args) => {
  try {
    const path = pathInQueriesFolder(textOf(args, 'queriesFolder'), textOf(args, 'file'));
    await access(path);
    shell.showItemInFolder(path);
  } catch (error: unknown) {
    throw new Error(`${text.reveal.couldNotOpen} ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
};

/**
 * `saved-query.load` `{ connection, database, collection, tab?, query }`: the query put in the collection tab, which
 * is opened, or made active, first; the window shows it there and runs it.
 */
function load(services: MainServices): AppAction {
  return (args) => {
    const where = whereOf(args);
    const named = fieldsOf(args)['tab'];
    const shows = (tab: Tab): boolean =>
      tab.shows.kind === 'collection' &&
      tab.shows.connection === where.connection &&
      tab.shows.database === where.database &&
      tab.shows.collection === where.collection;
    const tabs = (): readonly Tab[] => services.state.get().tabs.tabs;
    let tab = tabs().find((each) => each.id === named && shows(each));
    if (tab === undefined) {
      openTab(
        services,
        {
          shows: {
            kind: 'collection',
            connection: where.connection,
            database: where.database,
            collection: where.collection,
          },
        },
        { background: false, visiting: 'visit' },
      );
      tab = tabs().find((each) => each.id === services.state.get().tabs.active && shows(each)) ?? tabs().find(shows);
    }
    if (tab === undefined) {
      throw new Error(`The tab of ${where.database}.${where.collection} could not be opened.`);
    }
    services.state.dispatch({
      slice: 'saved-query',
      type: 'loaded',
      tab: tab.id,
      query: fieldsOf(args)['query'] ?? null,
    });
    return Promise.resolve();
  };
}

/** `saved-query.set-mine` `{ connection, database, collection, queries }`. */
const setMine: AppAction = (args) => savedQueriesData().setMine(whereOf(args), listOf(args, 'queries'));

/** `saved-query.set-recent` `{ connection, database, collection, recent }`. */
const setRecent: AppAction = (args) => savedQueriesData().setRecent(whereOf(args), listOf(args, 'recent'));

/** `saved-query.set-pin` `{ connection, from, to }`. */
const setPin: AppAction = (args) => {
  const fields = fieldsOf(args);
  savedQueriesData().setPin(connectionOfArgs(args), fields['from'] ?? null, fields['to'] ?? null);
  return Promise.resolve();
};

/** `saved-query.forget-connection` `{ connection }`: the queries saved for me of a connection removed. */
const forgetConnection: AppAction = (args) => savedQueriesData().forgetConnection(connectionOfArgs(args));

/** `connection.removal-counts` `{ connection }`: what the data folder keeps of a connection (`connection.remove`). */
const removalCounts: AppAction = async (args) => await savedQueriesData().removalCounts(connectionOfArgs(args));

/** The actions of this area, by name. */
export const actions: AreaActions = (services) => ({
  'saved-query.list': list(services),
  'saved-query.connection-list': connectionList(services),
  'saved-query.read-folder': readFolder,
  'saved-query.set-folder': setFolder,
  'saved-query.pick-folder': pickFolder(services),
  'saved-query.reveal': reveal,
  'saved-query.load': load(services),
  'saved-query.set-mine': setMine,
  'saved-query.set-recent': setRecent,
  'saved-query.set-pin': setPin,
  'saved-query.forget-connection': forgetConnection,
  'connection.removal-counts': removalCounts,
});
