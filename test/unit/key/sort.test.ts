import { describe, expect, it } from 'vitest';
import type { SortableRow } from '../../../src/features/key/sort';
import { detailsToRead, headerSorts, sortAfterClick, sortNotice, sortedKeys } from '../../../src/features/key/sort';
import { name } from './context';

const now = 1_763_400_000_000;
const b: SortableRow = { name: name('b'), type: 'string', size: 2048, expiresAt: null };
const a: SortableRow = { name: name('a'), type: 'hash', size: 1024, expiresAt: now + 300_000 };
const C: SortableRow = { name: name('C'), type: 'hash', size: 3072, expiresAt: now + 60_000 };
const arrived = [b, a, C];
const names = (rows: readonly SortableRow[]): string[] => rows.map((row) => new TextDecoder().decode(row.name));

describe('key.sort', () => {
  it.each([
    [undefined, 'ascending', ['b', 'a', 'C']],
    ['key', 'ascending', ['C', 'a', 'b']],
    ['type', 'ascending', ['C', 'a', 'b']],
    ['expiry', 'ascending', ['C', 'a', 'b']],
    ['expiry', 'descending', ['b', 'a', 'C']],
    ['size', 'descending', ['C', 'b', 'a']],
  ] as const)('sorts by %s, %s, as %j', (column, direction, expected) => {
    expect(names(sortedKeys(arrived, column, direction))).toEqual(expected);
  });

  it('puts the rows back in the order they arrived on the third click on the Key header', () => {
    const first = sortAfterClick(undefined, 'key');
    const second = sortAfterClick(first, 'key');
    const third = sortAfterClick(second, 'key');
    expect([first, second, third]).toEqual([
      { column: 'key', direction: 'ascending' },
      { column: 'key', direction: 'descending' },
      undefined,
    ]);
    expect(names(sortedKeys(arrived, third?.column, 'ascending'))).toEqual(['b', 'a', 'C']);
  });

  it('says it sorted among the 500 keys loaded of an unfinished scan', () => {
    const sort = { column: 'key', direction: 'ascending' } as const;
    expect(sortNotice(sort, 500, false)).toBe('Sorted among the 500 keys loaded: scan the rest to sort them all.');
    expect(sortNotice(sort, 500, true)).toBeUndefined();
    expect(sortNotice(undefined, 500, false)).toBeUndefined();
  });

  it('reads the size of 800 keys not read yet in pipelines of 500 commands', () => {
    const rows = Array.from({ length: 800 }, (_, index): SortableRow => ({ name: name(`k${String(index)}`) }));
    const batches = detailsToRead(rows, 'size');
    expect(batches.map((batch) => batch.length * 2)).toEqual([500, 500, 500, 100]);
    expect(detailsToRead([a, b, C], 'size')).toEqual([]);
    expect(detailsToRead(rows, 'key')).toEqual([]);
  });

  it('does not sort 10,001 keys by Size, with the tooltip of rule 7', () => {
    expect(headerSorts('size', 10_001)).toEqual({
      sorts: false,
      tooltip: 'Too many keys to sort: narrow the pattern. The largest keys are on the Server page.',
    });
    expect(headerSorts('size', 10_000)).toEqual({ sorts: true });
    expect(headerSorts('key', 10_001)).toEqual({ sorts: true });
  });

  it('puts the keys Scan more brings in their place in the order', () => {
    const more: SortableRow = { name: name('aa'), type: 'set' };
    expect(names(sortedKeys([...arrived, more], 'key', 'ascending'))).toEqual(['C', 'a', 'aa', 'b']);
  });

  it('puts rows marked gone last in either direction, and keeps equal rows in their order of arrival', () => {
    const gone: SortableRow = { name: name('0'), gone: true };
    expect(names(sortedKeys([gone, ...arrived], 'key', 'ascending'))).toEqual(['C', 'a', 'b', '0']);
    expect(names(sortedKeys([gone, ...arrived], 'key', 'descending'))).toEqual(['b', 'a', 'C', '0']);
    const twin: SortableRow = { ...a, name: name('z') };
    expect(names(sortedKeys([a, twin, b], 'type', 'ascending'))).toEqual(['a', 'z', 'b']);
  });

  it('puts keys without a size last', () => {
    const unread: SortableRow = { name: name('u'), type: 'string' };
    expect(names(sortedKeys([unread, ...arrived], 'size', 'ascending'))).toEqual(['a', 'b', 'C', 'u']);
    expect(names(sortedKeys([unread, ...arrived], 'size', 'descending'))).toEqual(['C', 'b', 'a', 'u']);
  });
});
