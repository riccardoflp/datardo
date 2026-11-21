/**
 * A reply of Redis with every RESP type kept apart, as the console's own connection reads it (`console.reply`): a bulk
 * string as bytes, an integer as a 64-bit integer, a simple string apart from a bulk one, a set apart from an array, a
 * double, a boolean and a big number as themselves. The ordinary clients give `RedisReply`, which merges some of them.
 */
import { utf8Bytes, type RedisReply } from './engine-request';

/** A reply with every RESP type kept apart. */
export type TypedReply =
  | { readonly kind: 'null' }
  | { readonly kind: 'integer'; readonly value: bigint }
  | { readonly kind: 'simple'; readonly text: string }
  | { readonly kind: 'bulk'; readonly bytes: Uint8Array }
  | { readonly kind: 'verbatim'; readonly format: string; readonly text: string }
  | { readonly kind: 'double'; readonly value: number }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'big-number'; readonly digits: string }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'array'; readonly items: readonly TypedReply[] }
  | { readonly kind: 'set'; readonly items: readonly TypedReply[] }
  | { readonly kind: 'push'; readonly items: readonly TypedReply[] }
  | { readonly kind: 'map'; readonly entries: readonly (readonly [TypedReply, TypedReply])[] };

/** What the console's own connection answers to a command: the reply, and how many bytes the server sent for it. */
export interface ConsoleAnswer {
  readonly reply: TypedReply;
  /** More than 16 MB means that the strings of the reply were cut at 16 MB (`console.output`). */
  readonly bytes: number;
}

/** Whether a value received from the engine is a {@link ConsoleAnswer}. */
export function isConsoleAnswer(value: unknown): value is ConsoleAnswer {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { bytes?: unknown }).bytes === 'number' &&
    typeof (value as { reply?: unknown }).reply === 'object'
  );
}

/** Whether a value received from the engine is a {@link TypedReply} of the kind error. */
export function isErrorReply(value: unknown): value is Extract<TypedReply, { kind: 'error' }> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'error' &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}

/**
 * A reply of the console's connection in the shape the ordinary clients give (`RedisReply`), for what reads through
 * it without showing the reply (`console.command-flags`): strings as bytes, integers and doubles as numbers, an error
 * as its message.
 */
export function redisReplyOf(reply: TypedReply): RedisReply {
  switch (reply.kind) {
    case 'null':
      return null;
    case 'integer':
      return Number(reply.value);
    case 'simple':
      return utf8Bytes(reply.text);
    case 'bulk':
      return reply.bytes;
    case 'verbatim':
      return utf8Bytes(reply.text);
    case 'double':
    case 'boolean':
      return reply.value;
    case 'big-number':
      return utf8Bytes(reply.digits);
    case 'error':
      return { kind: 'error', message: reply.message };
    case 'array':
    case 'set':
    case 'push':
      return reply.items.map(redisReplyOf);
    case 'map':
      return { kind: 'map', entries: reply.entries.map(([key, value]) => [redisReplyOf(key), redisReplyOf(value)]) };
  }
}
