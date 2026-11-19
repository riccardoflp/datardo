/**
 * Feature: key.delete-selected
 *
 * Deletes the keys selected in the table, after one confirmation: `UNLINK <key> <key> …`, 500 names a command, in the
 * order of the table. When the delete cannot be recorded, it is destructive and the user types the number of keys.
 */
import type { RedisReply } from '../../shared/engine-request';
import type { Answers, Context, Danger, Outcome } from '../../shared/feature';
import { refuse, run } from '../../shared/feature';
import { groupThousands } from '../../shared/text-units';
import { text } from './text';
import type { KeysPlace, ReplyOutcome, UndoNote } from './types';
import {
  argsOf,
  closeKeyTabs,
  databaseName,
  keysKept,
  namesOfHex,
  notifySuccess,
  placeOf,
  readOnlyMessage,
  refreshAfter,
  stepsInBatches,
  undoNote,
} from './types';

/** How many names one `UNLINK` holds (Datardo's choice). */
export const namesPerUnlink = 500;

function danger(place: KeysPlace, count: number, note: UndoNote): Danger {
  const confirmation = [
    text.deleteSelected.question(count, databaseName(place.database)),
    `${text.deleteSelected.detail(count)} ${note.line}`,
  ].join('\n');
  return note.recorded
    ? { kind: 'confirm', text: confirmation, button: text.deleteSelected.button }
    : { kind: 'destructive', text: confirmation, button: text.deleteSelected.button, name: String(count) };
}

/**
 * Feature: key.delete-selected — the names of `args.keys` (hexadecimal, in the order of the table), deleted with
 * `UNLINK`, 500 a command; confirmed, or destructive when it cannot be undone.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place === undefined) {
    throw new Error('key.delete-selected needs a database of a Redis connection.');
  }
  if (place.connection.readOnly) {
    return refuse('key.delete-selected/read-only', readOnlyMessage(place));
  }
  const names = namesOfHex(argsOf(answers)['keys']);
  const note = undoNote(context, place, names.length);
  return run({
    title: text.deleteSelected.title(names.length),
    steps: stepsInBatches(place, 'UNLINK', names, namesPerUnlink),
    danger: danger(place, names.length, note),
    touches: `${groupThousands(names.length)} ${names.length === 1 ? 'key' : 'keys'}`,
    undo: note.recorded ? keysKept(place.database, names) : { cannot: note.line },
    publishes: false,
    after: [
      notifySuccess(text.deleteSelected.done(names.length, databaseName(place.database))),
      ...closeKeyTabs(context, place, names),
      refreshAfter(place),
    ],
  });
}

/**
 * What the replies of the `UNLINK` say: when they deleted fewer keys than were selected, *Deleted 35 of 37 keys from
 * db0: the others were already gone.* instead.
 */
export function afterReplies(replies: readonly RedisReply[], selected: number, database: number): ReplyOutcome {
  const deleted = replies.reduce<number>((sum, reply) => sum + (typeof reply === 'number' ? reply : 0), 0);
  return deleted < selected
    ? { kind: 'notify', level: 'info', text: text.deleteSelected.someGone(deleted, selected, databaseName(database)) }
    : { kind: 'done' };
}
