/**
 * Feature: connection.move-to-folder — groups connections in folders, on the Home page and in the connection switcher.
 * A folder exists only while a connection is in it.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Answers, Context, Outcome } from '../../shared/feature';
import { ask, noDanger, run } from '../../shared/feature';
import type { Question } from '../../shared/question';
import { organizeText } from './text';
import { appStep, argumentsOf, foldersInUse, nothingToDo, targetOrCurrent } from './types';

/** The value of **New folder…** in a list of folders. */
export const newFolderChoice = 'new-folder';

/** The value of **No folder** in a list of folders. */
export const noFolderChoice = 'no-folder';

/** The value of a folder in a list of folders: never one of the two above. */
export function folderChoice(folder: string): string {
  return `folder:${folder}`;
}

/** The folder of a value of a list of folders, or undefined for another value. */
export function folderOfChoice(value: unknown): string | undefined {
  return typeof value === 'string' && value.startsWith('folder:') ? value.slice('folder:'.length) : undefined;
}

/** The question of **New folder…**: a name, which is not empty. */
export function newFolderQuestion(key: string): Question {
  return {
    title: organizeText.newFolderTitle,
    button: organizeText.move,
    fields: [
      {
        kind: 'text',
        key,
        label: organizeText.folderName,
        rules: [{ kind: 'not-empty', message: organizeText.enterAName }],
      },
    ],
  };
}

function whichFolder(connection: ConnectionView, folders: readonly string[]): Outcome {
  const others = folders.filter((each) => each !== connection.folder);
  return ask({
    title: organizeText.moveTitle(connection.name),
    button: organizeText.move,
    fields: [
      {
        kind: 'pick-one',
        key: 'folder',
        label: organizeText.moveTitle(connection.name),
        choices: [
          ...others.map((folder) => ({ value: folderChoice(folder), label: folder })),
          { value: newFolderChoice, label: organizeText.newFolder },
          ...(connection.folder === undefined ? [] : [{ value: noFolderChoice, label: organizeText.noFolder }]),
        ],
      },
    ],
  });
}

/** The folder chosen: a name, `null` for no folder, undefined while it is not known yet; or the question to ask. */
function chosen(connection: ConnectionView, answers: Answers, folders: readonly string[]): string | null | Outcome {
  const given = argumentsOf(answers)['folder'];
  if (typeof given === 'string') {
    return given.trim() === '' ? null : given.trim();
  }
  const picked = answers['folder'];
  if (picked === undefined) {
    return whichFolder(connection, folders);
  }
  if (picked === noFolderChoice) {
    return null;
  }
  if (picked === newFolderChoice) {
    const typed = answers['folderName'];
    return typeof typed === 'string' ? typed.trim() : ask(newFolderQuestion('folderName'));
  }
  return folderOfChoice(picked) ?? null;
}

/** Feature: connection.move-to-folder — `move <name> to the folder <folder>`, or `move <name> out of its folder`. */
export function plan(context: Context, answers: Answers): Outcome {
  const connection = targetOrCurrent(context);
  if (connection === undefined) {
    return nothingToDo('Move to folder', organizeText.cannotUndoMove);
  }
  const folder = chosen(connection, answers, foldersInUse(context.state));
  if (typeof folder === 'object' && folder !== null) {
    return folder;
  }
  const title = organizeText.moveTitle(connection.name);
  if ((folder ?? undefined) === connection.folder || folder === '') {
    return nothingToDo(title, organizeText.cannotUndoMove);
  }
  const text = folder === null ? organizeText.moveOut(connection.name) : organizeText.moveTo(connection.name, folder);
  return run({
    title,
    steps: [appStep('connection.set-folder', { connection: connection.id, folder }, text)],
    danger: noDanger,
    undo: { cannot: organizeText.cannotUndoMove },
    publishes: false,
    after: [],
  });
}
