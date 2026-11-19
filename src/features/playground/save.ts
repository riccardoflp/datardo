/**
 * Feature: playground.save
 *
 * Writes the script to its file; a playground that has none yet, and **Save as…**, ask where with the system's save
 * dialog. Datardo then remembers the connection and the database of the file's path, so that it opens on them again
 * (`playground.open-file`). Saving runs nothing and sends nothing to the deployment.
 */
import type { Answers, Context, FileStep, Outcome, ReadFeature, ReadRequest } from '../../shared/feature';
import { needRead, refuse } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { stepText } from '../runner/step-text';
import { fileName } from './open-file';
import { appPlan, appStep } from './plans/common';
import { text } from './text';
import { hasUnsavedChanges, jsonObject, playgroundOf, startArgs, startedTab, type PlaygroundTab } from './types';

/** The read of the file to save to, with the system's save dialog: the path, or null when it was closed. */
export const fileReadId = 'playground.save:file';

/** The extension a playground is saved with. */
export const playgroundExtension = '.mongodb.js';

/** The system's save dialog, titled **Save playground**, offering a name and the filter **Playgrounds**. */
export const fileRead: ReadFeature = {
  kind: 'read',
  id: featureId(fileReadId),
  request: (_context, args): ReadRequest => ({
    kind: 'app',
    action: 'playground.choose-file',
    args: {
      mode: 'save',
      title: text.save.dialog,
      name: jsonObject(args)?.['name'] ?? '',
      filters: [{ name: text.save.filter, extensions: ['mongodb.js'] }],
    },
  }),
  parse: (replies) => (typeof replies[0] === 'string' ? replies[0] : null),
};

/** The read that tries the file before it is written: null when it can be written, or why it cannot. */
export const writableReadId = 'playground.save:writable';

/** `playground.save:writable`: an app read that opens the file for writing without changing it. */
export const writableRead: ReadFeature = {
  kind: 'read',
  id: featureId(writableReadId),
  request: (_context, args): ReadRequest => ({ kind: 'app', action: 'playground.writable', args }),
  parse: (replies) => (typeof replies[0] === 'string' ? replies[0] : null),
};

/** A path whose name was typed without an extension gets `.mongodb.js`: `report` is saved as `report.mongodb.js`. */
export function withExtension(path: string): string {
  return fileName(path).includes('.') ? path : `${path}${playgroundExtension}`;
}

/** The name the dialog offers: the file's own name, or `Playground 1.mongodb.js`. */
export function offeredName(tab: PlaygroundTab): string {
  return tab.shows.file === undefined ? `${tab.shows.title}${playgroundExtension}` : fileName(tab.shows.file);
}

/** `write <path>`: the text of the editor as UTF-8, with the line endings it has. */
export function writeStep(path: string, script: string): FileStep {
  const step = {
    kind: 'file' as const,
    action: 'write' as const,
    path,
    content: { writer: 'playground.text', args: { text: script } },
  };
  return { ...step, text: stepText(step) };
}

/** *Could not save <file>: <error>*, which the writer of the file step gives when the file cannot be written. */
export function saveFailedMessage(path: string, error: string): string {
  return text.save.failed(fileName(path), error);
}

function asked(answers: Answers): boolean {
  return answers['args'] === 'as' || startArgs(answers)['as'] === true;
}

/**
 * Feature: playground.save — `write <path>`, then `remember the connection and the database of <path>`. A playground
 * without a file, and **Save as…** (`args` `as`), ask for the file first; a dialog closed saves nothing. The file is
 * tried first: one that cannot be written is refused with why (`/save-failed`), and nothing is written.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const tab = startedTab(context, startArgs(answers));
  const playground = tab === undefined ? undefined : playgroundOf(context.state, tab.id);
  const title = asked(answers) ? text.save.titleAs : text.save.title;
  if (tab === undefined || playground === undefined) {
    return appPlan(title, [], text.save.cannotUndo);
  }
  const saveAs = asked(answers) || tab.shows.file === undefined;
  if (!saveAs && !hasUnsavedChanges(playground)) {
    return appPlan(title, [], text.save.cannotUndo);
  }
  const chosen = saveAs ? answers['file'] : tab.shows.file;
  if (chosen === undefined) {
    return needRead('file', fileReadId, { name: offeredName(tab) });
  }
  if (typeof chosen !== 'string') {
    return appPlan(title, [], text.save.cannotUndo);
  }
  const path = withExtension(chosen);
  const writable = answers['writable'];
  if (writable === undefined) {
    return needRead('writable', writableReadId, { path });
  }
  if (typeof writable === 'string') {
    // The text stays in the tab, with its dot; a close or a quit that asked for the save stops here.
    return refuse('playground.save/save-failed', saveFailedMessage(path, writable));
  }
  const remember = appStep(text.save.remember(path), 'playground.remember', {
    tab: tab.id,
    path,
    connection: tab.shows.connection,
    database: playground.defaultDatabase,
    text: playground.text,
  });
  return appPlan(title, [writeStep(path, playground.text), remember], text.save.cannotUndo);
}
