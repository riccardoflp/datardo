import { describe, expect, it } from 'vitest';
import { namespacesOf, type Namespace } from '../../../src/features/tree/namespaces';
import { bytes } from './context';

/** The namespaces as `prefix name count pattern`, with those under each one indented. */
function shape(namespaces: readonly Namespace[], depth = 0): readonly string[] {
  return namespaces.flatMap((each) => [
    `${' '.repeat(depth * 2)}${each.prefixText} ${each.name} ${each.countText} ${each.pattern}`,
    ...shape(each.namespaces, depth + 1),
  ]);
}

function tree(names: readonly string[], separator = ':', complete = true): readonly string[] {
  return shape(namespacesOf(bytes(...names), separator, complete).namespaces);
}

describe('tree.namespaces', () => {
  it('orders:1, orders:2, users:1, counter give one namespace orders: of 2 keys; 4 keys seen', () => {
    const found = namespacesOf(bytes('orders:1', 'orders:2', 'users:1', 'counter'), ':', true);
    expect(shape(found.namespaces)).toEqual(['orders: orders 2 orders:*']);
    expect(found.keysSeen).toBe(4);
  });

  it('app:cache:a, app:cache:b, app:session:x give app: with app:cache: under it', () => {
    expect(tree(['app:cache:a', 'app:cache:b', 'app:session:x'])).toEqual([
      'app: app 3 app:*',
      '  app:cache: cache 2 app:cache:*',
    ]);
  });

  it('a::b, a::c give a: with a:: named (empty) under it', () => {
    expect(tree(['a::b', 'a::c'])).toEqual(['a: a 2 a:*', '  a:: (empty) 2 a::*']);
  });

  it(':x, :y give the namespace : named (empty)', () => {
    expect(tree([':x', ':y'])).toEqual([': (empty) 2 :*']);
  });

  it('the key named orders: starts with the prefix orders: too', () => {
    expect(tree(['orders:', 'orders:1'])).toEqual(['orders: orders 2 orders:*']);
  });

  it('Orders: and orders: are two namespaces, in the order of their bytes', () => {
    expect(tree(['Orders:1', 'Orders:2', 'orders:1', 'orders:2'])).toEqual([
      'Orders: Orders 2 Orders:*',
      'orders: orders 2 orders:*',
    ]);
  });

  it('a[1]: is named a[1], with the pattern a\\[1\\]:*', () => {
    expect(tree(['a[1]:x', 'a[1]:y'])).toEqual(['a[1]: a[1] 2 a\\[1\\]:*']);
  });

  it('the separator / gives img/ and leaves a:b under none', () => {
    expect(tree(['img/1', 'img/2', 'a:b'], '/')).toEqual(['img/ img 2 img/*']);
  });

  it('the separator :: gives a:: with a::b:: under it', () => {
    expect(tree(['a::b::1', 'a::b::2', 'a:c'], '::')).toEqual(['a:: a 2 a::*', '  a::b:: b 2 a::b::*']);
  });

  it('a scan that stopped early writes each count with +', () => {
    expect(tree(['orders:1', 'orders:2'], ':', false)).toEqual(['orders: orders 2+ orders:*']);
  });

  it('no key gives no namespace and 0 keys seen', () => {
    expect(namespacesOf([], ':', true)).toEqual({ namespaces: [], keysSeen: 0 });
  });

  it('an empty separator gives no namespace', () => {
    expect(namespacesOf(bytes('a:1', 'a:2'), '', true).namespaces).toEqual([]);
  });

  it('a prefix with one key is not a namespace, and a name with no separator has no prefix', () => {
    expect(tree(['users:1', 'counter'])).toEqual([]);
  });

  it('namespaces under the same node are sorted by name ignoring case', () => {
    expect(tree(['b:1', 'b:2', 'A:1', 'A:2', 'c:1', 'c:2']).map((line) => line.split(' ')[1])).toEqual(['A', 'b', 'c']);
  });

  it('the same names give the same tree in whatever order they were seen, each counted once', () => {
    const names = ['app:cache:a', 'app:cache:b', 'app:session:x', 'orders:1', 'orders:2'];
    const reversed = [...names].reverse();
    expect(tree(reversed)).toEqual(tree(names));
    expect(tree([...names, 'orders:1'])).toEqual(tree(names));
  });

  it('a name that is not UTF-8 is cut and counted like any other, its part written byte by byte', () => {
    const names = [
      Uint8Array.from([0x69, 0x6d, 0x67, 0xff, 0x3a, 0x31]),
      Uint8Array.from([0x69, 0x6d, 0x67, 0xff, 0x3a, 0x32]),
    ];
    const [only] = namespacesOf(names, ':', true).namespaces;
    expect(only?.name).toBe('img\\xff');
    expect(only?.count).toBe(2);
    expect(only?.prefixHex).toBe('696d67ff3a');
  });

  it('counts from 10,000 are written in short', () => {
    const names = Array.from({ length: 12_345 }, (_, index) => `bulk:${String(index)}`);
    expect(namespacesOf(bytes(...names), ':', true).namespaces[0]?.countText).toBe('12.3K');
  });
});
