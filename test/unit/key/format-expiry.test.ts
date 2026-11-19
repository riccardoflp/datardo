import { describe, expect, it } from 'vitest';
import { expiryCellText, expiryText, joinedExpiryText } from '../../../src/features/key/format-expiry';

const now = new Date(2026, 10, 18, 12, 0, 0, 0).getTime();

describe('key.format-expiry', () => {
  it('writes a key without expiry as Persistent, and — in the table', () => {
    expect(expiryText(undefined, now).left).toBe('Persistent');
    expect(expiryCellText(undefined, now)).toBe('—');
  });

  it.each([
    [0, 'expired', '2026-11-18 12:00:00'],
    [999, '< 1 s', '2026-11-18 12:00:00'],
    [42_900, '42 s', '2026-11-18 12:00:42'],
    [312_000, '5 min 12 s', '2026-11-18 12:05:12'],
    [300_000, '5 min', '2026-11-18 12:05:00'],
    [7_509_000, '2 h 5 min', '2026-11-18 14:05:09'],
    [7_200_000, '2 h', '2026-11-18 14:00:00'],
    [273_600_000, '3 d 4 h', '2026-11-21 16:00:00'],
  ])('gives %i ms left the texts %j and %j', (left, leftText, date) => {
    expect(expiryText(now + left, now)).toEqual({ left: leftText, date });
  });

  it('joins them for the inspector island', () => {
    expect(joinedExpiryText(now + 7_509_000, now)).toBe('in 2 h 5 min · 2026-11-18 14:05:09');
  });

  it('gives 3,599,999 ms 59 min 59 s, not 1 h', () => {
    expect(expiryText(now + 3_599_999, now).left).toBe('59 min 59 s');
  });
});
