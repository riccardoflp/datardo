/**
 * The actions of the keys area: the scans of `src/main/key-scans.ts` (`key.scan-all`, `key.unlink-scanned`) through
 * the connections' clients, and the system's dialogs of the file of an export and of an import.
 */
import { app, dialog, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
import { readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { AreaActions } from '.';
import type { AppAction } from '../../runner/ports';
import { fieldsOf } from '../../features/key/types';
import { connectionEngines, connectionName, isReadOnly } from '../connections';
import { keyScanActions } from '../key-scans';
import type { MainServices } from '../services';

/** The largest file `key.import` reads, in bytes (Datardo's choice; R14.4). */
export const largestImport = 512 * 1024 * 1024;

/** `key.choose-file` `{ mode: 'save', name }`: the system's save dialog for an export; the path, or null. */
function chooseFile(services: MainServices): AppAction {
  return async (args) => {
    const name = fieldsOf(args)['name'];
    const options: SaveDialogOptions = {
      title: 'Export keys',
      buttonLabel: 'Export',
      defaultPath: join(app.getPath('home'), typeof name === 'string' ? name : 'keys.redis'),
      filters: [{ name: 'Redis commands', extensions: ['redis'] }],
    };
    const window = services.window();
    const chosen =
      window === undefined ? await dialog.showSaveDialog(options) : await dialog.showSaveDialog(window, options);
    return chosen.canceled || chosen.filePath === '' ? null : chosen.filePath;
  };
}

/** `key.read-file` `{ mode: 'open' }`: the system's open dialog for an import; `{ path, name, text }`, or null. */
function readKeysFile(services: MainServices): AppAction {
  return async () => {
    const options: OpenDialogOptions = {
      title: 'Import keys',
      buttonLabel: 'Import',
      properties: ['openFile'],
      filters: [
        { name: 'Redis commands', extensions: ['redis', 'txt'] },
        { name: 'All files', extensions: ['*'] },
      ],
    };
    const window = services.window();
    const chosen =
      window === undefined ? await dialog.showOpenDialog(options) : await dialog.showOpenDialog(window, options);
    const path = chosen.canceled ? undefined : chosen.filePaths[0];
    if (path === undefined) {
      return null;
    }
    if ((await stat(path)).size > largestImport) {
      throw new Error('The file is larger than 512 MB: Datardo does not import it.');
    }
    return { path, name: basename(path), text: await readFile(path, 'utf8') };
  };
}

/** The actions of this area, by name. */
export const actions: AreaActions = (services) => ({
  ...keyScanActions({ engines: connectionEngines, isReadOnly, connectionName }),
  'key.choose-file': chooseFile(services),
  'key.read-file': readKeysFile(services),
});
