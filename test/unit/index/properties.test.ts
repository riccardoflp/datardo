import { describe, expect, it } from 'vitest';
import { badges, bytesText } from '../../../src/features/index/properties';
import type { IndexInfo, JsonDocument } from '../../../src/features/index/types';
import { recordedIndex } from './harness';

function index(key: JsonDocument, options: JsonDocument = {}, more: Partial<IndexInfo> = {}): IndexInfo {
  return { name: 'i', key, options: { v: 2, ...options }, building: false, ...more };
}

function labels(info: IndexInfo): readonly string[] {
  return badges(info).map((badge) => badge.label);
}

describe('index.properties', () => {
  it('gives the badges of each index of the examples, in that order', () => {
    expect(labels(index({ email: 1 }, { unique: true }))).toEqual(['unique']);
    expect(labels(index({ createdAt: 1 }, { expireAfterSeconds: 7200 }))).toEqual(['TTL 2h']);
    expect(labels(index({ createdAt: 1 }, { expireAfterSeconds: 86_400 }))).toEqual(['TTL 1d']);
    expect(labels(index({ createdAt: 1 }, { expireAfterSeconds: 90 }))).toEqual(['TTL 90s']);
    expect(labels(index({ createdAt: 1 }, { expireAfterSeconds: 0 }))).toEqual(['TTL 0s']);
    expect(labels(recordedIndex('title_text_body_text'))).toEqual(['text']);
    expect(labels(index({ loc: '2dsphere', status: 1 }, { sparse: true }))).toEqual(['2dsphere', 'sparse']);
    expect(labels(index({ '$**': 1 }))).toEqual(['wildcard']);
    expect(labels(index({ 'address.*': 1 }))).toEqual(['not a wildcard']);
    expect(labels(index({ status: 1 }, { partialFilterExpression: { status: 'active' }, hidden: true }))).toEqual([
      'partial',
      'hidden',
    ]);
    expect(labels(index({ name: 1 }, { collation: { locale: 'fr', strength: 2 } }))).toEqual(['collation fr']);
    expect(labels(recordedIndex('name_1'))).toEqual(['collation en']);
    expect(labels(recordedIndex('createdAt_1'))).toEqual(['TTL 1d']);
    expect(badges(recordedIndex('total_-1'))[0]?.tooltip).toBe('Only documents matching { status: "paid" }');
  });

  it('shows building 41% for a build at 419,999 of 1,000,000', () => {
    const info = index(
      { a: 1 },
      {},
      { building: true, progress: { done: 419_999, total: 1_000_000, phase: 'Scanning collection' } },
    );
    const [badge] = badges(info);
    expect(badge).toEqual({
      label: 'building 41%',
      tooltip: 'Scanning collection: 419,999 of 1,000,000',
      warning: true,
    });
    expect(badges(index({ a: 1 }, {}, { building: true }))[0]?.label).toBe('building');
  });

  it('writes sizes in units of 1,024', () => {
    expect([1536, 10_240, 1023].map(bytesText)).toEqual(['1.5 KB', '10 KB', '1023 B']);
  });
});
