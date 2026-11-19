import { describe, expect, it } from 'vitest';
import { nameError, nameRules } from '../../../src/features/manage/name-rules';
import { textProblem, type TextField } from '../../../src/shared/question';

const characters = 'A database name cannot contain spaces or / \\ . " $ * < > : | ?';

function typed(kind: 'database' | 'collection', value: string): string | undefined {
  const field: TextField = { kind: 'text', key: 'name', label: 'Name', rules: nameRules(kind) };
  return textProblem(field, value);
}

describe('manage.name-rules', () => {
  it('gives each name of the examples its message', () => {
    expect(nameError('database', 'shop')).toBeUndefined();
    expect(nameError('database', 'my shop')).toBe(characters);
    expect(nameError('database', 'a'.repeat(64))).toBe('A database name is at most 63 bytes');
    expect(nameError('database', 'é'.repeat(32))).toBe('A database name is at most 63 bytes');
    expect(nameError('collection', 'orders.2024')).toBeUndefined();
    expect(nameError('collection', 'system.users')).toBe('Names starting with "system." are reserved');
    expect(nameError('collection', 'orders.')).toBe('A collection name cannot start or end with a dot');
    expect(nameError('collection', '$orders')).toBe('A collection name cannot contain $');
    expect(nameError('database', '')).toBe('Enter a name');
    expect(nameError('collection', '')).toBe('Enter a name');
  });

  it('decides by the first rule that fails: $system.users is refused for its $', () => {
    expect(nameError('collection', '$system.users')).toBe('A collection name cannot contain $');
  });

  it('refuses each character of a database name, and NUL', () => {
    for (const character of ['/', '\\', '.', '"', '$', '*', '<', '>', ':', '|', '?', '\u0000']) {
      expect(nameError('database', `a${character}b`)).toBe(characters);
    }
    expect(nameError('collection', 'a\u0000b')).toBe('A collection name cannot contain $');
    expect(nameError('database', 'a'.repeat(63))).toBeUndefined();
  });

  it('checks the name trimmed', () => {
    expect(nameError('database', ' shop ')).toBeUndefined();
    expect(nameError('collection', '  ')).toBe('Enter a name');
  });

  it('gives the dialog the same messages while typing, the length in bytes apart', () => {
    expect(typed('database', ' shop ')).toBeUndefined();
    expect(typed('database', 'my shop')).toBe(characters);
    expect(typed('database', '')).toBe('Enter a name');
    expect(typed('collection', '$system.users')).toBe('A collection name cannot contain $');
    expect(typed('collection', 'system.users')).toBe('Names starting with "system." are reserved');
    expect(typed('collection', 'orders.')).toBe('A collection name cannot start or end with a dot');
    expect(typed('collection', '.orders')).toBe('A collection name cannot start or end with a dot');
    expect(typed('collection', ' orders.2024 ')).toBeUndefined();
  });
});
