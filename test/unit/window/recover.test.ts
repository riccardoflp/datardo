import { describe, expect, it } from 'vitest';
import { timesInLastMinute, view } from '../../../src/features/window/recover';

describe('window.recover', () => {
  it('says The window stopped working. with Reload and Quit, and logs the reason', () => {
    const shown = view({ kind: 'gone', reason: 'crashed', timesInMinute: 1 });
    expect(shown.message).toBe('The window stopped working.');
    expect(shown.detail).toBe(
      'Your connections are still open and the work in progress goes on. Reload brings the tabs back; text typed in ' +
        'the last second may be lost.',
    );
    expect(shown.buttons.map((button) => button.title)).toEqual(['Reload', 'Quit']);
    expect(shown.logLine).toBe('the window process is gone: crashed');
  });

  it('the third time in a minute offers Reload without the tabs and Quit', () => {
    const shown = view({ kind: 'gone', reason: 'killed', timesInMinute: 3 });
    expect(shown.message).toBe('The window stopped working 3 times in a minute.');
    expect(shown.buttons.map((button) => [button.title, button.does])).toEqual([
      ['Reload without the tabs', 'reload-without-tabs'],
      ['Quit', 'quit'],
    ]);
  });

  it('counts three kills in 30 seconds as three times in a minute', () => {
    expect(timesInLastMinute([1_000, 11_000, 31_000], 31_000)).toBe(3);
    expect(timesInLastMinute([1_000, 11_000, 71_000], 71_000)).toBe(1);
  });

  it('says The window is not answering. with Wait and Reload', () => {
    const shown = view({ kind: 'not-answering' });
    expect(shown.message).toBe('The window is not answering.');
    expect(shown.buttons.map((button) => button.title)).toEqual(['Wait', 'Reload']);
    expect(shown.logLine).toBe('the window process does not answer');
  });
});
