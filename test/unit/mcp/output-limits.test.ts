import { describe, expect, it } from 'vitest';
import type { MongoRequest } from '../../../src/shared/engine-request';
import {
  clippedValue,
  COUNT_CAP,
  fittedItems,
  MAX_OUTPUT,
  MAX_TIME_MS,
  truncated,
  truncationLine,
} from '../../../src/features/mcp/output-limits';
import { answerOf, cache, drive, failureOf, local, nameOf } from './harness';

describe('mcp.output-limits', () => {
  it('cuts a long text at its last line break past half of the limit, and says so', () => {
    const text = `${'a'.repeat(59_990)}\n${'b'.repeat(10_009)}`;
    expect(truncated(text)).toBe(`${'a'.repeat(59_990)}\n… (output truncated at 60,000 characters)`);
  });

  it('cuts a text with no line break at the limit', () => {
    const text = 'x'.repeat(70_000);
    expect(truncated(text)).toBe(`${'x'.repeat(60_000)}\n${truncationLine(MAX_OUTPUT)}`);
  });

  it('keeps a text that fits', () => {
    expect(truncated('short')).toBe('short');
  });

  it('cuts a value of 2,000 characters at 1,500 and counts the rest', () => {
    expect(clippedValue('v'.repeat(2000))).toBe(`${'v'.repeat(1500)}… (500 more characters)`);
  });

  it('keeps whole items within the room left by the head and the foot, and counts the others', () => {
    const items = Array.from({ length: 100 }, () => 'i'.repeat(999));
    const fitted = fittedItems(items);
    expect(fitted.shown.length).toBe(58);
    expect(fitted.left).toBe(42);
  });

  it('has the bounds of the card', () => {
    expect([MAX_OUTPUT, MAX_TIME_MS, COUNT_CAP]).toEqual([60_000, 30_000, 100_000]);
  });

  it('never returns more than 60,000 characters plus its line, with 5,000 collections', () => {
    const names = Array.from({ length: 5000 }, (_, index) => ({
      name: `collection_${String(index).padStart(5, '0')}_${'n'.repeat(20)}`,
      type: 'collection',
    }));
    const driven = drive(
      'list_collections',
      { connection: 'Local', database: 'shop' },
      { mongo: (request) => (request.method === 'listCollections' ? names : { ok: 1 }) },
    );
    const text = answerOf(driven);
    expect(text.length).toBeLessThanOrEqual(MAX_OUTPUT + truncationLine(MAX_OUTPUT).length + 1);
    expect(text.endsWith(truncationLine(MAX_OUTPUT))).toBe(true);
  });

  it('gives every MongoDB request a time limit of 30 s', () => {
    const driven = drive(
      'find_documents',
      { connection: 'Local', database: 'shop', collection: 'orders' },
      {
        mongo: (request) =>
          request.method === 'listCollections'
            ? [{ name: 'orders', type: 'collection' }]
            : request.method === 'find'
              ? []
              : 0,
      },
    );
    for (const each of driven.sent) {
      const request = each.request as MongoRequest;
      expect(request.timeLimitMs, nameOf(request)).toBe(MAX_TIME_MS);
    }
  });

  it('fails with the sentence of a Redis server that does not answer, and the next call works', () => {
    const silent = drive(
      'redis_key_details',
      { connection: 'Cache local', key: 'orders:42' },
      { redis: () => ({ kind: 'timed-out' }) },
    );
    expect(failureOf(silent)).toBe(`${cache.name} did not answer within 30 s.`);
    const next = drive('list_connections', {});
    expect(answerOf(next)).toContain(local.name);
  });
});
