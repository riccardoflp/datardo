import { describe, expect, it } from 'vitest';
import type { Json } from '../../../src/shared/engine-request';
import { changeEvents } from '../../../src/features/oplog/changes';
import type { OplogEvent } from '../../../src/features/oplog/types';

const one = { $numberInt: '1' };
const two = { $numberInt: '2' };
const three = { $numberInt: '3' };
const four = { $numberInt: '4' };

describe('oplog.changes', () => {
  it.each<[string, readonly Json[], readonly Json[], readonly OplogEvent[]]>([
    [
      'an update, an insert and a removal',
      [
        { _id: one, a: one },
        { _id: two, a: one },
      ],
      [{ _id: one, a: two, b: one }, { _id: three }],
      [
        { e: 'u', id: one, fields: ['a', 'b'] },
        { e: 'i', id: three },
        { e: 'r', id: two },
      ],
    ],
    ['nothing changed', [{ _id: one, a: one }], [{ _id: one, a: one }], []],
    [
      'an Int32 that became a Double',
      [{ _id: one, n: { $numberInt: '1' } }],
      [{ _id: one, n: { $numberDouble: '1.0' } }],
      [{ e: 'u', id: one, fields: ['n'] }],
    ],
    ['the same document twice after', [], [{ _id: four }, { _id: four }], [{ e: 'i', id: four }]],
  ])('%s', (_name, before, after, events) => {
    expect(changeEvents(before, after)).toEqual(events);
  });
});
