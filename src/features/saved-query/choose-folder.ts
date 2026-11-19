/**
 * Feature: saved-query.choose-folder
 *
 * Gives a MongoDB connection the folder where its saved queries *in the folder* are files, or changes it. The folder
 * chosen is the folder itself: files go to `<folder>/<database>/<collection>/`. No file is moved or deleted. It is
 * asked by `saved-query.save` and `saved-query.move` when the connection has no queries folder, which then add its
 * step to their own plans; and started from Go to for the current connection.
 *
 * The folder is asked as the field `folder` of a question titled **Queries folder of Local**, which the window shows
 * as the system's folder dialog, starting in the folder the connection has (or the user's home folder, which only the
 * main process knows).
 */
import type { ConnectionView } from '../../shared/connection';
import {
  ask,
  noDanger,
  run,
  type After,
  type AppStep,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { Question } from '../../shared/question';
import { text } from './text';
import { appStep, argumentsOf, nothingToDo } from './types';

/** Who asks for the folder: a save or a move that needs one, or the user from Go to. */
export type FolderAsker = 'save' | 'alone';

/** The question of the folder, with the reason first when a save needs one. */
export function folderQuestion(
  connection: Pick<ConnectionView, 'name' | 'queriesFolder'>,
  asker: FolderAsker,
): Question {
  const current = connection.queriesFolder?.trim() ?? '';
  return {
    title: text.chooseFolder.title(connection.name),
    ...(asker === 'save' ? { text: text.chooseFolder.intro(connection.name) } : {}),
    button: text.chooseFolder.button,
    fields: [
      {
        kind: 'text',
        key: 'folder',
        label: text.chooseFolder.title(connection.name),
        ...(current === '' ? {} : { default: current }),
      },
    ],
  };
}

/** The folder the user chose, when the question was answered. */
export function chosenFolder(answers: Answers): string | undefined {
  const folder = answers['folder'];
  return typeof folder === 'string' && folder.trim() !== '' ? folder.trim() : undefined;
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

/** Feature: saved-query.choose-folder — asks the folder, then `save the connection Local` with it. */
export function plan(context: Context, answers: Answers): Outcome {
  const connection = connectionOf(context, answers);
  if (connection?.engine !== 'mongodb') {
    return nothingToDo(text.chooseFolder.planTitle, text.chooseFolder.cannotUndo);
  }
  const folder = chosenFolder(answers);
  if (folder === undefined) {
    return ask(folderQuestion(connection, 'alone'));
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
