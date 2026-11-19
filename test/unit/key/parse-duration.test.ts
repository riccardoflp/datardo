import { describe, expect, it } from 'vitest';
import { seconds } from '../../../src/features/key/parse-duration';

const error = { kind: 'error', message: 'Enter a duration, for example 90, 15m, 2h or 7d.' };

describe('key.parse-duration', () => {
  it.each([
    ['90', 90],
    ['90s', 90],
    ['15m', 900],
    ['15 min', 900],
    ['2h', 7200],
    ['1h 30m', 5400],
    ['7d', 604_800],
    ['1w2d', 777_600],
    [' 2h ', 7200],
  ])('reads %j as %i seconds', (typed, expected) => {
    expect(seconds(typed)).toEqual({ kind: 'seconds', seconds: expected });
  });

  it.each(['0', '-5', '1.5h', 'h', 'soon', '', '0s'])('refuses %j', (typed) => {
    expect(seconds(typed)).toEqual(error);
  });

  it('reads 2H as 7,200', () => {
    expect(seconds('2H')).toEqual({ kind: 'seconds', seconds: 7200 });
  });
});
