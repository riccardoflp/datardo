/**
 * Feature: key.delete
 *
 * Deletes one key, after a confirmation: `UNLINK orders:42`, never `DEL`, because `DEL` frees the value while the
 * server waits and `UNLINK` frees it in another thread.
 */
import type { RedisReply } from '../../shared/engine-request';
import type { Answers, Context, Outcome } from '../../shared/feature';
import { refuse, run } from '../../shared/feature';
import { sizeText } from '../connection/overview';
import { text } from './text';
import type { KeysPlace, ReplyOutcome } from './types';
import {
  argsOf,
  closeKeyTabs,
  databaseName,
  keysUndo,
  nameText,
  notifySuccess,
  placeOf,
  readOnlyMessage,
  refreshAfter,
  typeWord,
  undoNote,
  writeStep,
} from './types';

/** *A hash, 1.2 KB.*: what `key.inspect` or `key.details` read of the key (`args.type`, `args.size`), when they did. */
export function deleteDetail(args: Readonly<Record<string, unknown>>): string | undefined {
  const type = args['type'];
  const size = args['size'];
  if (typeof type !== 'string' || typeof size !== 'number') {
    return undefined;
  }
  return text.delete.detail(typeWord(type), sizeText(size));
}

function question(place: KeysPlace, name: string, detail: string | undefined, undoLine: string): string {
  const asked = text.delete.question(name, databaseName(place.database));
  return `${asked}\n${detail === undefined ? undoLine : `${detail} ${undoLine}`}`;
}

/**
 * Feature: key.delete — `UNLINK orders:42` after **Delete key orders:42 from db0?**, recorded as `Delete key
 * orders:42`; the open key tab of the key closes.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place?.key === undefined) {
    throw new Error('key.delete needs a key of a Redis connection.');
  }
  if (place.connection.readOnly) {
    return refuse('key.delete/read-only', readOnlyMessage(place));
  }
  const name = nameText(place.key);
  return run({
    title: text.delete.title(name),
    steps: [writeStep(place, ['UNLINK', place.key])],
    danger: {
      kind: 'confirm',
      text: question(place, name, deleteDetail(argsOf(answers)), undoNote(context, place, 1).line),
      button: text.delete.button,
    },
    touches: '1 key',
    undo: keysUndo(context, place, [place.key]),
    publishes: false,
    after: [
      notifySuccess(text.delete.done(name, databaseName(place.database))),
      ...closeKeyTabs(context, place, [place.key]),
      refreshAfter(place),
    ],
  });
}

/** What the reply of `UNLINK` means: 0 is a key deleted already, or expired, which is said instead. */
export function afterReply(reply: RedisReply): ReplyOutcome {
  return reply === 0 ? { kind: 'notify', level: 'warning', text: text.delete.notFound } : { kind: 'done' };
}
