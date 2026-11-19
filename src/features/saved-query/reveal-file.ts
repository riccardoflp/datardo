/**
 * Feature: saved-query.reveal-file
 *
 * Shows the file of a saved query in the system's file manager, with the file selected: **Reveal file** in the **…**
 * menu of a query in the folder, started with `{ connection, saved }`, and in the warning about a file that was
 * skipped, started with `{ connection, file }`. Datardo has no editor for these files; once one is corrected in any
 * editor, the folder is read again (`saved-query.read-folder`). The main process says *Could not open the file:* and
 * the system's reason when the file is no longer there.
 */
import { noDanger, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { queriesFolderOf } from './read-folder';
import { text } from './text';
import { appStep, argumentsOf, fullPath, nothingToDo, savedRefOf } from './types';

function isSafePath(file: string): boolean {
  return file !== '' && !file.split('/').some((part) => part === '' || part === '.' || part === '..');
}

/** The file to reveal, inside the queries folder: `args.file`, or the file of the query in the folder `args.saved`. */
export function fileToReveal(answers: Answers): string | undefined {
  const named = argumentsOf(answers)['file'];
  const ref = savedRefOf(answers);
  const file = typeof named === 'string' ? named : ref?.place === 'folder' ? ref.file : undefined;
  return file !== undefined && isSafePath(file) ? file : undefined;
}

/** Feature: saved-query.reveal-file — `reveal C:\repo\.mongoster\queries\shop\orders\paid.json in the file manager`. */
export function plan(context: Context, answers: Answers): Outcome {
  const named = argumentsOf(answers)['connection'];
  const target = 'connection' in context.target ? context.target.connection : undefined;
  const connection = typeof named === 'string' ? named : target;
  const folder = connection === undefined ? undefined : queriesFolderOf(context, connection);
  const file = fileToReveal(answers);
  if (folder === undefined || file === undefined) {
    return nothingToDo(text.reveal.title, text.reveal.cannotUndo);
  }
  return run({
    title: text.reveal.title,
    steps: [
      appStep(
        'saved-query.reveal',
        { queriesFolder: folder, file },
        text.reveal.step(fullPath(folder, file, context.platform)),
      ),
    ],
    danger: noDanger,
    undo: { cannot: text.reveal.cannotUndo },
    publishes: false,
    after: [],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('saved-query.reveal-file'), plan };
