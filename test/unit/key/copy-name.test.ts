import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/key/copy-name';
import { hexOf } from '../../../src/features/key/types';
import { cacheReadOnly, connected, keyContext, name, onDatabase, onKey, planOf } from './context';

const copied = (outcome: ReturnType<typeof plan>): unknown => planOf(outcome).after;

describe('key.copy-name', () => {
  it('puts orders:42 on the clipboard', () => {
    expect(copied(plan(keyContext('key.copy-name', onKey('orders:42')), {}))).toEqual([
      { kind: 'copy', text: 'orders:42' },
    ]);
  });

  it('copies my key without quotes', () => {
    expect(copied(plan(keyContext('key.copy-name', onKey('my key')), {}))).toEqual([{ kind: 'copy', text: 'my key' }]);
  });

  it('copies the bytes 75 73 65 72 3a ff as "user:\\xff"', () => {
    const bytes = Uint8Array.of(0x75, 0x73, 0x65, 0x72, 0x3a, 0xff);
    expect(copied(plan(keyContext('key.copy-name', onKey(bytes)), {}))).toEqual([
      { kind: 'copy', text: '"user:\\xff"' },
    ]);
  });

  it('copies three selected names as three lines, in the order of the table', () => {
    const keys = ['c', 'a', 'b'].map((each) => hexOf(name(each)));
    expect(copied(plan(keyContext('key.copy-name', onDatabase()), { args: { keys } }))).toEqual([
      { kind: 'copy', text: 'c\na\nb' },
    ]);
  });

  it('works on a read-only connection, and writes nothing', () => {
    const readOnly = keyContext('key.copy-name', onKey('orders:42', cacheReadOnly), connected(cacheReadOnly));
    const copiedPlan = planOf(plan(readOnly, {}));
    expect(copiedPlan.steps).toEqual([]);
    expect(copiedPlan.after).toEqual([{ kind: 'copy', text: 'orders:42' }]);
  });
});
