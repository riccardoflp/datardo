import { describe, expect, it } from 'vitest';
import { layout } from '../../../src/features/nav/layout';
import { isInspectorWanted } from '../../../src/features/nav/inspector';
import { input, ordersTab } from './inputs';

const both = (windowWidth: number): ReturnType<typeof layout> =>
  layout(windowWidth, { wanted: true, width: 280 }, { wanted: true, width: 360 });

describe('nav.layout', () => {
  it.each([
    [1280, 280, 360, 568],
    [1100, 280, 268, 480],
    [1000, 208, 240, 480],
  ])('in a window %i px wide shows the explorer %i, the inspector %i and the main island %i', (w, e, i, m) => {
    expect(both(w)).toEqual({ explorer: { shown: true, width: e }, inspector: { shown: true, width: i }, main: m });
  });

  it('at 900 px hides the inspector island and gives the explorer its 280 px back', () => {
    const result = both(900);
    expect(result.inspector.shown).toBe(false);
    expect(result.explorer).toEqual({ shown: true, width: 280 });
    expect(result.main).toBe(556);
  });

  it('at 700 px hides both', () => {
    const result = both(700);
    expect([result.explorer.shown, result.inspector.shown, result.main]).toEqual([false, false, 644]);
  });

  it('at 640 px, the minimum, shows only the rail and the main island, 584 px wide', () => {
    const result = both(640);
    expect([result.explorer.shown, result.inspector.shown, result.main]).toEqual([false, false, 584]);
  });

  it('leaves out an island that is not wanted', () => {
    const noInspector = layout(900, { wanted: true, width: 280 }, { wanted: false, width: 360 });
    expect(noInspector).toMatchObject({
      explorer: { shown: true, width: 280 },
      inspector: { shown: false },
      main: 556,
    });
    const noExplorer = layout(1000, { wanted: false, width: 280 }, { wanted: true, width: 360 });
    expect(noExplorer).toMatchObject({ explorer: { shown: false }, inspector: { shown: true, width: 360 }, main: 576 });
  });

  it('gives everything back when the window is wider again, without the user doing anything', () => {
    both(900);
    expect(both(1280)).toEqual({
      explorer: { shown: true, width: 280 },
      inspector: { shown: true, width: 360 },
      main: 568,
    });
  });

  it('never changes the remembered widths: they stay 280 and 360 px', () => {
    for (const width of [640, 700, 900, 1000, 1100]) {
      const result = both(width);
      if (!result.explorer.shown) {
        expect(result.explorer.width).toBe(280);
      }
      if (!result.inspector.shown) {
        expect(result.inspector.width).toBe(360);
      }
    }
  });

  it('leaves the main island at least 480 px in every window of 640 px or more', () => {
    for (let width = 640; width <= 2000; width += 7) {
      expect(both(width).main).toBeGreaterThanOrEqual(480);
    }
  });

  it('does not mark an inspector island it hides as hidden by the user', () => {
    const nav = input({ activeTab: ordersTab });
    expect(both(900).inspector.shown).toBe(false);
    expect(nav.nav.inspectorHidden).toBe(false);
    expect(isInspectorWanted(nav)).toBe(true);
  });
});
