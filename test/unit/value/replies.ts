/**
 * The replies of the value area's Reads recorded from Redis 7.4 (`test/fixtures/replies/redis-7.4-values.json`, R11.3),
 * decoded back to what the engine gives: bytes, numbers with `inf`, maps as their entries, errors as their message.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Json } from '../../../src/shared/engine-request';

const file = join(import.meta.dirname, '..', '..', 'fixtures', 'replies', 'redis-7.4-values.json');
const recorded = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;

function decoded(value: unknown): unknown {
  if (Array.isArray(value)) {
    return (value as readonly unknown[]).map(decoded);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const fields = value as Record<string, unknown>;
  if (typeof fields['bytes'] === 'string') {
    return Uint8Array.from(Buffer.from(fields['bytes'], 'base64'));
  }
  if (typeof fields['double'] === 'string') {
    return Number(fields['double']);
  }
  if (Array.isArray(fields['map'])) {
    return {
      kind: 'map',
      entries: (fields['map'] as readonly (readonly unknown[])[]).map(([key, each]) => [decoded(key), decoded(each)]),
    };
  }
  return { kind: 'error', message: String(fields['error']) };
}

/** A read recorded: the arguments it was sent with and its replies. */
export function recordedRead(name: string): { readonly args: Json; readonly replies: readonly unknown[] } {
  const read = recorded[name] as { readonly args: Json; readonly replies: readonly unknown[] } | undefined;
  if (read === undefined) {
    throw new Error(`No recorded read named ${name}.`);
  }
  return { args: read.args, replies: read.replies.map(decoded) };
}
