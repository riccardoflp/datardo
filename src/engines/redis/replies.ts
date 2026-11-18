/**
 * Replies of Redis as the engine gives them back (`RedisReply`): strings as bytes, so that values that are not text
 * keep their bytes (R5.5); maps as their entries in order; an error inside a reply as its message.
 */
import { RESP_TYPES } from 'redis';
import type { RedisReply } from '../../shared/engine-request';

/** How node-redis decodes each type of reply for the engine: every string as a Buffer, maps as Maps. */
export const bytesMapping = {
  [RESP_TYPES.BLOB_STRING]: Buffer,
  [RESP_TYPES.SIMPLE_STRING]: Buffer,
  [RESP_TYPES.VERBATIM_STRING]: Buffer,
  [RESP_TYPES.MAP]: Map,
  [RESP_TYPES.SET]: Array,
  [RESP_TYPES.BIG_NUMBER]: String,
} as const;

const encoder = new TextEncoder();

/** A decoded reply as a `RedisReply`: bytes copied out of the driver's buffers. */
export function toRedisReply(value: unknown): RedisReply {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'bigint') {
    return encoder.encode(String(value));
  }
  if (value instanceof Uint8Array) {
    return Uint8Array.from(value);
  }
  if (value instanceof Error) {
    return { kind: 'error', message: value.message };
  }
  if (Array.isArray(value) || value instanceof Set) {
    return [...(value as Iterable<unknown>)].map(toRedisReply);
  }
  const entries = value instanceof Map ? [...(value as Map<unknown, unknown>)] : Object.entries(value);
  return { kind: 'map', entries: entries.map(([key, each]) => [toRedisReply(key), toRedisReply(each)] as const) };
}
