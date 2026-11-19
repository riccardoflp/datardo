/**
 * Feature: value.trim-list — keeps a range of a list with `LTRIM` and removes the rest, after the form **Trim
 * queue:mail** and a confirmation that says how many elements are removed. A range that keeps everything, or nothing,
 * is refused.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { ask, refuse } from '../../shared/feature';
import { currentReplies, guard, readCurrent, readOnlyRefusal, writePlan } from './check';
import { indexOf } from './read-list';
import { listText, readText } from './text';
import { keyOf, nameText, replyNumber, textOf, writeStep } from './types';

/** The indexes a range keeps of a list of `count` elements, as `LTRIM` reads them; undefined when it keeps none. */
export function keptRange(from: number, to: number, count: number): readonly [number, number] | undefined {
  const start = Math.max(from < 0 ? count + from : from, 0);
  const stop = Math.min(to < 0 ? count + to : to, count - 1);
  return start > stop || start >= count ? undefined : [start, stop];
}

/** What the form says under the range: *Keeps 100 of 1,204 elements.* */
export function keepsText(from: number, to: number, count: number): string {
  const range = keptRange(from, to, count);
  return listText.keeps(range === undefined ? 0 : range[1] - range[0] + 1, count);
}

function trimForm(key: string): Outcome {
  return ask({
    title: listText.trimForm(key),
    button: listText.trimButton,
    fields: [
      { kind: 'text', key: 'from', label: listText.trimFrom, default: '0' },
      { kind: 'text', key: 'to', label: listText.trimTo, default: '-1' },
    ],
  });
}

/**
 * Feature: value.trim-list — `answers.from` and `answers.to`, asked by the form (`0` and `-1`). Then `TYPE`, `LLEN`,
 * the confirmation, and the plan `LTRIM <key> <from> <to>`.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const readOnly = readOnlyRefusal(context, 'value.trim-list/read-only');
  if (readOnly !== undefined) {
    return readOnly;
  }
  if (answers['from'] === undefined || answers['to'] === undefined) {
    return trimForm(nameText(keyOf(context).key));
  }
  const from = indexOf(textOf(answers['from']));
  const to = indexOf(textOf(answers['to']));
  if (from === undefined || to === undefined) {
    return refuse('value.trim-list/invalid', readText.index);
  }
  const guarded = guard(context, answers, 'list', {
    readOnly: 'value.trim-list/read-only',
    gone: 'value.trim-list/gone',
    typeChanged: 'value.trim-list/type-changed',
  });
  if (guarded.kind === 'stop') {
    return guarded.outcome;
  }
  const { at, name } = guarded;
  const current = currentReplies(answers);
  if (current === undefined) {
    return readCurrent([['LLEN', at.key]]);
  }
  const count = replyNumber(current[0]) ?? 0;
  const range = keptRange(from, to, count);
  if (range === undefined) {
    return refuse('value.trim-list/empty-range', listText.keepsNone);
  }
  const kept = range[1] - range[0] + 1;
  if (kept >= count) {
    return refuse('value.trim-list/nothing', listText.keepsAll);
  }
  return writePlan({
    at,
    name: listText.trimTitle(name, String(from), String(to)),
    steps: [writeStep(at, ['LTRIM', at.key, String(from), String(to)])],
    done: listText.trimmed(name, kept),
    confirm: {
      question: listText.trimQuestion(name, kept),
      detail: listText.trimDetail(count - kept, count, range[0], range[1]),
      button: listText.trimButton,
    },
  });
}
