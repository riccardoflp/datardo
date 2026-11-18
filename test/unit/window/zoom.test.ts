import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/window/zoom';
import { isWindowCommandOffered } from '../../../src/features/window/app-menu';
import { contextFor, planOf, startedWith, stateWith, stepTexts } from './context';

function zoomFrom(value: number | undefined, variant: string): readonly string[] {
  const settings = value === undefined ? {} : { 'datardo.window.zoom': value };
  return stepTexts(plan(contextFor('window.zoom', { settings }), startedWith(variant)));
}

/** Presses the same variant again and again from a value, as the setting follows each step. */
function presses(from: number, variant: string, times: number): number[] {
  const seen: number[] = [];
  let value = from;
  for (let press = 0; press < times; press += 1) {
    const context = contextFor('window.zoom', { settings: { 'datardo.window.zoom': value } });
    const step = planOf(plan(context, startedWith(variant))).steps[0];
    if (step?.kind === 'app') {
      value = (step.args as { value: number }).value;
    }
    seen.push(value);
  }
  return seen;
}

describe('window.zoom', () => {
  it('from 100%, Ctrl+= gives 110%, again 125%, again 150%; Ctrl+0 gives 100%', () => {
    expect(presses(100, 'in', 3)).toEqual([110, 125, 150]);
    expect(zoomFrom(150, 'reset')).toEqual(['set the zoom to 100%']);
  });

  it('from 100%, Ctrl+- gives 90%, 80%, 75%, 67%, 50%; a sixth press changes nothing', () => {
    expect(presses(100, 'out', 6)).toEqual([90, 80, 75, 67, 50, 50]);
    expect(zoomFrom(50, 'out')).toEqual([]);
  });

  it('with datardo.window.zoom set to 120, Zoom in gives 125% and Zoom out gives 110%', () => {
    expect(zoomFrom(120, 'in')).toEqual(['set the zoom to 125%']);
    expect(zoomFrom(120, 'out')).toEqual(['set the zoom to 110%']);
  });

  it('writes the setting datardo.window.zoom, with no danger and nothing recorded', () => {
    const result = planOf(plan(contextFor('window.zoom'), startedWith('in')));
    expect(result.steps[0]).toMatchObject({
      kind: 'app',
      action: 'settings.write',
      args: { name: 'datardo.window.zoom', value: 110 },
    });
    expect(result.danger).toEqual({ kind: 'none' });
    expect('cannot' in result.undo).toBe(true);
  });

  it('at 200%, Go to does not offer Zoom in', () => {
    const state = stateWith({ settings: { 'datardo.window.zoom': 200 } });
    expect(isWindowCommandOffered(state, 'window.zoom:in')).toBe(false);
    expect(isWindowCommandOffered(state, 'window.zoom:out')).toBe(true);
  });

  it('offers Reset zoom at any value but 100%, and Zoom out over 50% only', () => {
    expect(isWindowCommandOffered(stateWith(), 'window.zoom:reset')).toBe(false);
    const atFifty = stateWith({ settings: { 'datardo.window.zoom': 50 } });
    expect(isWindowCommandOffered(atFifty, 'window.zoom:out')).toBe(false);
  });

  it('reads a value outside 50 to 200 at the nearest limit', () => {
    expect(zoomFrom(500, 'in')).toEqual([]);
    expect(zoomFrom(500, 'out')).toEqual(['set the zoom to 175%']);
  });
});
