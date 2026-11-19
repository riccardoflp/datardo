/**
 * Feature: connection.rename-folder — gives a folder another name, for every connection in it. Started from the menu
 * of a folder, with the folder in its arguments.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { ask, noDanger, run } from '../../shared/feature';
import { organizeText } from './text';
import { appStep, argumentsOf, foldersInUse, nothingToDo } from './types';

/** The folder a feature of the menu of a folder was started on, from its arguments. */
export function folderOf(answers: Answers): string | undefined {
  const folder = argumentsOf(answers)['folder'];
  return typeof folder === 'string' && folder !== '' ? folder : undefined;
}

/** Feature: connection.rename-folder — asks the new name, then `rename the folder <folder> to <new name>`. */
export function plan(context: Context, answers: Answers): Outcome {
  const folder = folderOf(answers);
  const folders = foldersInUse(context.state);
  if (folder === undefined || !folders.includes(folder)) {
    return nothingToDo('Rename folder', organizeText.cannotUndoRename);
  }
  const typed = answers['name'];
  if (typeof typed !== 'string') {
    return ask({
      title: organizeText.renameTitle(folder),
      button: organizeText.rename,
      fields: [
        {
          kind: 'text',
          key: 'name',
          label: organizeText.folderName,
          default: folder,
          rules: [
            { kind: 'not-empty', message: organizeText.enterAName },
            {
              kind: 'not-one-of',
              values: folders.filter((each) => each !== folder),
              message: organizeText.folderExists,
            },
          ],
        },
      ],
    });
  }
  const name = typed.trim();
  const title = organizeText.renameTitle(folder);
  if (name === folder || name === '' || folders.includes(name)) {
    return nothingToDo(title, organizeText.cannotUndoRename);
  }
  return run({
    title,
    steps: [appStep('connection.rename-folder', { folder, name }, organizeText.renameFolder(folder, name))],
    danger: noDanger,
    undo: { cannot: organizeText.cannotUndoRename },
    publishes: false,
    after: [],
  });
}
