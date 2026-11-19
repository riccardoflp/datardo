/**
 * Feature: value.copy — puts a value, or the selected items of it, on the clipboard: as it reads, in hexadecimal, as
 * rows of cells, or as the Redis command that would write it. Items are copied as they were read; a string that is
 * not whole is read to its end first.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { needRead, noDanger, refuse, run } from '../../shared/feature';
import { decidedFormat, hexPairs } from './format';
import { quoted } from './quote';
import { editLimit, partSize, type StringPart } from './read-string';
import { copyText } from './text';
import { bytesOf, isValueType, keyOf, textOf, utf8, utf8Text, type ValueType } from './types';

/** How the clipboard is filled: **Copy** (a value), **As hexadecimal**, **Copy as command**, or **Copy** on rows. */
export type CopyAs = 'value' | 'hex' | 'command' | 'rows';

/** An item of a value as the view read it: the words of a row, in the order of the type's command. */
export type CopiedItem = readonly Uint8Array[];

/** The text of one value: its own text when it is shown as text or JSON, otherwise its bytes as hexadecimal pairs. */
export function valueText(bytes: Uint8Array): string {
  return decidedFormat(bytes) === 'hex' ? hexPairs(bytes) : utf8Text(bytes);
}

const commands: Readonly<Record<ValueType, string>> = {
  string: 'SET',
  hash: 'HSET',
  list: 'RPUSH',
  set: 'SADD',
  zset: 'ZADD',
  stream: 'XADD',
};

function words(items: readonly CopiedItem[]): string {
  return items.flatMap((item) => item.map((word) => quoted(word, 'whole'))).join(' ');
}

/**
 * The lines that write the key with only these items, as `key.export-text` writes them: `HSET user:7 name Ada visits
 * 12`; a stream has one `XADD <key> <id> <field> <value> …` a entry. Items of a sorted set are `[score, member]`.
 */
export function commandLines(type: ValueType, key: Uint8Array, items: readonly CopiedItem[]): string {
  const start = `${commands[type]} ${quoted(key, 'whole')}`;
  return type === 'stream' ? items.map((item) => `${start} ${words([item])}`).join('\n') : `${start} ${words(items)}`;
}

/** The rows: one a line, the cells of a row with a tab between, each written by `value.quote`. */
export function rowsText(items: readonly CopiedItem[]): string {
  return items.map((item) => item.map((cell) => quoted(cell, 'whole')).join('\t')).join('\n');
}

function itemsOf(value: unknown): readonly CopiedItem[] {
  return Array.isArray(value)
    ? (value as readonly unknown[]).map((item) =>
        Array.isArray(item) ? (item as readonly unknown[]).map((word) => bytesOf(word) ?? utf8(textOf(word))) : [],
      )
    : [];
}

/** The string whole: the bytes loaded, then the parts read since, in order; or the offset of the next part to read. */
function wholeString(answers: Answers, length: number): Uint8Array | number {
  const parts: Uint8Array[] = [bytesOf(answers['loaded']) ?? new Uint8Array()];
  let offset = parts[0]?.length ?? 0;
  while (offset < length) {
    const part = answers[`part:${String(offset)}`] as StringPart | undefined;
    if (part?.bytes === undefined) {
      return offset;
    }
    parts.push(part.bytes);
    offset += part.bytes.length === 0 ? partSize : part.bytes.length;
  }
  const whole = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    whole.set(part, at);
    at += part.length;
  }
  return whole;
}

function copied(text: string): Outcome {
  return run({
    title: copyText.copyTitle,
    steps: [],
    danger: noDanger,
    undo: { cannot: copyText.nothingToUndo },
    publishes: false,
    after: [{ kind: 'copy', text }],
  });
}

function stringCopy(context: Context, answers: Answers, as: CopyAs): Outcome {
  const length = typeof answers['length'] === 'number' ? answers['length'] : 0;
  if (length > editLimit) {
    return refuse('value.copy/too-large', copyText.tooLarge);
  }
  const whole = wholeString(answers, length);
  if (typeof whole === 'number') {
    return needRead(`part:${String(whole)}`, 'value.read-string', { form: 'full', length, offset: whole });
  }
  if (as === 'command' || as === 'rows') {
    return copied(commandLines('string', keyOf(context).key, [[whole]]));
  }
  return copied(as === 'hex' ? hexPairs(whole) : valueText(whole));
}

/**
 * Feature: value.copy — `answers.as` (`value`, `hex`, `command`, `rows`) and `answers.type`; for a string,
 * `answers.loaded` and `answers.length`; for a cell, `answers.cell`; for rows, `answers.items`, each a list of words.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const as: CopyAs = (['hex', 'command', 'rows'] as const).find((each) => each === answers['as']) ?? 'value';
  const type = textOf(answers['type'], 'string');
  if (type === 'string' && answers['cell'] === undefined) {
    return stringCopy(context, answers, as);
  }
  const cell = bytesOf(answers['cell']);
  const items = itemsOf(answers['items']);
  const size =
    (cell?.length ?? 0) + items.reduce((sum, item) => sum + item.reduce((all, word) => all + word.length, 0), 0);
  if (size > editLimit) {
    return refuse('value.copy/too-large', copyText.tooLarge);
  }
  if (cell !== undefined) {
    return copied(as === 'hex' ? hexPairs(cell) : valueText(cell));
  }
  if (as === 'command' && isValueType(type)) {
    return copied(commandLines(type, keyOf(context).key, items));
  }
  return copied(rowsText(items));
}
