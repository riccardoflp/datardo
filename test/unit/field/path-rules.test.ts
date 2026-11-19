import { describe, expect, it } from 'vitest';
import { fieldPathError, renameError } from '../../../src/features/field/path-rules';

describe('field.path-rules', () => {
  it('finds an empty part', () => {
    expect(fieldPathError('a..b')).toBe('"a..b" has an empty part: write names separated by single dots');
    expect(fieldPathError('a.')).toBe('"a." has an empty part: write names separated by single dots');
  });

  it('refuses a part that starts with $', () => {
    expect(fieldPathError('$a')).toBe("Field names can't start with $");
    expect(fieldPathError('a.$b')).toBe("Field names can't start with $");
  });

  it('refuses _id and its sub-fields', () => {
    expect(fieldPathError('_id')).toBe("_id can't be changed");
    expect(fieldPathError('_id.x')).toBe("_id can't be changed");
  });

  it('accepts other paths, _id below the top level included', () => {
    expect(fieldPathError('a._id')).toBeUndefined();
    expect(fieldPathError('address.city')).toBeUndefined();
  });

  it('asks for a name when it is empty', () => {
    expect(fieldPathError('')).toBe('Enter a field name');
    expect(renameError('a', '')).toBe('Enter a field name');
  });

  it('asks for a different name', () => {
    expect(renameError('a', 'a')).toBe('Enter a different name');
  });

  it('refuses a name on the same path', () => {
    const message = "a and a.b are on the same path: a field can't be moved inside itself or its parent";
    expect(renameError('a', 'a.b')).toBe(message);
    expect(renameError('a.b', 'a')).toBe(
      "a.b and a are on the same path: a field can't be moved inside itself or its parent",
    );
  });

  it('accepts a name that only starts with the same letters, and another path', () => {
    expect(renameError('a', 'ab')).toBeUndefined();
    expect(renameError('a.b', 'c.d')).toBeUndefined();
  });

  it('checks a new name without the spaces around it', () => {
    expect(renameError('name', '  fullName ')).toBeUndefined();
    expect(renameError('name', ' name ')).toBe('Enter a different name');
    expect(fieldPathError('  ')).toBe('Enter a field name');
  });
});
