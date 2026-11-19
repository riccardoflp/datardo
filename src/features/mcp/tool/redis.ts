/**
 * The commands the Redis tools send, each in the database asked for and with the time limit of `mcp.output-limits`,
 * and how their replies are read: bytes as text or as `hex:`, numbers, and the names of keys written with `\x` for the
 * bytes that are not UTF-8 (`mcp.arguments`).
 */
import type { ConnectionRequest } from '../../../shared/engine-request';
import { redisCommand } from '../../../shared/engine-request';
import type { ConnectionId } from '../../../shared/ids';
import { clippedValue, MAX_TIME_MS } from '../output-limits';
import { isFailed, isTimedOut } from '../types';
import { ToolProblem } from './program';

/** A Redis command in a database, with the time limit (30 s). */
export function redisCall(
  connection: ConnectionId,
  database: number,
  words: readonly (string | Uint8Array)[],
): ConnectionRequest {
  return { connection, request: { ...redisCommand(database, ...words), timeLimitMs: MAX_TIME_MS } };
}

const decoder = new TextDecoder('utf-8', { fatal: true });

/** The bytes as text when they are valid UTF-8. */
export function utf8Text(bytes: Uint8Array): string | undefined {
  try {
    return decoder.decode(bytes);
  } catch {
    // Not UTF-8: the caller writes the bytes another way.
    return undefined;
  }
}

/** A reply as text: bytes decoded (invalid sequences replaced), numbers written; empty otherwise. */
export function replyText(reply: unknown): string {
  if (reply instanceof Uint8Array) {
    return new TextDecoder().decode(reply);
  }
  return typeof reply === 'number' ? String(reply) : '';
}

/** A reply as a number: an integer reply, or digits as bytes. */
export function replyNumber(reply: unknown): number | undefined {
  if (typeof reply === 'number') {
    return reply;
  }
  const text = replyText(reply).trim();
  return text !== '' && Number.isFinite(Number(text)) ? Number(text) : undefined;
}

/** The items of an array reply. */
export function replyItems(reply: unknown): readonly unknown[] {
  return Array.isArray(reply) ? (reply as readonly unknown[]) : [];
}

/**
 * A value, a field, an element or a member as the model reads it (`value.format`): valid UTF-8 as text in double
 * quotes, anything else as `hex:` and its bytes; cut at 1,500 characters with `… (<n> more characters)`.
 */
export function valueText(bytes: Uint8Array): string {
  const text = utf8Text(bytes);
  const written =
    text === undefined
      ? `hex:${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
      : JSON.stringify(text);
  return clippedValue(written);
}

/** A name of a key as the tools write it: its text, with `\xHH` for a byte that is not UTF-8 and `\\` for `\`. */
export function keyText(bytes: Uint8Array): string {
  let written = '';
  let index = 0;
  while (index < bytes.length) {
    const length = sequenceLength(bytes, index);
    if (length > 0) {
      written += new TextDecoder().decode(bytes.subarray(index, index + length)).replace(/\\/gu, '\\\\');
      index += length;
    } else {
      written += `\\x${(bytes[index] ?? 0).toString(16).padStart(2, '0')}`;
      index += 1;
    }
  }
  return written;
}

/** The length of the valid UTF-8 character at `index`, or 0 when its byte is not one. */
function sequenceLength(bytes: Uint8Array, index: number): number {
  const first = bytes[index] ?? 0;
  const length = first < 0x80 ? 1 : first >= 0xf0 && first < 0xf5 ? 4 : first >= 0xe0 ? 3 : first >= 0xc2 ? 2 : 0;
  if (length === 0 || index + length > bytes.length) {
    return 0;
  }
  return utf8Text(bytes.subarray(index, index + length)) === undefined ? 0 : length;
}

/** The bytes of a name written as {@link keyText} writes it: `cache:\xff\x01`, `a\\b`. */
export function keyBytes(written: string): Uint8Array {
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  let index = 0;
  while (index < written.length) {
    const hex = /^\\x([0-9a-fA-F]{2})/u.exec(written.slice(index));
    if (hex?.[1] !== undefined) {
      bytes.push(parseInt(hex[1], 16));
      index += 4;
    } else if (written.startsWith('\\\\', index)) {
      bytes.push(0x5c);
      index += 2;
    } else {
      const character = String.fromCodePoint(written.codePointAt(index) ?? 0);
      bytes.push(...encoder.encode(character));
      index += character.length;
    }
  }
  return Uint8Array.from(bytes);
}

/** The words a reply that failed gives the model; a database the server does not have, or no answer in time. */
export interface RedisWhere {
  readonly connectionName: string;
  readonly database: number;
}

/** The reply, or the sentence of its failure: no answer within 30 s, a database out of range, the server's message. */
export function redisReply(reply: unknown, where: RedisWhere): unknown {
  if (isTimedOut(reply)) {
    throw new ToolProblem(`${where.connectionName} did not answer within 30 s.`);
  }
  if (isFailed(reply)) {
    if (/DB index is out of range|invalid DB index/iu.test(reply.message)) {
      throw new ToolProblem(`${where.connectionName} has no database ${String(where.database)}.`);
    }
    throw new ToolProblem(reply.message);
  }
  return reply;
}
