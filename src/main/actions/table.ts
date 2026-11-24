/**
 * The actions of the table area the runner carries out for app steps and app reads: remembering the columns of a
 * collection (`table.expand`, `table.collapse`, `table.arrange-columns`), in the app's state and in
 * `state/<connection id>.json`; the formatting rules, in `formatting.json` (`table.add-format-rule`,
 * `table.edit-format-rule`, `table.edit-field-rule`, `table.move-format-rule`, `table.import-formatting`,
 * `table.toggle-formatting`, `connection.remove`); and the system's dialogs of **Export formatting…** and **Import
 * formatting…** (`table.choose-formatting-file`, `table.read-formatting-file`).
 */
import { readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { app, dialog, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
import { largestFormattingFile } from '../../features/table/formatting-file';
import { text } from '../../features/table/text';
import type { AppAction } from '../../runner/ports';
import type { Json } from '../../shared/engine-request';
import { forgetConnectionFormatting, saveCollectionRules, setFormattingHidden, setFormattingOff } from '../formatting';
import type { MainServices } from '../services';
import { saveColumns } from '../table';
import type { AreaActions } from '.';

function fields(args: Json): Readonly<Record<string, Json>> {
  return typeof args === 'object' && args !== null && !Array.isArray(args)
    ? (args as Readonly<Record<string, Json>>)
    : {};
}

/**
 * `table.choose-formatting-file` `{ name }`: the system's save dialog **Export formatting**, in the user's home folder
 * with the name given; the path, or null when it was closed. The system asks before replacing a file.
 */
function chooseFile(services: MainServices): AppAction {
  return async (args) => {
    const given = fields(args)['name'];
    const name = typeof given === 'string' ? given : 'formatting.datardo-formatting.json';
    const options: SaveDialogOptions = {
      title: text.exportFile.title,
      buttonLabel: text.exportFile.button,
      defaultPath: join(app.getPath('home'), name),
      filters: [{ name: text.exportFile.kind, extensions: ['json'] }],
    };
    const window = services.window();
    const chosen =
      window === undefined ? await dialog.showSaveDialog(options) : await dialog.showSaveDialog(window, options);
    return chosen.canceled || chosen.filePath === '' ? null : chosen.filePath;
  };
}

/**
 * `table.read-formatting-file`: the system's open dialog **Import formatting**, then the file chosen read, `{ name,
 * text }`; `{ tooLarge: true }` past 1 MB, which is not read; `{ error }` when it cannot be read; null when the dialog
 * was closed.
 */
function readChosenFile(services: MainServices): AppAction {
  return async () => {
    const options: OpenDialogOptions = {
      title: text.importFile.title,
      buttonLabel: text.importFile.button,
      properties: ['openFile'],
      filters: [
        { name: text.importFile.kind, extensions: ['json'] },
        { name: text.importFile.allFiles, extensions: ['*'] },
      ],
    };
    const window = services.window();
    const chosen =
      window === undefined ? await dialog.showOpenDialog(options) : await dialog.showOpenDialog(window, options);
    const path = chosen.canceled ? undefined : chosen.filePaths[0];
    if (path === undefined) {
      return null;
    }
    try {
      if ((await stat(path)).size > largestFormattingFile) {
        return { tooLarge: true };
      }
      return { name: basename(path), text: await readFile(path, 'utf8') };
    } catch (error: unknown) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  };
}

/** The actions of this area, by name. */
export const actions: AreaActions = (services) => ({
  'table.save-columns': (args) => saveColumns(services, args),
  'table.save-formatting': (args) => saveCollectionRules(services, args),
  'table.set-formatting-off': (args) => setFormattingOff(services, args),
  'table.set-formatting-hidden': (args) => setFormattingHidden(services, args),
  'table.forget-formatting': (args) => forgetConnectionFormatting(services, args),
  'table.choose-formatting-file': chooseFile(services),
  'table.read-formatting-file': readChosenFile(services),
});
