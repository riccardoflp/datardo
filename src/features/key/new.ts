/**
 * Feature: key.new
 *
 * Creates a key of a chosen type with its first value: a hash, a list, a set, a sorted set or a stream cannot exist
 * empty. A string is `SET … NX`, with its expiry in the same command; another type with an expiry runs as `MULTI`,
 * the command, `EXPIRE` or `PEXPIREAT`, `EXEC`, so that the key is never left without its expiry. The values are
 * typed as text (`value.typed-bytes`, M14, adds JSON and hexadecimal).
 */
import type { Json, RedisReply } from '../../shared/engine-request';
import type { Answers, Context, EngineStep, Outcome, ReadFeature } from '../../shared/feature';
import type { TextField } from '../../shared/question';
import { ask, needRead, noDanger, refuse, run } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { seconds } from './parse-duration';
import { dateOfText } from './set-expiry';
import { text } from './text';
import type { KeyName, KeysPlace, KnownType, ReplyOutcome } from './types';
import {
  databaseName,
  keyArgs,
  keysUndo,
  knownTypes,
  nameOfText,
  nameText,
  notifySuccess,
  oneKeyRequest,
  parseExists,
  placeOf,
  readOnlyMessage,
  refreshAfter,
  refusedReply,
  typeLabel,
  typeWord,
  writeStep,
} from './types';

/** The identifier of the read that says whether the name is taken. */
export const existsReadId = 'key.new:read';

/** When the key expires: never, after a number of seconds, or at a date in milliseconds. */
export type NewExpiry =
  | { readonly kind: 'none' }
  | { readonly kind: 'in'; readonly seconds: number }
  | { readonly kind: 'on'; readonly at: number };

const textField = (key: string, label: string, value = ''): TextField => ({ kind: 'text', key, label, default: value });

/** The form **New key in db0**: name, type, the first value of every type, and the expiry. */
function newForm(place: KeysPlace): Outcome {
  return ask({
    title: text.new.form(databaseName(place.database)),
    button: text.new.button,
    fields: [
      {
        ...textField('name', text.new.name, place.namespace ?? ''),
        rules: [{ kind: 'not-empty', message: text.new.emptyName }],
      },
      {
        kind: 'pick-one',
        key: 'type',
        label: text.new.type,
        choices: knownTypes.map((type) => ({ value: type, label: typeLabel(type) })),
        default: 'string',
      },
      textField('field', text.new.field),
      textField('value', text.new.value),
      textField('score', text.new.score, '0'),
      textField('id', text.new.id, '*'),
      {
        kind: 'pick-one',
        key: 'expiry',
        label: text.new.expiry,
        choices: [
          { value: 'none', label: text.new.expiryNone },
          { value: 'in', label: text.new.expiryIn },
          { value: 'on', label: text.new.expiryOn },
        ],
        default: 'none',
      },
      textField('duration', text.new.duration),
      textField('date', text.new.date),
    ],
  });
}

const answer = (answers: Answers, key: string, otherwise = ''): string => {
  const value = answers[key];
  return typeof value === 'string' ? value : otherwise;
};

/** What was typed that cannot be read, with the message shown under its field (`/invalid`). */
export interface Invalid {
  readonly kind: 'invalid';
  readonly message: string;
}

const invalid = (message: string): Invalid => ({ kind: 'invalid', message });

/** The expiry asked, or why what was typed cannot be read. */
export function expiryOf(answers: Answers, now: number): NewExpiry | Invalid {
  switch (answers['expiry']) {
    case 'in': {
      const duration = seconds(answer(answers, 'duration'));
      return duration.kind === 'error' ? invalid(duration.message) : { kind: 'in', seconds: duration.seconds };
    }
    case 'on': {
      const at = dateOfText(answer(answers, 'date'));
      if (at === undefined) {
        return invalid(text.new.badDate);
      }
      return at <= now ? invalid(text.new.pastDate) : { kind: 'on', at };
    }
    default:
      return { kind: 'none' };
  }
}

const isScore = (score: string): boolean =>
  /^[+-]?inf$/iu.test(score) || /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/u.test(score);

/** The words of a command. */
export type Words = readonly (string | Uint8Array)[];

/** The command that creates the key with its first value, or why a value cannot be read. */
export function createCommand(type: KnownType, name: KeyName, answers: Answers): Words | Invalid {
  const value = nameOfText(answer(answers, 'value'));
  const field = nameOfText(answer(answers, 'field'));
  switch (type) {
    case 'string':
      return ['SET', name, value, 'NX'];
    case 'hash':
      return ['HSET', name, field, value];
    case 'list':
      return ['RPUSH', name, value];
    case 'set':
      return ['SADD', name, value];
    case 'zset': {
      const score = answer(answers, 'score', '0').trim();
      return isScore(score) ? ['ZADD', name, score, value] : invalid(text.new.badScore);
    }
    case 'stream': {
      const id = answer(answers, 'id', '*').trim();
      return /^(\*|\d+(-(\d+|\*))?)$/u.test(id) ? ['XADD', name, id, field, value] : invalid(text.new.badId);
    }
  }
}

/** The steps: `SET … NX` with its expiry, or the command alone, or `MULTI`, the command, the expiry, `EXEC`. */
export function createSteps(place: KeysPlace, name: KeyName, words: Words, expiry: NewExpiry): readonly EngineStep[] {
  if (expiry.kind === 'none') {
    return [writeStep(place, words)];
  }
  if (words[0] === 'SET') {
    return [
      writeStep(place, [
        ...words,
        ...(expiry.kind === 'in' ? ['EX', String(expiry.seconds)] : ['PXAT', String(expiry.at)]),
      ]),
    ];
  }
  const expire =
    expiry.kind === 'in' ? ['EXPIRE', name, String(expiry.seconds)] : ['PEXPIREAT', name, String(expiry.at)];
  return [writeStep(place, ['MULTI']), writeStep(place, words), writeStep(place, expire), writeStep(place, ['EXEC'])];
}

function typeOf(answers: Answers): KnownType {
  return knownTypes.find((type) => type === answers['type']) ?? 'string';
}

/**
 * Feature: key.new — the form, `EXISTS <name>`, then the command of the type with its first value and its expiry;
 * recorded as `New hash user:7`, the key kept as missing so that the undo deletes it.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place === undefined) {
    throw new Error('key.new needs a database of a Redis connection.');
  }
  if (place.connection.readOnly) {
    return refuse('key.new/read-only', readOnlyMessage(place));
  }
  if (typeof answers['name'] !== 'string') {
    return newForm(place);
  }
  if (answers['name'] === '') {
    return refuse('key.new/invalid', text.new.emptyName);
  }
  const name = nameOfText(answers['name']);
  const type = typeOf(answers);
  const words = createCommand(type, name, answers);
  const expiry = expiryOf(answers, context.now);
  if ('kind' in words) {
    return refuse('key.new/invalid', words.message);
  }
  if (expiry.kind === 'invalid') {
    return refuse('key.new/invalid', expiry.message);
  }
  const exists = answers['exists'];
  if (typeof exists !== 'boolean') {
    return needRead('exists', existsReadId, keyArgs(place, name));
  }
  if (exists) {
    return refuse('key.new/exists', text.new.exists(nameText(name)));
  }
  return run({
    title: text.new.title(typeWord(type), nameText(name)),
    steps: createSteps(place, name, words, expiry),
    danger: noDanger,
    undo: keysUndo(context, place, [name]),
    publishes: false,
    after: [
      notifySuccess(text.new.done(typeWord(type), nameText(name), databaseName(place.database)), [
        {
          label: text.new.open,
          feature: featureId('key.open'),
          target: { kind: 'key', connection: place.connection.id, database: place.database, key: name },
        },
      ]),
      refreshAfter(place),
    ],
  });
}

/** What the reply of `SET … NX` means: nil is a key created meanwhile (`/exists`). */
export function afterReply(reply: RedisReply, name: KeyName): ReplyOutcome {
  return reply === null ? refusedReply('key.new/exists', text.new.createdMeanwhile(nameText(name))) : { kind: 'done' };
}

/** `key.new:read`: `EXISTS <name>`. */
export const read: ReadFeature = {
  kind: 'read',
  id: featureId(existsReadId),
  request: (_context: Context, args: Json) => oneKeyRequest('EXISTS', args),
  parse: parseExists,
};
