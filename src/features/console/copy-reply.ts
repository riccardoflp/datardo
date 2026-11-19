/**
 * Feature: console.copy-reply
 *
 * Copies a reply of the output, one of its values, or its command, to the clipboard. The reply is copied whole, also
 * the parts the output has not drawn; a value is copied without its quotes and with its escapes undone, or in
 * hexadecimal when it is not valid UTF-8; the command as the output shows it, its secrets `***`.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import { commandArguments } from './parse-line';
import { replyLines, utf8Text } from './reply';
import { text } from './text';
import type { OutputEntry } from './types';
import { consoleConnection, consoleOf, startArgs } from './types';

/** What is copied: the whole reply, one value of it, or the command. */
export type CopyVariant = 'reply' | 'value' | 'command';

/** The bytes of a value in hexadecimal, as `value.format` writes a value that is not text: `00ff41`. */
export function hexText(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** A value as copied: its text, or its bytes in hexadecimal when it is not valid UTF-8. */
export function valueText(bytes: Uint8Array): string {
  return utf8Text(bytes) ?? hexText(bytes);
}

/** Where a value is in a reply: the line of `console.reply`, and the string of that line, from 0. */
export interface ValuePlace {
  readonly line: number;
  readonly string: number;
}

/** The text copied from an entry of the output, or undefined when there is nothing to copy. */
export function copiedText(entry: OutputEntry, variant: CopyVariant, place?: ValuePlace): string | undefined {
  if (variant === 'command') {
    return entry.line;
  }
  if (entry.reply === undefined) {
    return variant === 'reply' ? entry.refusal?.message : undefined;
  }
  const read = commandArguments(entry.line);
  const lines = replyLines(entry.reply, read.kind === 'arguments' ? read.arguments : [], entry.protocol);
  if (variant === 'reply') {
    return lines.map((line) => line.text).join('\n');
  }
  const bytes = place === undefined ? undefined : lines[place.line]?.strings[place.string];
  return bytes === undefined ? undefined : valueText(bytes);
}

function variantOf(value: unknown): CopyVariant {
  return value === 'value' || value === 'command' ? value : 'reply';
}

function placeOf(args: Readonly<Record<string, unknown>>): ValuePlace | undefined {
  const line = args['line'];
  const string = args['string'];
  return typeof line === 'number' ? { line, string: typeof string === 'number' ? string : 0 } : undefined;
}

function stepText(variant: CopyVariant, line: string): string {
  switch (variant) {
    case 'reply':
      return text.copy.reply(line);
    case 'value':
      return text.copy.value(line);
    case 'command':
      return text.copy.command(line);
  }
}

/**
 * Feature: console.copy-reply — `{ variant, entry, line?, string? }`: the app step `copy the reply of GET greeting to
 * the clipboard`, then *Copied.*
 */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const connection = consoleConnection(context);
  const console = connection === undefined ? undefined : consoleOf(context.state, connection);
  // From Go to, the variant of the command is the whole of the arguments, and the newest entry is copied.
  const fromCommand = typeof answers['args'] === 'string';
  const entry = fromCommand
    ? console?.entries[console.entries.length - 1]
    : console?.entries.find((each) => each.id === args['entry']);
  const variant = variantOf(fromCommand ? answers['args'] : args['variant']);
  const copied = entry === undefined ? undefined : copiedText(entry, variant, placeOf(args));
  const steps =
    entry === undefined || copied === undefined
      ? []
      : [{ kind: 'app' as const, text: stepText(variant, entry.line), action: 'nav.copy', args: { text: copied } }];
  return run({
    title: text.copy.title,
    steps,
    danger: noDanger,
    undo: { cannot: text.copy.cannotUndo },
    publishes: false,
    after: steps.length === 0 ? [] : [{ kind: 'notify', level: 'success', text: text.copy.copied }],
  });
}
