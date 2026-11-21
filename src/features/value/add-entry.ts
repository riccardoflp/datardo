/**
 * Feature: value.add-entry — appends an entry to a stream with `XADD … NOMKSTREAM`, which keeps a stream deleted
 * meanwhile from being created again. The ID is `*` (the server gives it) unless one is typed.
 */
import type { Json } from '../../shared/engine-request';
import type { Answers, Context, Outcome } from '../../shared/feature';
import { ask, refuse } from '../../shared/feature';
import { currentReplies, guard, readCurrent, readOnlyRefusal, typedAnswer, writePlan } from './check';
import { decidedFormat } from './format';
import { editorText } from './item-editor';
import { mapOf } from './stream-groups';
import { streamText } from './text';
import { bytesOf, fieldsOf, keyOf, nameText, replyText, serverIsAtLeast, textOf, writeStep, type Word } from './types';

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

/** Bytes as the form opens them: their text in the format `value.format` gives them, hexadecimal as pairs of digits. */
function typedJson(bytes: Uint8Array): Json {
  const format = decidedFormat(bytes);
  return { text: editorText(bytes, format), format };
}

/** The pairs of **Add a copy…**: `answers.copy` as `[{ field, value }]`, each as bytes or `{ hex }`. */
function copiedPairs(answers: Answers): readonly Json[] {
  const copy = answers['copy'];
  return Array.isArray(copy)
    ? (copy as readonly unknown[]).map((pair) => ({
        field: typedJson(bytesOf(fieldsOf(pair)['field']) ?? new Uint8Array()),
        value: typedJson(bytesOf(fieldsOf(pair)['value']) ?? new Uint8Array()),
      }))
    : [];
}

/**
 * The form **Add an entry to events**: **ID** (`*`), and rows of **Field** and **Value**, which the window draws with
 * **Add a field** from the question's `about`, filled with the pairs of the entry copied by **Add a copy…**.
 */
function entryForm(key: string, answers: Answers): Outcome {
  return ask({
    title: streamText.addForm(key),
    button: 'Add',
    fields: [
      { kind: 'text', key: 'id', label: 'ID', default: '*' },
      { kind: 'text', key: 'field', label: 'Field' },
      { kind: 'text', key: 'value', label: 'Value' },
    ],
    about: { form: 'value.add-entry', pairs: copiedPairs(answers) },
  });
}

/** An ID as its two numbers; a missing sequence is 0, and `*` as the sequence is none. */
function idParts(id: string): readonly [bigint, bigint | undefined] {
  const [time = '0', sequence = '0'] = id.split('-');
  return [BigInt(time), sequence === '*' ? undefined : BigInt(sequence)];
}

/** Whether an ID typed comes after the last ID the stream gave (`last-generated-id`), as `XADD` requires. */
export function isAfterLast(id: string, last: string): boolean {
  if (!/^\d+-\d+$/u.test(last)) {
    return true;
  }
  const [time, sequence] = idParts(id);
  const [lastTime, lastSequence = 0n] = idParts(last);
  if (sequence === undefined) {
    return time >= lastTime;
  }
  return time > lastTime || (time === lastTime && sequence > lastSequence);
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
 * Feature: value.add-entry — `answers.id` and the pairs, as typed. Then `TYPE`, `XINFO STREAM <key>` for an ID typed
 * (it must come after the last one), and the plan `XADD <key> NOMKSTREAM <id> <field> <value> …`.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const readOnly = readOnlyRefusal(context, 'value.add-entry/read-only');
  if (readOnly !== undefined) {
    return readOnly;
  }
  if (answers['pairs'] === undefined && answers['field'] === undefined) {
    return entryForm(nameText(keyOf(context).key), answers);
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
  const current = kind === 'auto' ? [] : currentReplies(answers);
  if (current === undefined) {
    return readCurrent([['XINFO', 'STREAM', at.key]]);
  }
  const last = replyText(mapOf(current[0]).get('last-generated-id')) ?? '';
  if (kind !== 'auto' && !isAfterLast(id, last)) {
    return refuse('value.add-entry/invalid', streamText.idNotGreater(last));
  }
  return writePlan({
    at,
    name: streamText.addTitle(name),
    steps: [writeStep(at, ['XADD', at.key, 'NOMKSTREAM', id, ...pairs.words])],
    done: kind === 'id' ? streamText.added(id, name) : streamText.addedNew(name),
  });
}

/** What the notification says once the server answered: the ID it gave; a nil reply means the stream is gone. */
export function addedText(reply: unknown, key: string): string | undefined {
  const id = replyText(reply);
  return id === undefined ? undefined : streamText.added(id, key);
}
