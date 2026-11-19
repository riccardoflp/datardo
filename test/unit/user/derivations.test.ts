import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  characterOfByte,
  generatePassword,
  generatedField,
  passwordAlphabet,
  passwordField,
} from '../../../src/features/user/generate-password';
import { privilegeSummary, resourceText } from '../../../src/features/user/privilege-summary';
import {
  builtInRoleNames,
  databaseForRole,
  existsOnlyInAdmin,
  roleArgument,
  roleLabel,
  roleName,
  suggestedRoles,
} from '../../../src/features/user/role-reference';
import type { Privilege } from '../../../src/features/user/types';

describe('user.role-reference', () => {
  it.each([
    [{ role: 'readWrite', db: 'shop' }, 'shop', 'readWrite', 'readWrite'],
    [{ role: 'read', db: 'reporting' }, 'shop', 'read@reporting', { role: 'read', db: 'reporting' }],
    [{ role: 'clusterMonitor', db: 'admin' }, 'shop', 'clusterMonitor@admin', { role: 'clusterMonitor', db: 'admin' }],
    [{ role: 'clusterMonitor', db: 'admin' }, 'admin', 'clusterMonitor', 'clusterMonitor'],
    [{ role: 'read', db: 'shop' }, 'shop', 'read', 'read'],
  ])('gives %j beside a user or a role of %s the label and the argument shown', (role, beside, label, argument) => {
    expect(roleLabel(role, beside)).toBe(label);
    expect(roleArgument(role, beside)).toEqual(argument);
  });

  it('writes the whole name as role@database', () => {
    expect(roleName({ role: 'read', db: 'reporting' })).toBe('read@reporting');
  });

  it('knows root, backup and readAnyDatabase exist only in admin, and dbOwner and userAdmin do not', () => {
    expect(['root', 'backup', 'readAnyDatabase'].map(existsOnlyInAdmin)).toEqual([true, true, true]);
    expect(['dbOwner', 'userAdmin', 'read', 'reader'].map(existsOnlyInAdmin)).toEqual([false, false, false, false]);
    expect(databaseForRole('clusterMonitor', 'shop')).toBe('admin');
    expect(databaseForRole('read', 'shop')).toBe('shop');
  });

  it('suggests the built-in roles in order, then reader once after root', () => {
    const suggested = suggestedRoles([
      { role: 'reader', isBuiltin: false },
      { role: 'reader', isBuiltin: false },
      { role: 'read', isBuiltin: true },
    ]);
    expect(suggested).toEqual([...builtInRoleNames, 'reader']);
    expect(suggested.indexOf('reader')).toBe(suggested.indexOf('root') + 1);
  });
});

function privilege(resource: string, actions: readonly string[]): Privilege {
  return { resource, actions, document: null };
}

describe('user.privilege-summary', () => {
  it.each([
    [{ db: 'shop', collection: 'orders' }, 'shop.orders'],
    [{ db: 'shop', collection: '' }, 'shop.*'],
    [{ db: '', collection: 'users' }, '*.users'],
    [{ db: '', collection: '' }, '*.*'],
    [{ cluster: true }, 'cluster'],
    [{ anyResource: true }, 'any resource'],
    [{ system_buckets: 'metrics' }, '{"system_buckets":"metrics"}'],
  ])('writes the resource %j as %s', (resource, shown) => {
    expect(resourceText(resource)).toBe(shown);
  });

  it('gives the summaries of the examples', () => {
    const orders = privilege('shop.orders', ['find', 'insert']);
    const seven = privilege('shop.*', [
      'find',
      'insert',
      'update',
      'remove',
      'createIndex',
      'dropIndex',
      'listIndexes',
    ]);
    const four = privilege('shop.*', ['find', 'insert', 'update', 'remove']);
    expect(privilegeSummary({ privileges: [orders], roles: [] })).toBe('shop.orders: find, insert');
    expect(privilegeSummary({ privileges: [orders, seven], roles: [] })).toBe(
      'shop.orders: find, insert · shop.*: find, insert, update, remove +3',
    );
    expect(privilegeSummary({ privileges: [four], roles: [] })).toBe('shop.*: find, insert, update, remove');
    expect(privilegeSummary({ privileges: [], roles: [{ role: 'read', db: 'shop' }] })).toBe('(inherited only)');
    expect(privilegeSummary({ privileges: [], roles: [] })).toBe('(none)');
  });
});

/** A generator that gives these bytes over and over, and counts how many it gave. */
function repeating(pattern: readonly number[]): {
  readonly source: (count: number) => Uint8Array;
  given: () => number;
} {
  let given = 0;
  return {
    source: (count) => {
      const bytes = Uint8Array.from({ length: count }, (_, index) => pattern[(given + index) % pattern.length] ?? 0);
      given += count;
      return bytes;
    },
    given: () => given,
  };
}

describe('user.generate-password', () => {
  it.each([
    [0, 'A'],
    [56, '9'],
    [57, 'A'],
    [24, 'a'],
    [227, '9'],
    [228, undefined],
    [255, undefined],
  ])('gives for the byte %i the character %s', (byte, character) => {
    expect(characterOfByte(byte)).toBe(character);
  });

  it('gives 24 A from bytes of 0, and the same from 228, 0 repeated', () => {
    expect(generatePassword(repeating([0]).source)).toBe('AAAAAAAAAAAAAAAAAAAAAAAA');
    expect(generatePassword(repeating([228, 0]).source)).toBe('AAAAAAAAAAAAAAAAAAAAAAAA');
  });

  it('makes passwords of 24 characters of the alphabet, two in a row differing', () => {
    const first = generatePassword((count) => new Uint8Array(randomBytes(count)));
    const second = generatePassword((count) => new Uint8Array(randomBytes(count)));
    expect(first).toHaveLength(24);
    expect(first.split('').every((character) => passwordAlphabet.includes(character))).toBe(true);
    expect(passwordAlphabet).toHaveLength(57);
    expect(second).not.toBe(first);
  });

  it('fails when the generator gives no bytes rather than looping', () => {
    expect(() => generatePassword(() => new Uint8Array())).toThrow();
  });

  it('shows the generated password, its button saying Hide', () => {
    expect(generatedField).toEqual({ visible: true, toggle: 'Hide' });
    expect(passwordField(false).toggle).toBe('Show');
  });
});
