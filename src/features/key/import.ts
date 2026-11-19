/**
 * Feature: key.import
 *
 * Creates the keys of a file that `key.export` wrote, in the database of the tab. The file is read through
 * `key.import-parse`, which refuses any command an export would not have written, before anything is sent.
 */
import type { Json } from '../../shared/engine-request';
import type { Answers, Context, Danger, EngineStep, Outcome, ReadFeature } from '../../shared/feature';
import { ask, needRead, noDanger, refuse, run } from '../../shared/feature';
import { connectionId, featureId } from '../../shared/ids';
import { importedKeys, type ImportedKey } from './import-parse';
import { scanCall } from './scan';
import { text } from './text';
import type { KeysPlace, UndoNote } from './types';
import {
  databaseName,
  fieldsOf,
  hexOf,
  keysKept,
  nameText,
  namesOfHex,
  notifySuccess,
  placeOf,
  readOnlyMessage,
  refreshAfter,
  undoNote,
  writeStep,
} from './types';

/** The identifier of the read of the file: the system's open dialog, then its text. */
export const fileReadId = 'key.import:file';

/** The identifier of the read that says which keys of the file exist already. */
export const existsReadId = 'key.import:exists';

/** What to do with a key of the file that exists already. */
export type WhenExisting = 'skip' | 'replace' | 'stop';

/** The file read: its path, its name and its text. */
export interface ImportFile {
  readonly path: string;
  readonly name: string;
  readonly text: string;
}

function fileOf(value: unknown): ImportFile | null | undefined {
  if (value === null) {
    return null;
  }
  const fields = fieldsOf(value);
  return typeof fields['path'] === 'string' && typeof fields['text'] === 'string'
    ? {
        path: fields['path'],
        name: typeof fields['name'] === 'string' ? fields['name'] : fields['path'],
        text: fields['text'],
      }
    : undefined;
}

function existingQuestion(): Outcome {
  return ask({
    title: text.import.existing,
    button: text.import.button,
    fields: [
      {
        kind: 'pick-one',
        key: 'existing',
        label: text.import.existing,
        choices: [
          { value: 'skip', label: text.import.skip },
          { value: 'replace', label: text.import.replace },
          { value: 'stop', label: text.import.stop },
        ],
        default: 'skip',
      },
    ],
  });
}

/** The steps of one key: `UNLINK <key>` first when it replaces one, then its lines; a line refused unlinks the key. */
export function keySteps(place: KeysPlace, key: ImportedKey, replaces: boolean): readonly EngineStep[] {
  const unlink = writeStep(place, ['UNLINK', key.name]);
  return [
    ...(replaces ? [unlink] : []),
    ...key.commands.map((command) => ({
      ...writeStep(place, command.words),
      onFailure: { kind: 'instead' as const, steps: [unlink] },
    })),
  ];
}

/** The keys imported, how many exist already, what is done with them, and those replaced (in hexadecimal). */
interface Chosen {
  readonly imported: readonly ImportedKey[];
  readonly existing: number;
  readonly policy: WhenExisting;
  readonly replaced: ReadonlySet<string>;
}

function importDanger(place: KeysPlace, file: ImportFile, chosen: Chosen, note: UndoNote): Danger {
  const fresh = chosen.imported.length - (chosen.policy === 'replace' ? chosen.existing : 0);
  const detail =
    chosen.existing === 0
      ? text.import.allNew(fresh)
      : chosen.policy === 'replace'
        ? text.import.newAndReplaced(fresh, chosen.existing)
        : text.import.newAndSkipped(fresh, chosen.existing);
  const total = chosen.imported.length + (chosen.policy === 'skip' ? chosen.existing : 0);
  const question = text.import.question(total, file.name, databaseName(place.database), place.connection.name);
  const confirmation = `${question}\n${detail} ${note.line}`;
  return chosen.policy === 'replace' && chosen.existing > 0 && !note.recorded
    ? { kind: 'destructive', text: confirmation, button: text.import.button, name: String(chosen.existing) }
    : { kind: 'confirm', text: confirmation, button: text.import.button };
}

function importPlan(context: Context, place: KeysPlace, file: ImportFile, chosen: Chosen): Outcome {
  const note = undoNote(context, place, chosen.imported.length);
  const database = databaseName(place.database);
  return run({
    title: text.import.title(file.name),
    steps: chosen.imported.flatMap((key) => keySteps(place, key, chosen.replaced.has(hexOf(key.name)))),
    danger: chosen.imported.length === 0 ? noDanger : importDanger(place, file, chosen, note),
    undo: note.recorded
      ? keysKept(
          place.database,
          chosen.imported.map((key) => key.name),
        )
      : { cannot: note.line },
    publishes: false,
    after: [
      notifySuccess(
        chosen.policy === 'skip' && chosen.existing > 0
          ? text.import.doneSkipped(chosen.imported.length, database, chosen.existing)
          : text.import.done(chosen.imported.length, database),
      ),
      refreshAfter(place),
    ],
  });
}

/**
 * Feature: key.import — the file, **When a key already exists**, `EXISTS` for each key, then the confirmation and the
 * lines of each key imported, in the order of the file.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place === undefined) {
    throw new Error('key.import needs a database of a Redis connection.');
  }
  if (place.connection.readOnly) {
    return refuse('key.import/read-only', readOnlyMessage(place));
  }
  const file = fileOf(answers['file']);
  if (file === undefined) {
    return needRead('file', fileReadId, { mode: 'open' });
  }
  if (file === null) {
    return run({
      title: text.import.title(''),
      steps: [],
      danger: noDanger,
      undo: { cannot: text.undo.nothing },
      publishes: false,
      after: [],
    });
  }
  const parsed = importedKeys(file.text);
  if (parsed.kind === 'error') {
    return refuse('key.import/invalid-file', parsed.message);
  }
  if (parsed.keys.length === 0) {
    return refuse('key.import/empty', text.import.empty);
  }
  const policy = answers['existing'];
  if (policy !== 'skip' && policy !== 'replace' && policy !== 'stop') {
    return existingQuestion();
  }
  const exists = answers['exists'];
  if (!Array.isArray(exists)) {
    return needRead('exists', existsReadId, {
      connection: place.connection.id,
      database: place.database,
      keys: parsed.keys.map((key) => hexOf(key.name)),
    });
  }
  const first = parsed.keys.find((_, index) => exists[index] === true);
  if (policy === 'stop' && first !== undefined) {
    return refuse('key.import/exists', text.import.stopped(nameText(first.name), databaseName(place.database)));
  }
  const existingKeys = parsed.keys.filter((_, index) => exists[index] === true);
  const imported = policy === 'skip' ? parsed.keys.filter((_, index) => exists[index] !== true) : parsed.keys;
  const replaced = new Set(policy === 'replace' ? existingKeys.map((key) => hexOf(key.name)) : []);
  return importPlan(context, place, file, { imported, existing: existingKeys.length, policy, replaced });
}

/**
 * The message when the server refuses a line: *Imported 40 of 1,832 keys, then at line 212: <error>*, and, for a
 * `RESTORE` refused for its payload, that the key was exported from a newer or a different server.
 */
export function failedText(imported: number, total: number, line: number, error: string): string {
  const payload = /payload/iu.test(error) ? text.import.newerServer : '';
  return `${text.import.failedAt(imported, total, line, error)}${payload}`;
}

/** `key.import:file`: the system's open dialog and the text of the file, an app read; null when it was closed. */
export const fileRead: ReadFeature = {
  kind: 'read',
  id: featureId(fileReadId),
  request: (_context: Context, args: Json) => ({ kind: 'app', action: 'key.read-file', args }),
  parse: (replies) => replies[0] ?? null,
};

/** `key.import:exists`: `EXISTS <key>` for each key of the file, in its order. */
export const existsRead: ReadFeature = {
  kind: 'read',
  id: featureId(existsReadId),
  request: (_context: Context, args: Json) => {
    const fields = fieldsOf(args);
    const connection = typeof fields['connection'] === 'string' ? fields['connection'] : '';
    const database = typeof fields['database'] === 'number' ? fields['database'] : 0;
    return {
      kind: 'engine',
      requests: namesOfHex(fields['keys']).map((name) =>
        scanCall(connectionId(connection), database, ['EXISTS', name]),
      ),
    };
  },
  parse: (replies) => replies.map((reply) => reply === 1),
};
