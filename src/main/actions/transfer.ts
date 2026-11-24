/**
 * The actions of the transfer and backup areas: the system's dialogs of a file or a folder (`transfer.choose-path`,
 * `backup.choose-path`), each starting in the folder last chosen in its area, then in the home folder; **Open** and
 * **Reveal** of a file or a folder; and the reads of files of `src/main/transfer-files.ts`.
 */
import { app, dialog, shell, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
import { dirname, join } from 'node:path';
import type { AreaActions } from '.';
import type { AppAction } from '../../runner/ports';
import type { Json } from '../../shared/engine-request';
import { jsonFields } from '../../features/connection/types';
import type { MainServices } from '../services';
import { exportText } from '../../features/transfer/text';
import { openedAs } from '../opened-files';
import { listFolder, listNames, readArchiveList, readImportFile, readMetadata, textArgOf } from '../transfer-files';

/** The folder last chosen in each area, until Datardo quits. */
const lastFolders = new Map<string, string>();

/** The folder last chosen in an area (`backup`, `transfer`), else the home folder: where a dialog starts. */
export function lastFolderOf(area: string): string {
  return lastFolders.get(area) ?? app.getPath('home');
}

interface Filter {
  readonly name: string;
  readonly extensions: string[];
}

function filtersOf(args: Json): Filter[] {
  const fields = jsonFields(args);
  const filters = fields['filters'];
  const list: readonly Json[] = Array.isArray(filters) ? (filters as readonly Json[]) : [];
  return list.flatMap((each) => {
    const name = textArgOf(each, 'name');
    const extensions = jsonFields(each)['extensions'];
    const list = Array.isArray(extensions) ? extensions.filter((one): one is string => typeof one === 'string') : [];
    return name === '' ? [] : [{ name, extensions: list }];
  });
}

/**
 * `<area>.choose-path` `{ mode, title, button, name?, filters? }`: the system's save, open or folder dialog; the path
 * chosen, or null when it was closed.
 */
function choosePath(services: MainServices, area: string): AppAction {
  return async (args) => {
    const mode = textArgOf(args, 'mode');
    const title = textArgOf(args, 'title');
    const buttonLabel = textArgOf(args, 'button');
    const folder = lastFolderOf(area);
    const window = services.window();
    let chosen: string | undefined;
    if (mode === 'save') {
      const options: SaveDialogOptions = {
        title,
        buttonLabel,
        defaultPath: join(folder, textArgOf(args, 'name')),
        filters: filtersOf(args),
      };
      const saved =
        window === undefined ? await dialog.showSaveDialog(options) : await dialog.showSaveDialog(window, options);
      chosen = saved.canceled || saved.filePath === '' ? undefined : saved.filePath;
    } else {
      const options: OpenDialogOptions = {
        title,
        buttonLabel,
        defaultPath: folder,
        properties: mode === 'folder' ? ['openDirectory', 'createDirectory'] : ['openFile'],
        ...(mode === 'folder' ? {} : { filters: filtersOf(args) }),
      };
      const opened =
        window === undefined ? await dialog.showOpenDialog(options) : await dialog.showOpenDialog(window, options);
      chosen = opened.canceled ? undefined : opened.filePaths[0];
    }
    if (chosen === undefined) {
      return null;
    }
    lastFolders.set(area, mode === 'folder' ? chosen : dirname(chosen));
    return chosen;
  };
}

/** The extensions an export's file is opened with: its formats' own (`transfer.export`). */
const exportedTypes: ReadonlySet<string> = new Set(['json', 'jsonl', 'csv']);

/**
 * `transfer.open-path` `{ path }`: the file of an export in the system's application for it, only when an export of
 * this session wrote it, and only when its extension is its format's own; a file the user named otherwise
 * (`orders.html`) is shown in its folder instead, and any other path is refused (R14.10, T24).
 */
export const openPath: AppAction = async (args) => {
  const path = textArgOf(args, 'path');
  switch (openedAs(path, { writers: ['transfer.export'], opens: exportedTypes })) {
    case 'refuse':
      throw new Error(exportText.notWritten(path));
    case 'show':
      shell.showItemInFolder(path);
      return null;
    case 'open': {
      const failed = await shell.openPath(path);
      if (failed !== '') {
        throw new Error(failed);
      }
      return null;
    }
  }
};

/** `transfer.reveal-path` `{ path }`: the file or the folder in the system's file manager. */
const revealPath: AppAction = (args) => {
  shell.showItemInFolder(textArgOf(args, 'path'));
  return Promise.resolve(null);
};

/** The actions of the transfer area, by name. */
export const actions: AreaActions = (services) => ({
  'transfer.choose-path': choosePath(services, 'transfer'),
  'transfer.open-path': openPath,
  'transfer.reveal-path': revealPath,
  'transfer.read-file': async (args) => {
    const most = Number(jsonFields(args)['most']);
    return readImportFile(textArgOf(args, 'path'), most);
  },
});

/** The actions of the backup area, by name. */
export const backupActions: AreaActions = (services) => ({
  'backup.choose-path': choosePath(services, 'backup'),
  'backup.list-names': async (args) => [...(await listNames(textArgOf(args, 'folder')))],
  'backup.read-archive-list': async (args) => readArchiveList(textArgOf(args, 'path')),
  'backup.list-folder': async (args) => listFolder(textArgOf(args, 'path')),
  'backup.read-metadata': async (args) => {
    const paths = jsonFields(args)['paths'];
    const list = Array.isArray(paths) ? paths.filter((one): one is string => typeof one === 'string') : [];
    return [...(await readMetadata(list))];
  },
});
