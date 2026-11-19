/**
 * Feature: value.trim-stream — keeps the newest entries of a stream, by number (`XTRIM … MAXLEN`) or from an ID or a
 * date (`XTRIM … MINID`), and deletes the older ones. The trim is exact: neither is sent with `~`.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { ask, refuse } from '../../shared/feature';
import { currentReplies, guard, readCurrent, readOnlyRefusal, writePlan } from './check';
import { streamBound } from './read-stream';
import { readText, streamText } from './text';
import { keyOf, nameText, replyNumber, textOf, writeStep, type KeyAt } from './types';

/** How a stream is trimmed: to its newest entries, or from an ID. */
export type StreamTrim =
  { readonly kind: 'newest'; readonly count: number } | { readonly kind: 'from'; readonly id: string };

function trimForm(key: string): Outcome {
  return ask({
    title: streamText.trimForm(key),
    button: streamText.trimButton,
    fields: [
      {
        kind: 'pick-one',
        key: 'by',
        label: streamText.trimForm(key),
        choices: [
          { value: 'newest', label: streamText.keepNewest },
          { value: 'from', label: streamText.keepFrom },
        ],
        default: 'newest',
      },
      { kind: 'text', key: 'count', label: streamText.keepNewest },
      { kind: 'text', key: 'from', label: streamText.keepFrom },
    ],
  });
}

/** The trim the form asks, or the message of what cannot be read. */
export function trimOf(answers: Answers): StreamTrim | { readonly problem: string } {
  if (answers['by'] === 'from') {
    const id = streamBound(textOf(answers['from']));
    return id === undefined || id === '' ? { problem: readText.streamBound } : { kind: 'from', id };
  }
  const count = textOf(answers['count']).trim();
  return /^\d+$/u.test(count) ? { kind: 'newest', count: Number(count) } : { problem: streamText.badCount };
}

function trimPlan(at: KeyAt, name: string, trim: StreamTrim, count: number): Outcome {
  if (trim.kind === 'from') {
    return writePlan({
      at,
      name: streamText.trimFromTitle(name, trim.id),
      steps: [writeStep(at, ['XTRIM', at.key, 'MINID', trim.id])],
      done: streamText.trimmedFrom(name, trim.id),
      confirm: {
        question: streamText.trimFromQuestion(name, trim.id),
        detail: streamText.trimFromDetail,
        button: streamText.trimButton,
      },
    });
  }
  const deleted = count - trim.count;
  return writePlan({
    at,
    name: streamText.trimNewestTitle(name, trim.count),
    steps: [writeStep(at, ['XTRIM', at.key, 'MAXLEN', String(trim.count)])],
    done: streamText.trimmed(deleted, name),
    confirm: {
      question: streamText.trimNewestQuestion(name, trim.count),
      detail: streamText.trimNewestDetail(deleted, count),
      button: streamText.trimButton,
    },
  });
}

/**
 * Feature: value.trim-stream — `answers.by` (`newest` or `from`) with `answers.count` or `answers.from`, asked by the
 * form **Trim events**. Then `TYPE`, `XLEN`, the confirmation, and `XTRIM <key> MAXLEN <n>` or `XTRIM <key> MINID <id>`.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const readOnly = readOnlyRefusal(context, 'value.trim-stream/read-only');
  if (readOnly !== undefined) {
    return readOnly;
  }
  if (answers['by'] === undefined) {
    return trimForm(nameText(keyOf(context).key));
  }
  const trim = trimOf(answers);
  if ('problem' in trim) {
    return refuse('value.trim-stream/invalid', trim.problem);
  }
  const guarded = guard(context, answers, 'stream', {
    readOnly: 'value.trim-stream/read-only',
    gone: 'value.trim-stream/gone',
    typeChanged: 'value.trim-stream/type-changed',
  });
  if (guarded.kind === 'stop') {
    return guarded.outcome;
  }
  const { at, name } = guarded;
  const current = currentReplies(answers);
  if (current === undefined) {
    return readCurrent([['XLEN', at.key]]);
  }
  const count = replyNumber(current[0]) ?? 0;
  if (trim.kind === 'newest' && trim.count >= count) {
    return refuse('value.trim-stream/nothing', streamText.nothingToTrim(name, count));
  }
  return trimPlan(at, name, trim, count);
}

/** What the notification says once the server answered: how many entries it deleted. */
export function trimmedText(reply: unknown, key: string): string {
  return streamText.trimmed(replyNumber(reply) ?? 0, key);
}
