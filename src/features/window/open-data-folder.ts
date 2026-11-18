/**
 * Feature: window.open-data-folder
 *
 * Shows, in the system's file manager, the folder where Datardo keeps its settings, connections, undo history and
 * tasks: the one in use, which `DATARDO_DATA` may name.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { run } from '../../shared/feature';
import { folderNotOpened } from './text';
import { appStep, windowPlan } from './types';

/** The code of the error the main process raises when no file manager opens the folder. */
export const folderNotOpenedCode = 'window.open-data-folder/failed';

/** The error the main process raises when the folder cannot be opened, with the path in its message. */
export function folderNotOpenedError(path: string): { readonly code: string; readonly message: string } {
  return { code: folderNotOpenedCode, message: folderNotOpened(path) };
}

/**
 * Feature: window.open-data-folder
 *
 * One app step, `open <the data folder> in the file manager`. Nothing in the folder is created, changed or deleted.
 */
export function plan(context: Context, _answers: Answers): Outcome {
  const folder = context.state.app.dataFolder;
  return run(
    windowPlan('Open data folder', [appStep(`open ${folder} in the file manager`, 'window.open-folder', { folder })]),
  );
}
