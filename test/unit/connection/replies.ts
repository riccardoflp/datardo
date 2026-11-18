/**
 * The replies recorded from real servers (`test/fixtures/replies/`, R11.3), as the engines give them back: canonical
 * Extended JSON for MongoDB, bytes for Redis.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Json } from '../../../src/shared/engine-request';

const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');

/** A recorded reply of MongoDB. */
export function mongoReply(name: string): Json {
  return JSON.parse(readFileSync(join(folder, `${name}.json`), 'utf8')) as Json;
}

/** A recorded reply of Redis, as its bytes. */
export function redisReply(name: string): Uint8Array {
  return Uint8Array.from(readFileSync(join(folder, `${name}.txt`)));
}
