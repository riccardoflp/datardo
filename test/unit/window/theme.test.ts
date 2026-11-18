import { describe, expect, it } from 'vitest';
import { plan, themeChoice, themeInUse } from '../../../src/features/window/theme';
import { contextFor, planOf, startedWith, stateWith, stepTexts } from './context';

describe('window.theme', () => {
  it('with no setting, follows the system: dark on a dark system, light on a light one', () => {
    const choice = themeChoice(stateWith().settings);
    expect(choice).toBe('system');
    expect(themeInUse(choice, true)).toBe('dark');
    expect(themeInUse(choice, false)).toBe('light');
  });

  it('Theme: light writes datardo.window.theme as light', () => {
    const result = planOf(plan(contextFor('window.theme'), startedWith('light')));
    expect(result.steps.map((step) => step.text)).toEqual(['set the theme to Light']);
    expect(result.steps[0]).toMatchObject({
      action: 'settings.write',
      args: { name: 'datardo.window.theme', value: 'light' },
    });
    expect(result.danger).toEqual({ kind: 'none' });
  });

  it('names the steps after the choices', () => {
    expect(stepTexts(plan(contextFor('window.theme'), startedWith('system')))).toEqual([
      'set the theme to Follow the system',
    ]);
    expect(stepTexts(plan(contextFor('window.theme'), startedWith('dark')))).toEqual(['set the theme to Dark']);
  });

  it('with dark, a light system changes nothing', () => {
    expect(themeInUse('dark', false)).toBe('dark');
  });

  it('reads a value that is none of the three (blue) as system', () => {
    expect(themeChoice(stateWith({ settings: { 'datardo.window.theme': 'blue' } }).settings)).toBe('system');
  });
});
