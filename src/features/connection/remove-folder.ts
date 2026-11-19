/**
 * Feature: connection.remove-folder — takes a folder away and leaves its connections with no folder. No connection is
 * removed, so nothing is confirmed.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import { folderOf } from './rename-folder';
import { organizeText } from './text';
import { appStep, foldersInUse, nothingToDo } from './types';

/** Feature: connection.remove-folder — `remove the folder <folder>`. */
export function plan(context: Context, answers: Answers): Outcome {
  const folder = folderOf(answers);
  if (folder === undefined || !foldersInUse(context.state).includes(folder)) {
    return nothingToDo('Remove folder', organizeText.cannotUndoRemoveFolder);
  }
  return run({
    title: organizeText.removeFolderTitle(folder),
    steps: [appStep('connection.rename-folder', { folder, name: null }, organizeText.removeFolder(folder))],
    danger: noDanger,
    undo: { cannot: organizeText.cannotUndoRemoveFolder },
    publishes: false,
    after: [],
  });
}
