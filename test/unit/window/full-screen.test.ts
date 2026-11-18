import { describe, expect, it } from 'vitest';
import { fullScreenTitle, plan } from '../../../src/features/window/full-screen';
import { contextFor, startedWith, stateWith, stepTexts } from './context';

describe('window.full-screen', () => {
  it('enters full screen, or exits it while in it', () => {
    expect(stepTexts(plan(contextFor('window.full-screen'), startedWith(null)))).toEqual(['enter full screen']);
    const inIt = contextFor('window.full-screen', { window: { fullScreen: true } });
    expect(stepTexts(plan(inIt, startedWith(null)))).toEqual(['exit full screen']);
  });

  it('is listed as Enter full screen, or Exit full screen while in it', () => {
    expect(fullScreenTitle(stateWith().window)).toBe('Enter full screen');
    expect(fullScreenTitle(stateWith({ window: { fullScreen: true } }).window)).toBe('Exit full screen');
  });
});
