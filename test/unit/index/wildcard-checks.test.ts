import { describe, expect, it } from 'vitest';
import { dialogWarnings } from '../../../src/features/index/dialog';
import type { JsonDocument } from '../../../src/features/index/types';
import { isWildcard, wildcardWarnings } from '../../../src/features/index/wildcard-checks';

function warnings(keys: JsonDocument, options: JsonDocument = {}): readonly string[] {
  return wildcardWarnings({ keys, options });
}

describe('index.wildcard-checks', () => {
  it('gives the warnings of the worked examples', () => {
    expect(warnings({ 'address.*': 1 })).toEqual([
      "address.* isn't a wildcard: MongoDB would index a field with that very name. Write $** for every field, or path.$** for every field below a path.",
    ]);
    expect(warnings({ '**': 1 })[0]).toMatch(
      /^\*\* isn't a wildcard: MongoDB would index a field with that very name\./u,
    );
    expect(warnings({ 'a.$**.b': 1 })).toEqual([
      "a.$**.b isn't a wildcard: write $** for every field or path.$** for every field below a path, with nothing after it.",
    ]);
    expect(warnings({ '$**': 1, 'a.$**': 1 })).toEqual(['An index can have only one wildcard field.']);
    expect(warnings({ '$**': 'hashed' })).toEqual(['$**: a wildcard field is ascending or descending (1 or -1).']);
    expect(warnings({ '$**': 1 }, { unique: true, expireAfterSeconds: 5 })).toEqual([
      "A wildcard index can't be unique or TTL.",
    ]);
    expect(warnings({ '$**': 1 }, { sparse: true })).toEqual(["A wildcard index can't be sparse."]);
    expect(warnings({ 'a.$**': 1 }, { wildcardProjection: { b: 1 } })).toEqual([
      'wildcardProjection only goes with $**: a.$** already says which fields are indexed.',
    ]);
    expect(warnings({ a: 1 }, { wildcardProjection: { b: 1 } })).toEqual([
      'wildcardProjection is only for wildcard indexes.',
    ]);
    expect(warnings({ '$**': 1, status: 1 })).toEqual([
      'A compound index with $** needs a wildcardProjection that leaves out its other fields, e.g. wildcardProjection: { status: 0 }.',
    ]);
    expect(warnings({ '$**': 1, status: 1 }, { wildcardProjection: { status: 0 } })).toEqual([]);
    for (const keys of [{ '$**': 1 }, { 'a.$**': -1 }, { '$**': 'text' }, { a: 1 }]) {
      expect(warnings(keys)).toEqual([]);
    }
    expect(isWildcard('a.$**')).toBe(true);
    expect(isWildcard('a.*')).toBe(false);
  });

  it('only warns: a definition with warnings is still a definition the dialog sends', () => {
    const read = { kind: 'definition', definition: { keys: { 'address.*': 1 }, options: {} } } as const;
    expect(dialogWarnings(read)).toHaveLength(1);
  });

  it('gives no warning for unique: false on a wildcard, the definition being normalized first', () => {
    expect(warnings({ '$**': 1 }, { unique: false })).toEqual([]);
  });
});
