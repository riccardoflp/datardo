/**
 * The actions of the chart area the runner carries out for its app reads: the system's save dialog of **Save
 * picture…** (`chart.choose-file`). The filter a click on a mark puts in the bar is the action `query.set-filter`, which
 * the schema area registers.
 */
import { join } from 'node:path';
import { app, dialog, type SaveDialogOptions } from 'electron';
import { text } from '../../features/chart/text';
import type { AppAction } from '../../runner/ports';
import type { Json } from '../../shared/engine-request';
import type { MainServices } from '../services';
import type { AreaActions } from '.';

function fields(args: Json): Readonly<Record<string, Json>> {
  return typeof args === 'object' && args !== null && !Array.isArray(args)
    ? (args as Readonly<Record<string, Json>>)
    : {};
}

/**
 * `chart.choose-file` `{ title, name, kind, extensions }`: the system's save dialog titled **Save chart**, in the user's
 * pictures folder with the name proposed, for files of the kind *PNG image*; the path, or null when it was closed. The
 * system asks before a file is replaced.
 */
function chooseFile(services: MainServices): AppAction {
  return async (args) => {
    const given = fields(args);
    const name = typeof given['name'] === 'string' ? given['name'] : 'chart.png';
    const options: SaveDialogOptions = {
      title: typeof given['title'] === 'string' ? given['title'] : text.picture.title,
      defaultPath: join(app.getPath('pictures'), name),
      filters: [{ name: typeof given['kind'] === 'string' ? given['kind'] : text.picture.kind, extensions: ['png'] }],
    };
    const window = services.window();
    const chosen =
      window === undefined ? await dialog.showSaveDialog(options) : await dialog.showSaveDialog(window, options);
    return chosen.canceled || chosen.filePath === '' ? null : chosen.filePath;
  };
}

/** The actions of the chart area. */
export const actions: AreaActions = (services) => ({
  'chart.choose-file': chooseFile(services),
});
