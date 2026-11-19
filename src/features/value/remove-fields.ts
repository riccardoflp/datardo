/**
 * Feature: value.remove-fields — removes one field of a hash, or the selected ones, with `HDEL`, 500 names a command,
 * after a confirmation that says when they are all the fields of the key, which is then deleted with them. The
 * removal of members of a set or of a sorted set is planned the same way.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { currentReplies, guard, readCurrent, writePlan } from './check';
import { checkText, counted, removalText } from './text';
import { bytesOf, inCommands, nameText, replyNumber, writeStep, type KeyAt } from './types';

/** A removal of items of a key: the command that removes them, the items, and how many the key has. */
export interface Removal {
  readonly at: KeyAt;
  readonly name: string;
  readonly command: 'HDEL' | 'SREM' | 'ZREM';
  readonly items: readonly Uint8Array[];
  /** How many items the key has now: `HLEN`, `SCARD` or `ZCARD`. */
  readonly count: number;
  /** The item in the singular and the plural: `field`, `fields`. */
  readonly words: readonly [string, string];
}

/** The items of an answer: a list of bytes, each as bytes or `{ hex }`. */
export function itemsOf(value: unknown): readonly Uint8Array[] {
  return Array.isArray(value)
    ? (value as readonly unknown[]).flatMap((each) => {
        const bytes = bytesOf(each);
        return bytes === undefined ? [] : [bytes];
      })
    : [];
}

/** What the notification says, from what the server answered: how many it removed of those asked. */
export function removedText(removal: Removal, removed: number): string {
  const [one, many] = removal.words;
  const asked = removal.items.length;
  if (removed < asked) {
    return removalText.removedSome(removed, counted(asked, one, many), removal.name);
  }
  if (asked >= removal.count) {
    return checkText.noneLeft(removal.name, many);
  }
  const [first] = removal.items;
  return asked === 1 && first !== undefined
    ? removalText.removedOne(one, nameText(first), removal.name)
    : removalText.removedMany(counted(asked, one, many), removal.name);
}

/** The plan of a removal: the confirmation, the commands of 500 items, and the undo of the whole key. */
export function removalPlan(removal: Removal): Outcome {
  const { at, name, items } = removal;
  const [one, many] = removal.words;
  const [first] = items;
  const single = items.length === 1 && first !== undefined;
  const all = items.length >= removal.count;
  return writePlan({
    at,
    name: single
      ? removalText.titleOne(one, nameText(first), name)
      : removalText.titleMany(counted(items.length, one, many), name),
    steps: inCommands([removal.command, at.key], items).map((words) => writeStep(at, words)),
    done: removedText(removal, items.length),
    confirm: {
      question: single
        ? removalText.removeOne(one, nameText(first), name)
        : removalText.removeMany(counted(items.length, one, many), name),
      detail: all ? checkText.allItems(name, many) : '',
      button: removalText.removeButton,
    },
  });
}

/**
 * Feature: value.remove-fields — `answers.fields` are the names of the fields, as bytes. Then `TYPE`, `HLEN`, and
 * the plan `HDEL <key> <field> …`.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const guarded = guard(context, answers, 'hash', {
    readOnly: 'value.remove-fields/read-only',
    gone: 'value.remove-fields/gone',
    typeChanged: 'value.remove-fields/type-changed',
  });
  if (guarded.kind === 'stop') {
    return guarded.outcome;
  }
  const { at, name } = guarded;
  const current = currentReplies(answers);
  if (current === undefined) {
    return readCurrent([['HLEN', at.key]]);
  }
  const items = itemsOf(answers['fields']);
  const count = replyNumber(current[0]) ?? 0;
  return removalPlan({ at, name, command: 'HDEL', items, count, words: ['field', 'fields'] });
}
