import { describe, expect, it } from 'vitest';
import { isSizeOffered, plan, toggledSize } from '../../../src/features/window/size';
import { contextFor, planOf, startedWith, stateWith, stepTexts } from './context';

describe('window.size', () => {
  it('plans one app step for each variant', () => {
    expect(stepTexts(plan(contextFor('window.size'), startedWith('minimize')))).toEqual(['minimize the window']);
    expect(stepTexts(plan(contextFor('window.size'), startedWith('maximize')))).toEqual(['maximize the window']);
    expect(stepTexts(plan(contextFor('window.size'), startedWith('restore')))).toEqual(['restore the window']);
  });

  it('runs at once and records nothing', () => {
    const result = planOf(plan(contextFor('window.size'), startedWith('minimize')));
    expect(result.danger).toEqual({ kind: 'none' });
    expect(result.steps[0]).toMatchObject({ kind: 'app', action: 'window.minimize' });
  });

  it('while the window is maximized, Go to lists Restore window and not Maximize window', () => {
    const maximized = stateWith({ window: { maximized: true } }).window;
    expect(isSizeOffered(maximized, 'restore')).toBe(true);
    expect(isSizeOffered(maximized, 'maximize')).toBe(false);
    expect(isSizeOffered(maximized, 'minimize')).toBe(true);
  });

  it('does not offer Maximize window in full screen', () => {
    expect(isSizeOffered(stateWith({ window: { fullScreen: true } }).window, 'maximize')).toBe(false);
  });

  it('a double click on the top bar maximizes, and restores a maximized window', () => {
    expect(toggledSize(stateWith().window)).toBe('maximize');
    expect(toggledSize(stateWith({ window: { maximized: true } }).window)).toBe('restore');
  });
});
