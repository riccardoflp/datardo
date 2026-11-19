/**
 * Feature: key.rename
 *
 * Gives a key another name, keeping its value and its expiry, without ever replacing another key unless the user
 * says so: `RENAMENX`, and `RENAME` only after **Replace**, because `RENAME` deletes whatever has the new name.
 */
import type { Json, RedisReply } from '../../shared/engine-request';
import type { Answers, Context, Danger, Outcome, ReadFeature } from '../../shared/feature';
import { ask, needRead, noDanger, refuse, run } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { text } from './text';
import type { KeyName, KeysPlace, ReplyOutcome } from './types';
import {
  isErrorReply,
  isSameName,
  keyArgs,
  keysUndo,
  nameOfText,
  nameText,
  notifySuccess,
  oneKeyRequest,
  parseExists,
  placeOf,
  readOnlyMessage,
  refreshAfter,
  refusedReply,
  textOfName,
  undoNote,
  writeStep,
} from './types';

/** The identifier of the read that says whether the new name is taken. */
export const existsReadId = 'key.rename:read';

/** The dialog **Rename orders:42**, starting with the present name. */
function nameQuestion(name: KeyName): Outcome {
  const present = textOfName(name) ?? '';
  return ask({
    title: text.rename.dialog(nameText(name)),
    button: text.rename.button,
    fields: [
      {
        kind: 'text',
        key: 'name',
        label: text.rename.field,
        default: present,
        rules: [
          { kind: 'not-empty', message: text.rename.different },
          { kind: 'not-one-of', values: [present], message: text.rename.different },
        ],
      },
    ],
  });
}

function replaceDanger(from: KeyName, to: KeyName, undoLine: string): Danger {
  return {
    kind: 'confirm',
    text: [
      text.rename.replace(nameText(to)),
      `${text.rename.replaceDetail(nameText(to), nameText(from))} ${undoLine}`,
    ].join('\n'),
    button: text.rename.replaceButton,
  };
}

/** What a rename does: from a name to another, replacing the key of that name or not. */
interface Renaming {
  readonly from: KeyName;
  readonly to: KeyName;
  readonly replaces: boolean;
}

function renamePlan(context: Context, place: KeysPlace, { from, to, replaces }: Renaming): Outcome {
  const names = [from, to];
  return run({
    title: text.rename.title(nameText(from), nameText(to)),
    steps: [writeStep(place, [replaces ? 'RENAME' : 'RENAMENX', from, to])],
    danger: replaces ? replaceDanger(from, to, undoNote(context, place, names.length).line) : noDanger,
    undo: keysUndo(context, place, names),
    publishes: false,
    after: [notifySuccess(text.rename.done(nameText(from), nameText(to))), refreshAfter(place)],
  });
}

/**
 * Feature: key.rename — asks the new name, reads `EXISTS <new name>`, then `RENAMENX orders:42 orders:43`; when the
 * name is taken, `RENAME orders:42 orders:43` after the confirmation **Replace**.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place?.key === undefined) {
    throw new Error('key.rename needs a key of a Redis connection.');
  }
  if (place.connection.readOnly) {
    return refuse('key.rename/read-only', readOnlyMessage(place));
  }
  const typed = answers['name'];
  if (typeof typed !== 'string') {
    return nameQuestion(place.key);
  }
  const to = nameOfText(typed);
  if (typed === '' || isSameName(to, place.key)) {
    return refuse('key.rename/invalid', text.rename.different);
  }
  const exists = answers['exists'];
  if (typeof exists !== 'boolean') {
    return needRead('exists', existsReadId, keyArgs(place, to));
  }
  return renamePlan(context, place, { from: place.key, to, replaces: exists });
}

/**
 * What the reply of the step means: `RENAMENX` that answers 0 refuses with `/exists`, and nothing has changed;
 * `ERR no such key` is the key that is gone (`/gone`).
 */
export function afterReply(reply: RedisReply, from: KeyName, to: KeyName): ReplyOutcome {
  if (isErrorReply(reply) && /no such key/iu.test(reply.message)) {
    return refusedReply('key.rename/gone', text.gone(nameText(from)));
  }
  return reply === 0 ? refusedReply('key.rename/exists', text.rename.createdMeanwhile(nameText(to))) : { kind: 'done' };
}

/** `key.rename:read`: `EXISTS <new name>`. */
export const read: ReadFeature = {
  kind: 'read',
  id: featureId(existsReadId),
  request: (_context: Context, args: Json) => oneKeyRequest('EXISTS', args),
  parse: parseExists,
};
