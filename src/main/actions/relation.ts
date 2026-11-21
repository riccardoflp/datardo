/**
 * The actions of the relation area the runner carries out for its app steps and app reads: the sample of a
 * Relationship diagram (`relation.sample`), selecting a box of an open diagram (`relation.select-box`), the references
 * the MCP tool `describe_relations` asks for (`relation.detect`), the system's
 * save dialog of **Save SVG…** (`relation.choose-file`) and **Open** of its notification (`relation.open-file`).
 */
import { join } from 'node:path';
import { app, dialog, shell, type SaveDialogOptions } from 'electron';
import { text } from '../../features/relation/text';
import type { AppAction } from '../../runner/ports';
import type { Json } from '../../shared/engine-request';
import { relationActions } from '../relations';
import type { MainServices } from '../services';
import type { AreaActions } from '.';

function fields(args: Json): Readonly<Record<string, Json>> {
  return typeof args === 'object' && args !== null && !Array.isArray(args)
    ? (args as Readonly<Record<string, Json>>)
    : {};
}

/**
 * `relation.choose-file` `{ title, name, kind, extensions }`: the system's save dialog, in the user's home folder with
 * the name given; the path, or null when it was closed. The system asks before replacing a file.
 */
function chooseFile(services: MainServices): AppAction {
  return async (args) => {
    const given = fields(args);
    const name = typeof given['name'] === 'string' ? given['name'] : 'diagram.svg';
    const extensions = Array.isArray(given['extensions'])
      ? given['extensions'].filter((each): each is string => typeof each === 'string')
      : ['svg'];
    const options: SaveDialogOptions = {
      title: typeof given['title'] === 'string' ? given['title'] : text.svg.dialog,
      defaultPath: join(app.getPath('home'), name),
      filters: [{ name: typeof given['kind'] === 'string' ? given['kind'] : text.svg.kind, extensions }],
    };
    const window = services.window();
    const chosen =
      window === undefined ? await dialog.showSaveDialog(options) : await dialog.showSaveDialog(window, options);
    return chosen.canceled || chosen.filePath === '' ? null : chosen.filePath;
  };
}

/** `relation.open-file` `{ path }`: the file opened with the system's program for it. */
const openFile: AppAction = async (args) => {
  const path = fields(args)['path'];
  const failure = typeof path === 'string' && path !== '' ? await shell.openPath(path) : 'no file';
  if (failure !== '') {
    throw new Error(failure);
  }
};

/** The actions of the relation area. */
export const actions: AreaActions = (services) => ({
  ...relationActions(services),
  'relation.choose-file': chooseFile(services),
  'relation.open-file': openFile,
});
