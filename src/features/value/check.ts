/**
 * Feature: value.check — asks the type of the key again before a write and at each refresh, so that nothing is written
 * to a key that is gone or has become something else. Once the type is known to be the one shown, the same Read
 * fetches what the write compares with what the view shows (`GET`, `HGET`, `HEXISTS`, `LINDEX`, `ZSCORE`…): a second
 * call, so that a key of another type never answers a command of the wrong type.
 */
import type { Json } from '../../shared/engine-request';
import type { Answers, Context, EngineStep, Outcome, ReadRequest } from '../../shared/feature';
import { needRead, noDanger, refuse, run } from '../../shared/feature';
import { checkText } from './text';
import { typedBytes, typedTextOf, type Typed } from './typed-bytes';
import {
  bytesJson,
  bytesOf,
  connectionOfKey,
  engineRead,
  fieldsOf,
  keyKept,
  keyOf,
  nameText,
  readAgain,
  replyText,
  type KeyAt,
  type ValueType,
  type Word,
} from './types';

/** The commands a check may send: they only read. */
const readingCommands = new Set([
  'TYPE',
  'GET',
  'STRLEN',
  'HGET',
  'HEXISTS',
  'HLEN',
  'HPTTL',
  'LINDEX',
  'LLEN',
  'SISMEMBER',
  'SCARD',
  'ZSCORE',
  'ZCARD',
  'XLEN',
]);

/** What a check answers: the type of the key (`none` when it is gone), or the replies of the commands it was given. */
export type KeyCheck = { readonly type: string } | { readonly replies: readonly unknown[] };

/** The words of a command as an argument of the Read: text as it is, bytes as `{ hex }`. */
export function commandJson(words: readonly Word[]): Json {
  return words.map((word) => (typeof word === 'string' ? word : bytesJson(word)));
}

function commandsOf(args: Json): readonly (readonly Word[])[] | undefined {
  const commands = fieldsOf(args)['commands'];
  if (!Array.isArray(commands)) {
    return undefined;
  }
  return (commands as readonly unknown[]).map((command) => {
    const words = Array.isArray(command) ? (command as readonly unknown[]) : [];
    const name = typeof words[0] === 'string' ? words[0].toUpperCase() : '';
    if (!readingCommands.has(name)) {
      throw new Error(`value.check sends only commands that read, not ${name}.`);
    }
    return words.map((word) => (typeof word === 'string' ? word : (bytesOf(word) ?? new Uint8Array())));
  });
}

/** Feature: value.check — `TYPE <key>`; with `args.commands`, those commands instead, each of which only reads. */
export function request(context: Context, args: Json): ReadRequest {
  const at = keyOf(context);
  return engineRead(at, commandsOf(args) ?? [['TYPE', at.key]]);
}

/** Feature: value.check — the type of the key, or the replies of the commands. */
export function parse(replies: readonly unknown[], args: Json = null): KeyCheck {
  if (commandsOf(args) !== undefined) {
    return { replies };
  }
  return { type: replyText(replies[0]) ?? 'none' };
}

/** The codes of the refusals of one write, written whole where the write calls {@link guard} (R4.2). */
export interface GuardCodes {
  readonly readOnly: string;
  readonly typeChanged: string;
  /** Absent for a write that asks what to do with a key that is gone (`value.save-string`). */
  readonly gone?: string;
}

/** A write that may go on, on its key, with the key's name as the messages write it; or what it returns instead. */
export type Guarded =
  | { readonly kind: 'ready'; readonly at: KeyAt; readonly name: string; readonly exists: boolean }
  | { readonly kind: 'stop'; readonly outcome: Outcome };

function typeOf(answer: unknown): string | undefined {
  const type = fieldsOf(answer)['type'];
  return typeof type === 'string' ? type : undefined;
}

/** The refusal of a write on a read-only connection, before it asks anything; undefined on a connection that writes. */
export function readOnlyRefusal(context: Context, code: string): Outcome | undefined {
  const connection = connectionOfKey(context, keyOf(context));
  return connection?.readOnly === true ? refuse(code, checkText.readOnly(connection.name)) : undefined;
}

/**
 * What every write of the area does before its first step: refuse on a read-only connection, read `TYPE <key>`, and
 * refuse when the key is gone or is no longer of the type the view shows.
 */
export function guard(context: Context, answers: Answers, shownType: ValueType, codes: GuardCodes): Guarded {
  const at = keyOf(context);
  const name = nameText(at.key);
  const connection = connectionOfKey(context, at);
  if (connection?.readOnly === true) {
    return { kind: 'stop', outcome: refuse(codes.readOnly, checkText.readOnly(connection.name)) };
  }
  const type = typeOf(answers['check']);
  if (type === undefined) {
    return { kind: 'stop', outcome: needRead('check', 'value.check') };
  }
  if (type === 'none') {
    return codes.gone === undefined
      ? { kind: 'ready', at, name, exists: false }
      : { kind: 'stop', outcome: refuse(codes.gone, checkText.gone(name)) };
  }
  if (type !== shownType) {
    return { kind: 'stop', outcome: refuse(codes.typeChanged, checkText.typeChanged(name, type, shownType)) };
  }
  return { kind: 'ready', at, name, exists: true };
}

/** The read of what a write compares, once the type is known: its replies come back under `current`. */
export function readCurrent(commands: readonly (readonly Word[])[]): Outcome {
  return needRead('current', 'value.check', { commands: commands.map(commandJson) });
}

/** The replies of {@link readCurrent}, once they are there. */
export function currentReplies(answers: Answers): readonly unknown[] | undefined {
  const replies = fieldsOf(answers['current'])['replies'];
  return Array.isArray(replies) ? (replies as readonly unknown[]) : undefined;
}

/** A write of the area as a plan: its steps, the confirmation when it has one, and what the undo history keeps. */
export interface WriteInput {
  readonly at: KeyAt;
  /** The operation as the undo history names it: `Add field nickname to user:7`. */
  readonly name: string;
  readonly steps: readonly EngineStep[];
  /** What the notification says once the steps have run. */
  readonly done: string;
  /** The confirmation, when the write asks one: its question, its detail and its button. */
  readonly confirm?: { readonly question: string; readonly detail: string; readonly button: string };
}

/** The plan of a write: recorded in the undo history with the whole key, then the view reads the value again. */
export function writePlan(input: WriteInput): Outcome {
  const { at, confirm } = input;
  return run({
    title: input.name,
    steps: input.steps,
    danger:
      confirm === undefined
        ? noDanger
        : {
            kind: 'confirm',
            text: confirm.detail === '' ? confirm.question : `${confirm.question}\n${confirm.detail}`,
            button: confirm.button,
          },
    undo: keyKept(at),
    publishes: false,
    after: [{ kind: 'notify', level: 'success', text: input.done }, readAgain(at)],
  });
}

/** The plan of a write that changes nothing: what was typed is what is there. */
export function nothingToWrite(name: string): Outcome {
  return run({
    title: name,
    steps: [],
    danger: noDanger,
    undo: { cannot: checkText.nothingChanged },
    publishes: false,
    after: [],
  });
}

/** The bytes typed in an answer (`{ text, format }`), or why they cannot be read. */
export function typedAnswer(value: unknown, original?: Uint8Array): Typed {
  const typed = typedTextOf(value);
  if (typed === undefined) {
    throw new Error('The window sends what was typed as { text, format }.');
  }
  return typedBytes(typed.text, typed.format, original);
}
