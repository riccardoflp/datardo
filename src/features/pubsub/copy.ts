/**
 * Feature: pubsub.copy
 *
 * Copies the selected messages, or one part of a message, to the clipboard, one per line, the oldest first: the
 * message (its text, or its bytes in hexadecimal when it is not valid UTF-8), the channel, the message as a record of
 * JSON Lines, or a `PUBLISH` command the console reads back to the same bytes. Nothing is sent to the server.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import { savedConnection } from '../../shared/state/connections';
import { quotedString } from '../console/reply';
import { messageRecord } from './export';
import { gapText } from './reconnect';
import { text } from './text';
import type { Message, Row } from './types';
import {
  hexOf,
  keptRows,
  messagesOf,
  nameText,
  pageConnectionOf,
  pubsubPageOf,
  rowsNumbered,
  startArgs,
  textOf,
} from './types';

/** What is copied: the message, the channel, the message as JSON, or a `PUBLISH` command. */
export type CopyVariant = 'message' | 'channel' | 'json' | 'command';

/** Whether a word of a command line must be written in double quotes for `console.parse-line` to read it back. */
function needsQuotes(bytes: Uint8Array): boolean {
  const decoded = textOf(bytes);
  return decoded === undefined || decoded === '' || /[\s"'\\\p{Cc}]/u.test(decoded);
}

/** A word of a command line: as it is, or as `console.reply` writes a string, when it needs quotes. */
export function commandWord(bytes: Uint8Array): string {
  return needsQuotes(bytes) ? quotedString(bytes) : (textOf(bytes) ?? '');
}

/** The message a row stands for: itself, or the first message of an event (its messages are equal). */
function messageOfRow(row: Row): Message | undefined {
  switch (row.kind) {
    case 'message':
      return row;
    case 'event':
      return row.messages[0];
    case 'gap':
      return undefined;
  }
}

function lineOf(row: Row, variant: Exclude<CopyVariant, 'json'>, offsetMinutes: number): string | undefined {
  const message = messageOfRow(row);
  if (message === undefined) {
    return row.kind === 'gap' && variant === 'message' ? gapText(row, offsetMinutes) : undefined;
  }
  switch (variant) {
    case 'message':
      return textOf(message.message) ?? hexOf(message.message);
    case 'channel':
      return nameText(message.channel);
    case 'command':
      return `PUBLISH ${commandWord(message.channel)} ${commandWord(message.message)}`;
  }
}

/** What is copied of the rows, one per line, the oldest first. */
export function copiedText(rows: readonly Row[], variant: CopyVariant, offsetMinutes: number): string {
  const ordered = [...rows].sort((first, second) => first.number - second.number);
  if (variant === 'json') {
    return messagesOf(ordered)
      .map((each) => JSON.stringify(messageRecord(each)))
      .join('\n');
  }
  return ordered
    .map((row) => lineOf(row, variant, offsetMinutes))
    .filter((line) => line !== undefined)
    .join('\n');
}

function variantOf(value: unknown): CopyVariant {
  return value === 'channel' || value === 'json' || value === 'command' ? value : 'message';
}

function numbersOf(value: unknown): readonly number[] | undefined {
  return Array.isArray(value) && value.every((each) => typeof each === 'number') ? value : undefined;
}

/**
 * Feature: pubsub.copy — `{ variant, rows? }` from a row's menu, the bar of the selection or the inspector island, or
 * the variant alone from Go to: the app step `copy 3 messages to the clipboard`, then *Copied 3 messages.*
 */
export function plan(context: Context, answers: Answers): Outcome {
  const id = pageConnectionOf(context);
  const connection = id === undefined ? undefined : savedConnection(context.state.connections, id);
  const page = id === undefined ? undefined : pubsubPageOf(context.state, id);
  const args = startArgs(answers);
  const fromCommand = typeof answers['args'] === 'string';
  const variant = variantOf(fromCommand ? answers['args'] : args['variant']);
  const numbers = (fromCommand ? undefined : numbersOf(args['rows'])) ?? page?.selected ?? [];
  const rows = page === undefined ? [] : rowsNumbered(keptRows(page.kept), numbers);
  const copied = page === undefined ? '' : copiedText(rows, variant, page.offsetMinutes);
  const steps =
    connection === undefined || rows.length === 0
      ? []
      : [{ kind: 'app' as const, text: text.copy.step(rows.length), action: 'nav.copy', args: { text: copied } }];
  return run({
    title: text.copy.title,
    steps,
    danger: noDanger,
    undo: { cannot: text.copy.cannotUndo },
    publishes: false,
    after: steps.length === 0 ? [] : [{ kind: 'notify', level: 'success', text: text.copy.copied(rows.length) }],
  });
}
