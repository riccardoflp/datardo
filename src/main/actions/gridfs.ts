/**
 * The actions of the GridFS area: the system's dialogs of an upload and of a download (`gridfs.choose-file`), the
 * private folder of the copies in the system's temporary folder (`gridfs.temporary-folder`), the opening of a copy
 * with the system's application (`gridfs.open-copy`), and those of `src/main/gridfs.ts` (`gridfs.check-files`,
 * `gridfs.write-chunks`).
 */
import { app, dialog, shell, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
import { stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { AreaActions } from '.';
import { newObjectId } from '../../engines';
import { openedExtensions } from '../../features/gridfs/open';
import { text } from '../../features/gridfs/text';
import { isRecord, textOf } from '../../features/gridfs/types';
import type { AppAction } from '../../runner/ports';
import { connectionEngines, connectionName, isReadOnly } from '../connections';
import { copiesFolder, gridFsActions, isCopy } from '../gridfs';
import { openedAs } from '../opened-files';
import type { MainServices } from '../services';

/** The save dialog of a download: the path chosen, or null. */
async function savePath(services: MainServices, title: string, name: string): Promise<string | null> {
  const options: SaveDialogOptions = { title, defaultPath: join(app.getPath('home'), name) };
  const window = services.window();
  const chosen =
    window === undefined ? await dialog.showSaveDialog(options) : await dialog.showSaveDialog(window, options);
  return chosen.canceled || chosen.filePath === '' ? null : chosen.filePath;
}

/** The open dialog of an upload: the files chosen, each with its size and the `_id` of its files document, or null. */
async function openFiles(services: MainServices, title: string, button: string | undefined): Promise<unknown> {
  const options: OpenDialogOptions = {
    title,
    ...(button === undefined ? {} : { buttonLabel: button }),
    properties: ['openFile', 'multiSelections'],
  };
  const window = services.window();
  const chosen =
    window === undefined ? await dialog.showOpenDialog(options) : await dialog.showOpenDialog(window, options);
  if (chosen.canceled) {
    return null;
  }
  return Promise.all(
    chosen.filePaths.map(async (path) => ({
      path,
      name: basename(path),
      size: (await stat(path)).size,
      id: newObjectId(),
    })),
  );
}

/** `gridfs.choose-file`: `{ mode: 'save', title, name }` or `{ mode: 'open', title, button, many: true }`. */
function chooseFile(services: MainServices): AppAction {
  return async (args) => {
    const fields = isRecord(args) ? args : {};
    const title = textOf(fields, 'title') ?? '';
    return fields['mode'] === 'save'
      ? savePath(services, title, textOf(fields, 'name') ?? 'file')
      : openFiles(services, title, textOf(fields, 'button'));
  };
}

/**
 * `gridfs.open-copy` `{ path }`: the copy opened with the system's application. Its type is checked once more here,
 * whatever the plan says (D42, T20): only a copy of this run's folder that a step of this session wrote, of a type of
 * the list, is handed to the system (R14.10); any other path is refused.
 */
export const openCopy: AppAction = async (args) => {
  const path = isRecord(args) ? (textOf(args, 'path') ?? '') : '';
  const opened = openedAs(path, { writers: ['gridfs.download'], opens: openedExtensions });
  if (!isCopy(path) || opened !== 'open') {
    throw new Error(text.open.type);
  }
  const failed = await shell.openPath(path);
  if (failed !== '') {
    throw new Error(failed);
  }
  return null;
};

/** The actions of this area, by name. */
export const actions: AreaActions = (services) => ({
  ...gridFsActions({ engines: connectionEngines, isReadOnly, connectionName }),
  'gridfs.choose-file': chooseFile(services),
  'gridfs.temporary-folder': () => copiesFolder(),
  'gridfs.open-copy': openCopy,
});
