/**
 * Feature: value.delete-entries — deletes one entry of a stream, or the selected ones, with `XDEL`, 500 IDs a
 * command. A stream that loses its last entry stays, empty; consumer groups keep the entries they have pending.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { guard, writePlan } from './check';
import { streamText } from './text';
import { inCommands, textOf, writeStep } from './types';

/** The IDs of an answer: a list of texts. */
export function idsOf(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? (value as readonly unknown[]).map((each) => textOf(each)).filter((id) => id !== '')
    : [];
}

/** What the notification says, from the number of entries the server deleted. */
export function deletedText(ids: readonly string[], deleted: number, key: string): string {
  const [first] = ids;
  if (deleted < ids.length) {
    return streamText.deletedSome(deleted, ids.length, key);
  }
  return ids.length === 1 && first !== undefined
    ? streamText.deletedOne(first, key)
    : streamText.deletedMany(ids.length, key);
}

/** Feature: value.delete-entries — `answers.ids` are the IDs. Then `TYPE`, and the plan `XDEL <key> <id> …`. */
export function plan(context: Context, answers: Answers): Outcome {
  const guarded = guard(context, answers, 'stream', {
    readOnly: 'value.delete-entries/read-only',
    gone: 'value.delete-entries/gone',
    typeChanged: 'value.delete-entries/type-changed',
  });
  if (guarded.kind === 'stop') {
    return guarded.outcome;
  }
  const { at, name } = guarded;
  const ids = idsOf(answers['ids']);
  const [first] = ids;
  const single = ids.length === 1 && first !== undefined;
  return writePlan({
    at,
    name: single ? streamText.deleteTitleOne(first, name) : streamText.deleteTitleMany(ids.length, name),
    steps: inCommands(['XDEL', at.key], ids).map((words) => writeStep(at, words)),
    done: deletedText(ids, ids.length, name),
    confirm: {
      question: single ? streamText.deleteOne(first, name) : streamText.deleteMany(ids.length, name),
      detail: streamText.deleteDetail,
      button: streamText.deleteButton,
    },
  });
}
