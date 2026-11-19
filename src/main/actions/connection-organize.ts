/**
 * The actions of the connection area that organize and share the saved connections: copy, duplicate, folders, colors,
 * links, the host keys, and the files of connections that import reads and export writes. The secrets read here stay
 * in the main process: what goes back to the runner is a count, a name or a choice (R14.3).
 */
import { app, clipboard, dialog, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
import { readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { AreaActions } from '.';
import type { AppAction } from '../../runner/ports';
import { connectionColors, type ConnectionColor, type SavedConnection } from '../../shared/connection';
import type { Json } from '../../shared/engine-request';
import { connectionId, type ConnectionId } from '../../shared/ids';
import { connectionsFromText, importFilters, largestFile } from '../../features/connection/read-file';
import { fileText, transferText } from '../../features/connection/text';
import { isFileProblem, jsonFields, type ConnectionToSave } from '../../features/connection/types';
import {
  connectionEngines,
  dispatchConnections,
  findConnection,
  fullConnectionString,
  savedConnections,
  savedOptionSecrets,
  viewOf,
  writeConnection,
  writeConnections,
  writeGivenSecrets,
} from '../connections';
import { nodeFileCrypto } from '../file-crypto';
import { rememberHostKey } from '../known-hosts';
import type { MainServices } from '../services';

function textField(args: Json, name: string): string | undefined {
  const value = jsonFields(args)[name];
  return typeof value === 'string' ? value : undefined;
}

function idField(args: Json, name: string): ConnectionId {
  const value = textField(args, name);
  if (value === undefined || value === '') {
    throw new Error(`The action needs the id of a connection in ${name}.`);
  }
  return connectionId(value);
}

function needConnection(id: ConnectionId): SavedConnection {
  const connection = findConnection(id);
  if (connection === undefined) {
    throw new Error(`No connection is saved with the id ${id}.`);
  }
  return connection;
}

/** `connection.copy-string` `{ connection, name }`: its connection string, secrets included, on the clipboard. */
const copyString: AppAction = async (args) => {
  const id = idField(args, 'connection');
  const connection = needConnection(id);
  const full = fullConnectionString(id);
  if (full === undefined) {
    throw new Error(`The connection string of ${connection.name} is not in the secret storage.`);
  }
  await clipboard.writeText(full);
  return { copied: true, name: connection.name };
};

/** `connection.duplicate` `{ connection, copy, name }`: a copy with its secrets, under the new id and name. */
const duplicate: AppAction = (args) => {
  const original = needConnection(idField(args, 'connection'));
  const copy = idField(args, 'copy');
  if (findConnection(copy) !== undefined) {
    throw new Error(`A connection is already saved with the id ${copy}.`);
  }
  const full = fullConnectionString(original.id);
  if (full !== undefined) {
    writeGivenSecrets(copy, full, savedOptionSecrets(original.id));
  }
  writeConnection({ ...original, id: copy, name: textField(args, 'name') ?? original.name });
  return Promise.resolve();
};

/** `connection.set-color` `{ connection, color }`: `null` takes the color away. */
const setColor: AppAction = (args) => {
  const { color: _old, ...connection } = needConnection(idField(args, 'connection'));
  const given = jsonFields(args)['color'];
  const color = connectionColors.find((each): each is ConnectionColor => each === given);
  writeConnection(color === undefined ? connection : { ...connection, color });
  return Promise.resolve();
};

/** `connection.set-folder` `{ connection, folder }`: `null` or an empty name takes it out of its folder. */
const setFolder: AppAction = (args) => {
  const { folder: _old, ...connection } = needConnection(idField(args, 'connection'));
  const folder = textField(args, 'folder')?.trim() ?? '';
  writeConnection(folder === '' ? connection : { ...connection, folder });
  return Promise.resolve();
};

/** `connection.rename-folder` `{ folder, name }`: every connection of the folder moves; `null` takes them out of it. */
const renameFolder: AppAction = (args) => {
  const folder = textField(args, 'folder');
  const name = textField(args, 'name')?.trim() ?? '';
  const moved: SavedConnection[] = savedConnections().map((each): SavedConnection => {
    if (each.folder !== folder) {
      return each;
    }
    const { folder: _old, ...rest } = each;
    return name === '' ? rest : { ...rest, folder: name };
  });
  const before = savedConnections();
  writeConnections(moved);
  moved.forEach((each, index) => {
    if (before[index]?.folder === folder) {
      dispatchConnections({ slice: 'connections', type: 'saved', connection: viewOf(each) });
    }
  });
  return Promise.resolve();
};

/** `connection.link` `{ connection, to }`: the MongoDB connection publishes its changes to the Redis one (D7). */
const link: AppAction = (args) => {
  const connection = needConnection(idField(args, 'connection'));
  const to = needConnection(idField(args, 'to'));
  if (connection.engine !== 'mongodb' || to.engine !== 'redis') {
    throw new Error('A MongoDB connection is linked to a Redis connection.');
  }
  writeConnection({ ...connection, publishesTo: to.id });
  return Promise.resolve();
};

/** `connection.remember-host-key` `{ server, fingerprint }`. */
const rememberKey: AppAction = (args) => {
  const server = textField(args, 'server');
  const fingerprint = textField(args, 'fingerprint');
  if (server === undefined || fingerprint === undefined) {
    throw new Error('The action needs a server and the fingerprint of its key.');
  }
  rememberHostKey(server, fingerprint);
  return Promise.resolve();
};

function toSave(args: Json): ConnectionToSave {
  const value = args as unknown as Partial<ConnectionToSave>;
  if (value.saved === undefined || typeof value.connectionString !== 'string') {
    throw new Error('The action needs the connection to save.');
  }
  return { saved: value.saved, connectionString: value.connectionString, secrets: value.secrets ?? {} };
}

/** `connection.import-one` `{ saved, connectionString, secrets }`: a connection of a file, new or replacing one. */
const importOne: AppAction = async (args) => {
  const { saved, connectionString, secrets } = toSave(args);
  if (findConnection(saved.id) !== undefined) {
    await connectionEngines().disconnect(saved.id);
  }
  writeGivenSecrets(saved.id, connectionString, secrets);
  writeConnection(saved);
};

/** Where import reads from: `{ source: 'file' | 'clipboard' }`; the text and its name, or null when cancelled. */
function importSource(services: MainServices): AppAction {
  return async (args) => {
    if (textField(args, 'source') === 'clipboard') {
      const text = await clipboard.readText();
      return text.length > largestFile
        ? Promise.reject(new Error(fileText.tooLarge))
        : { text, name: transferText.theClipboard };
    }
    const options: OpenDialogOptions = {
      title: transferText.importTitle,
      buttonLabel: transferText.importButton,
      properties: ['openFile'],
      filters: importFilters.map((each) => ({ name: each.name, extensions: [...each.extensions] })),
    };
    const window = services.window();
    const chosen =
      window === undefined ? await dialog.showOpenDialog(options) : await dialog.showOpenDialog(window, options);
    const path = chosen.canceled ? undefined : chosen.filePaths[0];
    if (path === undefined) {
      return null;
    }
    if ((await stat(path)).size > largestFile) {
      throw new Error(fileText.tooLarge);
    }
    return { text: await readFile(path, 'utf8'), name: basename(path) };
  };
}

function sameIndexes(file: { readonly connections: readonly { name: string; connectionString: string }[] }): number[] {
  const saved = savedConnections();
  return file.connections.flatMap((each, index) =>
    saved.some((one) => one.name === each.name && fullConnectionString(one.id) === each.connectionString)
      ? [index]
      : [],
  );
}

/** `{ text, passphrase }`: the connections of the text, which stay in the main process with their secrets. */
const importParse: AppAction = async (args) => {
  const text = textField(args, 'text') ?? '';
  const read = await connectionsFromText(text, textField(args, 'passphrase'), nodeFileCrypto);
  if (isFileProblem(read)) {
    if (read.wrongPassphrase === true) {
      return { wrongPassphrase: true };
    }
    throw new Error(transferText.couldNotImport(read.problem));
  }
  return { file: read as unknown as Json, same: sameIndexes(read) };
};

/** `{ name }`: the system's save dialog, in the home folder with the proposed name; the path, or null. */
function exportPath(services: MainServices): AppAction {
  return async (args) => {
    const options: SaveDialogOptions = {
      title: transferText.exportTitle,
      buttonLabel: transferText.exportButton,
      defaultPath: join(app.getPath('home'), textField(args, 'name') ?? 'connections.json'),
    };
    const window = services.window();
    const chosen =
      window === undefined ? await dialog.showSaveDialog(options) : await dialog.showSaveDialog(window, options);
    return chosen.canceled || chosen.filePath === '' ? null : { path: chosen.filePath };
  };
}

/** The actions of this part of the area, by name. */
export const actions: AreaActions = (services) => ({
  'connection.copy-string': copyString,
  'connection.duplicate': duplicate,
  'connection.set-color': setColor,
  'connection.set-folder': setFolder,
  'connection.rename-folder': renameFolder,
  'connection.link': link,
  'connection.remember-host-key': rememberKey,
  'connection.import-one': importOne,
  'connection.import-source': importSource(services),
  'connection.import-parse': importParse,
  'connection.export-path': exportPath(services),
});
