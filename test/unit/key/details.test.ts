import { describe, expect, it } from 'vitest';
import {
  detailsArgs,
  expiresAtOf,
  noSizeTooltip,
  parse,
  request,
  settleMs,
  sizeCellText,
  unreadOnScreen,
} from '../../../src/features/key/details';
import { expiryCellText } from '../../../src/features/key/format-expiry';
import { selectionAfter } from '../../../src/features/key/select';
import { hexOf } from '../../../src/features/key/types';
import type { ReadRequest } from '../../../src/shared/feature';
import { cache, keyContext, name, onDatabase, recordedReplies, requestWords } from './context';

const context = keyContext('key.details', onDatabase());
const sent = (read: ReadRequest): string[] =>
  (read as Extract<ReadRequest, { kind: 'engine' }>).requests.map(requestWords);
const recordedArgs = detailsArgs(cache.id, 15, [name('user:7'), name('orders:41'), name('nothing:here')]);

describe('key.details', () => {
  it('sends 30 PTTL and 30 MEMORY USAGE in one pipeline for 30 rows on screen', () => {
    const onScreen = Array.from({ length: 30 }, (_, index) => name(`orders:${String(index)}`));
    const words = sent(request(context, detailsArgs(cache.id, 0, onScreen)));
    expect(words).toHaveLength(60);
    expect(words.filter((each) => each.startsWith('PTTL '))).toHaveLength(30);
    expect(words.filter((each) => each.startsWith('MEMORY USAGE '))).toHaveLength(30);
    expect(words.slice(0, 2)).toEqual(['PTTL orders:0', 'MEMORY USAGE orders:0']);
  });

  it('reads the rows on screen 150 ms after the table stops scrolling', () => {
    expect(settleMs).toBe(150);
  });

  it('does not read again rows read once', () => {
    const read = new Set([hexOf(name('a')), hexOf(name('b'))]);
    expect(unreadOnScreen([name('a'), name('c'), name('b')], read)).toEqual([name('c')]);
  });

  it('shows 2 h 5 min for PTTL 7,500,000 and — for -1', () => {
    const now = 1_763_400_000_000;
    const read = parse([7_500_000, 64, -1, 88], detailsArgs(cache.id, 0, [name('a'), name('b')]));
    const [a, b] = read.keys;
    expect(expiryCellText(expiresAtOf(a?.timeLeft ?? null, now), now)).toBe('2 h 5 min');
    expect(expiryCellText(expiresAtOf(b?.timeLeft ?? null, now), now)).toBe('—');
  });

  it('marks gone a key deleted after the scan, which leaves the selection', () => {
    const read = parse(recordedReplies('details'), recordedArgs);
    expect(read).toEqual({
      keys: [
        { name: name('user:7'), gone: false, timeLeft: null, size: 88 },
        { name: name('orders:41'), gone: false, timeLeft: 7_499_955, size: 64 },
        { name: name('nothing:here'), gone: true },
      ],
      sizes: 'read',
    });
    const selected = { keys: new Set([hexOf(name('nothing:here')), hexOf(name('user:7'))]) };
    const after = selectionAfter(selected, { kind: 'gone', key: name('nothing:here') }, []);
    expect([...after.keys]).toEqual([hexOf(name('user:7'))]);
  });

  it('shows 1.2 KB for a key of 1,228 bytes', () => {
    expect(sizeCellText(1228)).toBe('1.2 KB');
    expect(sizeCellText(512)).toBe('512 B');
  });

  it('shows — for every size on a server that refuses MEMORY USAGE, and sends it no more', () => {
    const [refused] = recordedReplies('unknown-command');
    const read = parse([7_500_000, refused, -1, refused], detailsArgs(cache.id, 0, [name('a'), name('b')]));
    expect(read.sizes).toBe('refused');
    expect(read.keys.map((key) => sizeCellText(key.size))).toEqual(['—', '—']);
    expect(noSizeTooltip).toBe('This server does not report the size of a key.');
    const next = detailsArgs(cache.id, 0, [name('c')], 'skip');
    expect(sent(request(context, next))).toEqual(['PTTL c']);
    expect(parse([-1], next)).toEqual({ keys: [{ name: name('c'), gone: false, timeLeft: null }], sizes: 'skipped' });
  });
});
