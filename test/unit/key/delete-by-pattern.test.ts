import { describe, expect, it } from 'vitest';
import {
  afterCountPage,
  countingText,
  countResult,
  countStart,
  plan,
} from '../../../src/features/key/delete-by-pattern';
import { matches } from '../../../src/features/key/pattern';
import { scanCommand } from '../../../src/features/key/scan';
import { hexOf } from '../../../src/features/key/types';
import { cache, cacheReadOnly, connected, keyContext, name, onDatabase, planOf, undoNames, wordsOf } from './context';

const context = keyContext('key.delete-by-pattern', onDatabase());
const sessions = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => hexOf(name(`session:${String(index)}`)));
const asked = { pattern: 'session:*', type: 'all' };

describe('key.delete-by-pattern', () => {
  it('starts the form with the pattern the tab sent, *orders*', () => {
    expect(plan(context, { args: { pattern: '*orders*' } })).toMatchObject({
      kind: 'ask',
      question: {
        title: 'Delete by pattern in db0',
        fields: [{ key: 'pattern', default: '*orders*' }, { key: 'type' }],
      },
    });
    expect(plan(context, { args: { namespace: 'orders:' } })).toMatchObject({
      question: { fields: [{ default: 'orders:*' }, { default: 'all' }] },
    });
  });

  it('counts what is typed as it is: orders matches at most the key named orders', () => {
    expect(plan(context, { pattern: 'orders', type: 'all' })).toEqual({
      kind: 'read',
      need: {
        key: 'count',
        read: 'key.delete-by-pattern:count',
        args: { connection: cache.id, database: 0, pattern: 'orders', type: 'all', keepAtMost: 10_000 },
      },
    });
    expect(scanCommand({ database: 0, pattern: 'orders', type: 'all', cursor: '0' }).join(' ')).toBe(
      'SCAN 0 MATCH orders COUNT 500',
    );
    expect(matches('orders', 'orders')).toBe(true);
    expect(matches('orders', 'orders:1')).toBe(false);
  });

  it('confirms 1,832 keys of 1,204,331, with the undo, the pattern to type and the button Delete 1,832 keys', () => {
    const count = { found: 1832, total: 1_204_331, names: sessions(1832) };
    const deleted = planOf(plan(context, { ...asked, count }));
    expect(deleted.danger).toEqual({
      kind: 'destructive',
      text: [
        'Delete every key matching `session:*` in db0 of Cache local?',
        '1,832 keys match now, of 1,204,331 in db0.',
        'It can be undone from the Undo history.',
      ].join('\n'),
      button: 'Delete 1,832 keys',
      name: 'session:*',
    });
    expect(deleted.title).toBe('Delete keys matching session:*');
  });

  it('sends four UNLINK of 500, 500, 500 and 332 names, and no KEYS, DEL or FLUSHDB', () => {
    const count = { found: 1832, total: 1_204_331, names: sessions(1832) };
    const steps = planOf(plan(context, { ...asked, count })).steps;
    expect(steps.map((step) => wordsOf(step).length - 1)).toEqual([500, 500, 500, 332]);
    expect(steps.map((step) => wordsOf(step)[0])).toEqual(['UNLINK', 'UNLINK', 'UNLINK', 'UNLINK']);
  });

  it('cannot be undone with 25,000 keys, and scans again from SCAN 0 MATCH session:* COUNT 500 with UNLINK after each reply', () => {
    let progress = countStart;
    for (let page = 0; page < 50; page += 1) {
      const keys = sessions(500).map(() => name(`s${String(page)}`));
      progress = afterCountPage(progress, { cursor: page === 49 ? '0' : String(page + 1), keys }, 10_000);
    }
    expect(progress).toMatchObject({ found: 25_000, complete: true });
    expect(progress.names).toBeUndefined();
    const count = countResult(progress, 1_204_331);
    const deleted = planOf(plan(context, { ...asked, count }));
    expect(deleted.danger.kind === 'destructive' ? deleted.danger.text.split('\n') : []).toEqual([
      'Delete every key matching `session:*` in db0 of Cache local?',
      '25,000 keys match now, of 1,204,331 in db0.',
      'Keys that match when the delete runs are deleted too.',
      "This can't be undone: the undo history keeps operations of up to 10,000 keys.",
    ]);
    expect(deleted.undo).toEqual({
      cannot: "This can't be undone: the undo history keeps operations of up to 10,000 keys.",
    });
    expect(deleted.steps).toEqual([
      {
        kind: 'app',
        action: 'key.unlink-scanned',
        args: { connection: cache.id, database: 0, pattern: 'session:*', type: 'all' },
        text: 'SCAN 0 MATCH session:* COUNT 500, repeated with the cursor of each reply until it is 0, and after each reply UNLINK with the keys of that reply',
      },
    ]);
  });

  it('deletes only the names counted when recorded, so a key created after the count stays', () => {
    const count = { found: 2, total: 10, names: [hexOf(name('session:1')), hexOf(name('session:2'))] };
    expect(planOf(plan(context, { ...asked, count })).steps.map((step) => step.text)).toEqual([
      'UNLINK session:1 session:2',
    ]);
  });

  it('counts with TYPE hash when Hash is chosen, so a string session:1 is not deleted', () => {
    expect(plan(context, { pattern: 'session:*', type: 'hash' })).toMatchObject({ need: { args: { type: 'hash' } } });
    expect(scanCommand({ database: 0, pattern: 'session:*', type: 'hash', cursor: '0' }).join(' ')).toBe(
      'SCAN 0 MATCH session:* TYPE hash COUNT 500',
    );
  });

  it('keeps the 1,832 keys for the undo', () => {
    const count = { found: 1832, total: 1_204_331, names: sessions(1832) };
    expect(planOf(plan(context, { ...asked, count })).undo).toEqual({
      keeps: { kind: 'keys', database: 0, keys: undoNames(sessions(1832)) },
    });
  });

  it('says No keys match session:* when nothing matches; a cancelled count gives no count and deletes nothing', () => {
    expect(plan(context, { ...asked, count: { found: 0, total: 10 } })).toEqual({
      kind: 'refuse',
      code: 'key.delete-by-pattern/nothing',
      message: 'No keys match `session:*`: nothing to delete.',
    });
    expect(plan(context, { ...asked, count: null }).kind).toBe('read');
  });

  it('asks every key of db0 of Cache local with the pattern * and no type', () => {
    const count = { found: 2, total: 2, names: [hexOf(name('a')), hexOf(name('b'))] };
    const deleted = planOf(plan(context, { pattern: '*', type: 'all', count }));
    expect(deleted.danger).toMatchObject({
      text: expect.stringMatching(/^Delete every key of db0 of Cache local\?\n/u) as string,
    });
  });

  it('refuses an empty pattern, and on a read-only connection', () => {
    expect(plan(context, { pattern: '', type: 'all' })).toMatchObject({
      code: 'key.delete-by-pattern/invalid',
      message: 'Enter a pattern, for example session:*.',
    });
    const readOnly = keyContext('key.delete-by-pattern', onDatabase(0, cacheReadOnly), connected(cacheReadOnly));
    expect(plan(readOnly, {})).toMatchObject({ code: 'key.delete-by-pattern/read-only' });
  });

  it('says how the count goes on the status line', () => {
    const progress = { cursor: '9', calls: 2, found: 1200, complete: false };
    expect(countingText('session:*', progress, 2500)).toBe(
      'Counting the keys matching `session:*`: 1,200 found, about 40% scanned',
    );
  });
});
