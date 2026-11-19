import { describe, expect, it } from 'vitest';
import { matches } from '../../../src/features/search/match';
import { wanted, type Wanted } from '../../../src/features/search/text';
import type { SearchMode } from '../../../src/features/search/types';

type Looking = Extract<Wanted, { kind: 'wanted' }>;

function looking(typed: string, mode: SearchMode = 'contains', matchCase = false): Looking {
  const result = wanted(typed, mode, matchCase);
  if (result.kind !== 'wanted') {
    throw new Error(`Expected a pattern, got ${result.message}`);
  }
  return result;
}

function finds(typed: string, value: string, mode: SearchMode = 'contains', matchCase = false): boolean {
  return (
    matches({ _id: 1, value }, looking(typed, mode, matchCase), false)?.matches.some((each) => each.path === 'value') ??
    false
  );
}

describe('search.text', () => {
  it('finds mario anywhere, in any case', () => {
    expect(finds('mario', 'Mario Rossi')).toBe(true);
  });

  it('finds Mario in that case only with Match case', () => {
    expect(finds('Mario', 'mario rossi', 'contains', true)).toBe(false);
    expect(finds('Mario', 'Mario rossi', 'contains', true)).toBe(true);
  });

  it('trims the text', () => {
    expect(looking('  rossi  ').whole).toBe('rossi');
  });

  it('finds a.b literally', () => {
    expect(finds('a.b', 'axb')).toBe(false);
    expect(finds('a.b', 'xa.by')).toBe(true);
  });

  it('gives what is between quotes and inside the mongosh helpers', () => {
    expect(looking('"mario rossi"').whole).toBe('mario rossi');
    expect(looking('ObjectId("65f1c0a2b3d4e5f6a7b8c9d0")').whole).toBe('65f1c0a2b3d4e5f6a7b8c9d0');
    expect(looking("new ObjectId('65f1c0a2b3d4e5f6a7b8c9d0')").whole).toBe('65f1c0a2b3d4e5f6a7b8c9d0');
    expect(looking('ISODate("2024-03-15")').whole).toBe('2024-03-15');
    expect(looking('NumberLong(42)').whole).toBe('42');
  });

  it('reads the name of a helper in any case and drops the spaces inside the parentheses', () => {
    expect(looking('objectid( "65f1c0a2b3d4e5f6a7b8c9d0" )').whole).toBe('65f1c0a2b3d4e5f6a7b8c9d0');
  });

  it('says Type something to search. for empty quotes and for spaces alone, in both modes', () => {
    expect(wanted('""', 'contains', false)).toEqual({ kind: 'error', message: 'Type something to search.' });
    expect(wanted('   ', 'contains', false)).toEqual({ kind: 'error', message: 'Type something to search.' });
    expect(wanted('   ', 'regex', false)).toEqual({ kind: 'error', message: 'Type something to search.' });
  });

  it('writes the regular expressions of Regex mode as the card shows them', () => {
    const shown = (typed: string, matchCase: boolean): string => {
      const pattern = looking(typed, 'regex', matchCase).pattern;
      return `/${pattern.source}/${pattern.flags}`;
    };
    expect(shown('^ma', false)).toBe('/^ma/i');
    expect(shown('^ma', true)).toBe('/^ma/');
    expect(shown('/^Ma/', false)).toBe('/^Ma/i');
    expect(shown('/^ma/gs', true)).toBe('/^ma/s');
    expect(shown('ObjectId("65f1")', false)).toBe('/ObjectId("65f1")/i');
    expect(looking('^ma', 'regex').whole).toBeUndefined();
  });

  it('keeps the i of /abc/i with Match case', () => {
    expect(looking('/abc/i', 'regex', true).pattern.flags).toBe('i');
  });

  it('gives the engine its error for a regular expression that is not valid', () => {
    expect(wanted('([', 'regex', false)).toEqual({
      kind: 'error',
      message: 'Invalid regular expression: /([/: Unterminated character class',
    });
  });

  it('finds the string 1+1=2 and not 11 with 1+1 in Contains mode', () => {
    expect(finds('1+1', '1+1=2')).toBe(true);
    expect(finds('1+1', '11')).toBe(false);
  });

  it('gives a pattern without regard to case for ObjectIds, UUIDs and dates', () => {
    expect(looking('ABC', 'contains', true).anyCase.flags).toContain('i');
    expect(looking('^ab', 'regex', true).anyCase.flags).toContain('i');
  });
});
