/**
 * Feature: playground.open-file
 *
 * Opens a file of mongosh code as a playground, with the connection and the database it had the last time. They are
 * kept in Datardo's data by the file's path, never in the file. Opening a file runs nothing of it. Ported from the
 * README's section **Desktop app** of Mongoster and `src/playground/playground.ts` (`TARGETS_KEY`, `setTarget`).
 */
import type { Json } from '../../shared/engine-request';
import type { Answers, Context, Outcome, ReadFeature, ReadRequest } from '../../shared/feature';
import { needRead, refuse } from '../../shared/feature';
import { connectionId, featureId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { activeTabOf } from '../../shared/state/tabs';
import { activationSteps } from '../tab/activate';
import { sameTab } from '../tab/open';
import { appPlan, appStep, mongoConnection, mongoConnections } from './plans/common';
import { connectionDatabase } from './open';
import { chosenTarget, refuseNoConnection } from './target';
import { text } from './text';
import { jsonObject, playgroundOf, startArgs, textArgument } from './types';

/** A file over 5 MB is not opened as a playground (Datardo's choice). */
export const largestFile = 5 * 1024 * 1024;

/** The read of the file to open, with the system's open dialog: the path, or null when it was closed. */
export const fileReadId = 'playground.open-file:file';

/** The read of the file's text, as UTF-8. */
export const textReadId = 'playground.open-file:text';

/** The read of the connection and the database Datardo remembers for a path. */
export const rememberedReadId = 'playground.open-file:remembered';

/** The extensions of the filter **Playgrounds** of the open dialog. */
export const openExtensions: readonly string[] = ['mongodb.js', 'js'];

/** What the read of a file answers. */
export type FileText =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'missing' }
  | { readonly kind: 'too-large' }
  | { readonly kind: 'not-text' }
  | { readonly kind: 'failed'; readonly error: string };

/** The file's name, from its path: `report.mongodb.js`. */
export function fileName(path: string): string {
  return path.split(/[\\/]/u).pop() ?? path;
}

/** The bytes of a file as text, when they are UTF-8 (a byte order mark is left out); undefined otherwise. */
export function decodedText(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch (error) {
    // A fatal decoder throws a TypeError for bytes that are not UTF-8: the file is not text.
    if (error instanceof TypeError) {
      return undefined;
    }
    throw error;
  }
}

/** The system's open dialog, titled **Open playground**, with the filters **Playgrounds** and **All files**. */
export const fileRead: ReadFeature = {
  kind: 'read',
  id: featureId(fileReadId),
  request: (): ReadRequest => ({
    kind: 'app',
    action: 'playground.choose-file',
    args: {
      mode: 'open',
      title: text.openFile.dialog,
      filters: [
        { name: text.openFile.filter, extensions: [...openExtensions] },
        { name: text.openFile.allFiles, extensions: ['*'] },
      ],
    },
  }),
  parse: (replies) => (typeof replies[0] === 'string' ? replies[0] : null),
};

/** The file's text: the main process refuses a file over {@link largestFile} before reading it. */
export const textRead: ReadFeature = {
  kind: 'read',
  id: featureId(textReadId),
  request: (_context: Context, args: Json): ReadRequest => ({ kind: 'app', action: 'playground.read-file', args }),
  parse: (replies) => replies[0],
};

/** The connection and the database remembered for a path, or null. */
export const rememberedRead: ReadFeature = {
  kind: 'read',
  id: featureId(rememberedReadId),
  request: (_context: Context, args: Json): ReadRequest => ({ kind: 'app', action: 'playground.remembered', args }),
  parse: (replies) => replies[0] ?? null,
};

function refusalOf(found: FileText, path: string): Outcome | undefined {
  const file = fileName(path);
  switch (found.kind) {
    case 'text':
      return undefined;
    case 'missing':
      return refuse('playground.open-file/no-file', text.openFile.noFile(path));
    case 'too-large':
      return refuse('playground.open-file/too-large', text.openFile.tooLarge(file));
    case 'not-text':
      return refuse('playground.open-file/not-text', text.openFile.notText(file));
    case 'failed':
      return refuse('playground.open-file/open-failed', text.openFile.openFailed(file, found.error));
  }
}

/** The database of the active tab, when it shows one, for a file Datardo never opened. */
function activeDatabase(state: AppState): string | undefined {
  const active = activeTabOf(state.tabs);
  const shows = active?.shows;
  switch (shows?.kind) {
    case 'collection':
    case 'document':
      return shows.database;
    case 'page':
      return shows.database;
    case 'playground':
      return active === undefined ? undefined : playgroundOf(state, active.id)?.defaultDatabase;
    case 'app':
    case 'keys':
    case 'key':
    case 'console':
    case undefined:
      return undefined;
  }
}

/** The connection and the database it opens on, when Datardo can tell them without asking. */
function knownTarget(
  state: AppState,
  remembered: Json | undefined,
): { connection: string; database: string } | undefined {
  const kept = jsonObject(remembered);
  const keptConnection = mongoConnection(state, typeof kept?.['connection'] === 'string' ? kept['connection'] : '');
  if (keptConnection !== undefined && typeof kept?.['database'] === 'string') {
    return { connection: keptConnection.id, database: kept['database'] };
  }
  const current = mongoConnection(state, state.nav.current);
  return current === undefined
    ? undefined
    : { connection: current.id, database: activeDatabase(state) ?? connectionDatabase };
}

/**
 * Feature: playground.open-file — the file (`args.path`, or the system's dialog), its text, and the connection and
 * database remembered for it, or asked; then `open the playground <path>`, an app step. A file already open in a tab
 * makes that tab active instead.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const { state } = context;
  if (mongoConnections(state).length === 0) {
    return refuseNoConnection('playground.open-file');
  }
  const path = textArgument(startArgs(answers), 'path') ?? answers['file'];
  if (path === undefined) {
    return needRead('file', fileReadId);
  }
  if (typeof path !== 'string') {
    return appPlan(text.openFile.title, [], text.openFile.cannotUndo);
  }
  // A saved playground is the same tab by its path alone, whatever its connection (`tab.same-target`).
  const open = sameTab(state, { kind: 'playground', connection: connectionId(''), title: '', file: path });
  if (open !== undefined) {
    const steps = open.id === state.tabs.active ? [] : activationSteps(state, open);
    return appPlan(text.openFile.title, steps, text.openFile.cannotUndo);
  }
  const found = answers['text'] as FileText | undefined;
  if (found === undefined) {
    return needRead('text', textReadId, { path, largest: largestFile });
  }
  const refusal = refusalOf(found, path);
  if (refusal !== undefined || found.kind !== 'text') {
    return refusal ?? appPlan(text.openFile.title, [], text.openFile.cannotUndo);
  }
  if (!('remembered' in answers)) {
    return needRead('remembered', rememberedReadId, { path });
  }
  let target = knownTarget(state, answers['remembered'] as Json | undefined);
  if (target === undefined) {
    const choice = chosenTarget(state, answers, undefined, 'playground.open-file');
    if (choice.kind === 'outcome') {
      return choice.outcome;
    }
    target = { connection: choice.connection.id, database: choice.database };
  }
  const step = appStep(text.openFile.step(path), 'playground.open', {
    ...target,
    file: path,
    title: fileName(path),
    text: found.text,
    caret: 'start',
  });
  return appPlan(text.openFile.title, [step], text.openFile.cannotUndo);
}
