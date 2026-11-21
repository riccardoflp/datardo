/**
 * The actions of the Watch changes area: the streams of the pages and the app steps of their controls
 * (`src/main/watch-streams.ts`), and the system's save dialog of `watch.export`.
 */
import { app, dialog, type SaveDialogOptions } from 'electron';
import { join } from 'node:path';
import type { AreaActions } from '.';
import type { AppAction } from '../../runner/ports';
import { objectOf } from '../../features/history/types';
import type { MainServices } from '../services';
import { watchStreamsOf } from '../watch';

/** `watch.choose-file` `{ mode: 'save', name }`: the system's save dialog of an export; the path, or null. */
function chooseFile(services: MainServices): AppAction {
  return async (args) => {
    const name = objectOf(args)['name'];
    const options: SaveDialogOptions = {
      title: 'Export change events',
      buttonLabel: 'Export',
      defaultPath: join(app.getPath('home'), typeof name === 'string' ? name : 'changes.jsonl'),
      filters: [{ name: 'JSON Lines', extensions: ['jsonl'] }],
    };
    const window = services.window();
    const chosen =
      window === undefined ? await dialog.showSaveDialog(options) : await dialog.showSaveDialog(window, options);
    return chosen.canceled || chosen.filePath === '' ? null : chosen.filePath;
  };
}

/** The actions of this area, by name. */
export const actions: AreaActions = (services) => ({
  ...watchStreamsOf(services).actions(),
  'watch.choose-file': chooseFile(services),
});
