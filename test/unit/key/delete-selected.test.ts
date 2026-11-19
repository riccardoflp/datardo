import { describe, expect, it } from 'vitest';
import { afterReplies, plan } from '../../../src/features/key/delete-selected';
import { view } from '../../../src/features/key/select';
import { hexOf } from '../../../src/features/key/types';
import { cacheReadOnly, connected, keyContext, name, onDatabase, planOf, wordsOf } from './context';

const context = keyContext('key.delete-selected', onDatabase());
const names = (count: number): Uint8Array[] => Array.from({ length: count }, (_, index) => name(`k${String(index)}`));
const selected = (count: number) => ({ args: { keys: names(count).map(hexOf) } });

describe('key.delete-selected', () => {
  it('asks Delete 3 keys from db0? and sends one UNLINK with the three names', () => {
    const deleted = planOf(plan(context, selected(3)));
    expect(deleted.danger).toEqual({
      kind: 'confirm',
      text: 'Delete 3 keys from db0?\nThe 3 keys selected in the table. It can be undone from the Undo history.',
      button: 'Delete',
    });
    expect(deleted.steps.map((step) => step.text)).toEqual(['UNLINK k0 k1 k2']);
  });

  it('sends three UNLINK of 500, 500 and 200 names for 1,200 keys', () => {
    const deleted = planOf(plan(context, selected(1200)));
    expect(deleted.steps.map((step) => wordsOf(step).length - 1)).toEqual([500, 500, 200]);
    expect(deleted.steps.every((step) => wordsOf(step)[0] === 'UNLINK')).toBe(true);
  });

  it('says Deleted 2 of 3 keys from db0 when one was gone already', () => {
    expect(afterReplies([2], 3, 0)).toEqual({
      kind: 'notify',
      level: 'info',
      text: 'Deleted 2 of 3 keys from db0: the others were already gone.',
    });
    expect(afterReplies([500, 500, 200], 1200, 0)).toEqual({ kind: 'done' });
  });

  it('cannot be undone with 10,001 keys, and asks for 10001 to be typed', () => {
    const deleted = planOf(plan(context, selected(10_001)));
    expect(deleted.danger).toEqual({
      kind: 'destructive',
      text: "Delete 10,001 keys from db0?\nThe 10,001 keys selected in the table. This can't be undone: the undo history keeps operations of up to 10,000 keys.",
      button: 'Delete',
      name: '10001',
    });
    expect(deleted.undo).toEqual({
      cannot: "This can't be undone: the undo history keeps operations of up to 10,000 keys.",
    });
  });

  it('keeps the 3 keys for the undo', () => {
    expect(planOf(plan(context, selected(3))).undo).toEqual({
      keeps: { engine: 'redis', database: 0, keys: names(3).map(hexOf) },
    });
  });

  it('has no Delete… in the selection bar of a read-only connection, and refuses there', () => {
    const selection = { keys: new Set(names(3).map(hexOf)) };
    const bar = view({ selection, rows: names(3), readOnly: true }).bar;
    expect(bar?.entries.map((entry) => entry.feature)).not.toContain('key.delete-selected');
    const readOnly = keyContext('key.delete-selected', onDatabase(0, cacheReadOnly), connected(cacheReadOnly));
    expect(plan(readOnly, selected(3))).toMatchObject({ code: 'key.delete-selected/read-only' });
  });
});
