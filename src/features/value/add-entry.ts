/**
 * Feature: value.add-entry — appends an entry to a stream with `XADD … NOMKSTREAM`, which keeps a stream deleted
 * meanwhile from being created again. The ID is `*` (the server gives it) unless one is typed.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { ask, refuse } from '../../shared/feature';
import { guard, readOnlyRefusal, typedAnswer, writePlan } from './check';
import { streamText } from './text';
import { fieldsOf, keyOf, nameText, replyText, serverIsAtLeast, textOf, writeStep, type Word } from './types';

/** `<milliseconds>-*` is in `XADD` since Redis 7.0. */
const partialIdVersion: readonly number[] = [7, 0];

/** The kind of an ID typed: `*`, a full or partial ID, `<milliseconds>-*`, or none of these. */
export function idKind(typed: string): 'auto' | 'id' | 'sequence' | undefined {
  const text = typed.trim();
  if (text === '*') {
    return 'auto';
  }
  if (/^\d+(?:-\d+)?$/u.test(text)) {
    return 'id';
  }
  return /^\d+-\*$/u.test(text) ? 'sequence' : undefined;
}

/** The pairs of the form: `answers.pairs` as `[{ field, value }]`, or one pair `answers.field` and `answers.value`. */
function pairsOf(answers: Answers): readonly { readonly field: unknown; readonly value: unknown }[] {
  const pairs = answers['pairs'];
  if (Array.isArray(pairs)) {
    return (pairs as readonly unknown[]).map((pair) => ({
      field: fieldsOf(pair)['field'],
      value: fieldsOf(pair)['value'],
    }));
  }
  return answers['field'] === undefined ? [] : [{ field: answers['field'], value: answers['value'] ?? '' }];
}

function entryForm(key: string): Outcome {
  return ask({
    title: streamText.addForm(key),
    button: 'Add',
    fields: [
      { kind: 'text', key: 'id', label: 'ID', default: '*' },
      { kind: 'text', key: 'field', label: 'Field' },
      { kind: 'text', key: 'value', label: 'Value' },
    ],
  });
}

/** The words of the pairs, or the problem of the first that cannot be read; an empty name is no field. */
function pairWords(answers: Answers): { readonly words: readonly Word[] } | { readonly problem: string } {
  const words: Word[] = [];
  for (const pair of pairsOf(answers)) {
    const field = typedAnswer(pair.field);
    const value = typedAnswer(pair.value);
    if ('problem' in field || 'problem' in value) {
      return { problem: 'problem' in field ? field.problem : 'problem' in value ? value.problem : '' };
    }
    if (field.bytes.length === 0) {
      return { problem: streamText.noPair };
    }
    words.push(field.bytes, value.bytes);
  }
  return words.length === 0 ? { problem: streamText.noPair } : { words };
}

/**
 * Feature: value.add-entry — `answers.id` and the pairs, as typed. Then `TYPE`, and the plan `XADD <key> NOMKSTREAM
 * <id> <field> <value> …`.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const readOnly = readOnlyRefusal(context, 'value.add-entry/read-only');
  if (readOnly !== undefined) {
    return readOnly;
  }
  if (answers['pairs'] === undefined && answers['field'] === undefined) {
    return entryForm(nameText(keyOf(context).key));
  }
  const id = textOf(answers['id'], '*').trim();
  const kind = idKind(id);
  if (kind === undefined) {
    return refuse('value.add-entry/invalid', streamText.badId);
  }
  const pairs = pairWords(answers);
  if ('problem' in pairs) {
    return refuse('value.add-entry/invalid', pairs.problem);
  }
  const guarded = guard(context, answers, 'stream', {
    readOnly: 'value.add-entry/read-only',
    gone: 'value.add-entry/gone',
    typeChanged: 'value.add-entry/type-changed',
  });
  if (guarded.kind === 'stop') {
    return guarded.outcome;
  }
  const { at, name } = guarded;
  if (kind === 'sequence' && !serverIsAtLeast(context, at, partialIdVersion)) {
    return refuse('value.add-entry/unsupported', streamText.needsFullId);
  }
  return writePlan({
    at,
    name: streamText.addTitle(name),
    steps: [writeStep(at, ['XADD', at.key, 'NOMKSTREAM', id, ...pairs.words])],
    done: streamText.added(id, name),
  });
}

/** What the notification says once the server answered: the ID it gave; a nil reply means the stream is gone. */
export function addedText(reply: unknown, key: string): string | undefined {
  const id = replyText(reply);
  return id === undefined ? undefined : streamText.added(id, key);
}
