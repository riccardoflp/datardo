import { describe, expect, it } from 'vitest';
import { matches, pattern } from '../../../src/features/key/pattern';

describe('key.pattern', () => {
  it.each([
    ['', '*', false],
    ['orders', '*orders*', true],
    ['orders:', '*orders:*', true],
    ['orders:*', 'orders:*', false],
    ['user:?', 'user:?', false],
    ['user:[0-9]*', 'user:[0-9]*', false],
    ['50%', '*50%*', true],
    ['what\\?', 'what\\?', false],
    ['a b', '*a b*', true],
    ['Orders', '*Orders*', true],
  ])('gives the typed text %j the pattern %j', (typed, expected, plain) => {
    expect(pattern({ kind: 'typed', text: typed })).toEqual({ pattern: expected, plain });
  });

  it('gives the namespaces orders: and a[1]: the patterns orders:* and a\\[1\\]:*', () => {
    expect(pattern({ kind: 'namespace', namespace: 'orders:' })).toEqual({ pattern: 'orders:*', plain: false });
    expect(pattern({ kind: 'namespace', namespace: 'a[1]:' })).toEqual({ pattern: 'a\\[1\\]:*', plain: false });
  });

  it('makes from a namespace a pattern that matches every key starting with it and no other', () => {
    for (const namespace of ['orders:', 'a[1]:', 'what?:', 'x*y\\:']) {
      const made = pattern({ kind: 'namespace', namespace }).pattern;
      expect(matches(made, `${namespace}42`)).toBe(true);
      expect(matches(made, namespace)).toBe(true);
      expect(matches(made, `z${namespace}42`)).toBe(false);
      expect(matches(made, namespace.slice(0, -1))).toBe(false);
    }
    expect(matches('*Orders*', 'orders:1')).toBe(false);
    expect(matches('what\\?', 'what?')).toBe(true);
    expect(matches('what\\?', 'whatx')).toBe(false);
  });

  it('keeps a leading space in the pattern', () => {
    expect(pattern({ kind: 'typed', text: ' orders' })).toEqual({ pattern: '* orders*', plain: true });
  });
});
