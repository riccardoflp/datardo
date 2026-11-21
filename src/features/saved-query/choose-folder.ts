/**
 * Feature: saved-query.choose-folder
 *
 * Gives a MongoDB connection the folder where its saved queries *in the folder* are files, or changes it. The folder
 * chosen is the folder itself: files go to `<folder>/<database>/<collection>/`. No file is moved or deleted. It is
 * asked by `saved-query.save` and `saved-query.move` when the connection has no queries folder, which then add its
 * step to their own plans; and started from Go to for the current connection.
 *
 * The folder is asked in the system's folder dialog titled **Queries folder of Local**, which the main process opens
 * for the read `saved-query.choose-folder:dialog`, starting in the folder the connection has (or the user's home
 * folder, which only the main process knows); its answer comes back as `folder`, `null` when the dialog was closed.
 * A save first says why it needs a folder, with **Choose folder…**, which answers `saved-query.choose-folder: true`.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Json } from '../../shared/engine-request';
import {
  ask,
  needRead,
  noDanger,
  run,
  type After,
  type AppStep,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
  type ReadFeature,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { Question } from '../../shared/question';
import { text } from './text';
import { appStep, argumentsOf, nothingToDo } from './types';

/** Who asks for the folder: a save or a move that needs one, or the user from Go to. */
export type FolderAsker = 'save' | 'alone';

/** The read that opens the system's folder dialog and gives the folder chosen, or `null` when it was closed. */
export const folderDialogRead = 'saved-query.choose-folder:dialog';

/** The app read the main process answers by opening the system's folder dialog. */
export const pickFolderAction = 'saved-query.pick-folder';

/** The key under which **Choose folder…** answers the question a save asks first. */
export const introKey = 'saved-query.choose-folder';

/**
 * The question a save or a move asks first, when the connection has no queries folder: *Choose the queries folder of
 * Local.*, why, and **Choose folder…**, which opens the system's folder dialog.
 */
export function introQuestion(connection: Pick<ConnectionView, 'name'>): Question {
  return {
    title: text.chooseFolder.title(connection.name),
    text: text.chooseFolder.intro(connection.name),
    button: text.chooseFolder.button,
    fields: [],
    key: introKey,
    element: 'saved-query.choose-folder@dialog',
  };
}

/** The system's folder dialog, titled **Queries folder of Local**, starting in the folder the connection has. */
export function dialogNeed(connection: Pick<ConnectionView, 'name' | 'queriesFolder'>): Outcome {
  const current = connection.queriesFolder?.trim() ?? '';
  return needRead('folder', folderDialogRead, {
    title: text.chooseFolder.title(connection.name),
    start: current === '' ? null : current,
  });
}

/** The folder the user chose, once the system's dialog answered with one. */
export function chosenFolder(answers: Answers): string | undefined {
  const folder = answers['folder'];
  return typeof folder === 'string' && folder.trim() !== '' ? folder.trim() : undefined;
}

/**
 * What choosing the folder needs next: the question a save asks first, then the system's dialog; `undefined` once the
 * dialog answered, with a folder (`chosenFolder`) or closed without one.
 */
export function folderNeed(
  connection: Pick<ConnectionView, 'name' | 'queriesFolder'>,
  answers: Answers,
  asker: FolderAsker,
): Outcome | undefined {
  if ('folder' in answers) {
    return undefined;
  }
  return asker === 'save' && answers[introKey] !== true ? ask(introQuestion(connection)) : dialogNeed(connection);
}

/** `save the connection Local`, with its queries folder. */
export function folderStep(connection: Pick<ConnectionView, 'id' | 'name'>, folder: string): AppStep {
  return appStep(
    'saved-query.set-folder',
    { connection: connection.id, queriesFolder: folder },
    text.chooseFolder.step(connection.name),
  );
}

/** *Queries saved in the folder go to C:\repo\.mongoster\queries.* */
export function chosenNotice(folder: string): After {
  return { kind: 'notify', level: 'info', text: text.chooseFolder.chosen(folder) };
}

/** The connection: `args.connection`, the connection of the target, or the current connection. */
function connectionOf(context: Context, answers: Answers): ConnectionView | undefined {
  const named = argumentsOf(answers)['connection'];
  const target = 'connection' in context.target ? context.target.connection : undefined;
  const id = typeof named === 'string' ? named : (target ?? context.state.nav.current);
  return context.state.connections.saved.find((each) => each.id === id);
}

/** Feature: saved-query.choose-folder — the system's folder dialog, then `save the connection Local` with it. */
export function plan(context: Context, answers: Answers): Outcome {
  const connection = connectionOf(context, answers);
  if (connection?.engine !== 'mongodb') {
    return nothingToDo(text.chooseFolder.planTitle, text.chooseFolder.cannotUndo);
  }
  const need = folderNeed(connection, answers, 'alone');
  if (need !== undefined) {
    return need;
  }
  const folder = chosenFolder(answers);
  if (folder === undefined) {
    return nothingToDo(text.chooseFolder.planTitle, text.chooseFolder.cannotUndo);
  }
  return run({
    title: text.chooseFolder.planTitle,
    steps: [folderStep(connection, folder)],
    danger: noDanger,
    undo: { cannot: text.chooseFolder.cannotUndo },
    publishes: false,
    after: [chosenNotice(folder)],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('saved-query.choose-folder'), plan };

/** `saved-query.choose-folder:dialog`: the system's folder dialog, an app read that answers the folder, or `null`. */
export const dialogFeature: ReadFeature = {
  kind: 'read',
  id: featureId(folderDialogRead),
  request: (_context: Context, args: Json) => ({ kind: 'app', action: pickFolderAction, args }),
  parse: (replies) => (typeof replies[0] === 'string' && replies[0].trim() !== '' ? replies[0] : null),
};
