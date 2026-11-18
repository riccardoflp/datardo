import { describe, expect, it } from 'vitest';
import { dragged, keyWidth, plan, widthLimits } from '../../../src/features/nav/resize';
import { context } from './inputs';

const explorer = widthLimits('explorer', 1440, 360);

describe('nav.resize', () => {
  it('dragging the explorer’s gap 40 px to the right makes it 320 px wide', () => {
    expect(dragged(280 + 40, explorer)).toEqual({ hidden: false, width: 320 });
    const outcome = plan(context({}, 'nav.resize'), { args: { island: 'explorer', width: 320, windowWidth: 1440 } });
    expect(outcome).toMatchObject({
      kind: 'run',
      plan: {
        steps: [{ text: 'set the width of the explorer to 320 px', action: 'nav.set-widths', args: { explorer: 320 } }],
      },
    });
  });

  it('cannot drag the explorer wider than 480 px, nor the inspector island wider than 640 px', () => {
    expect(dragged(900, widthLimits('explorer', 3000))).toEqual({ hidden: false, width: 480 });
    expect(dragged(900, widthLimits('inspector', 3000))).toEqual({ hidden: false, width: 640 });
  });

  it('in a window 1,280 px wide with the explorer at 280 px, the inspector cannot be wider than 448 px', () => {
    expect(widthLimits('inspector', 1280, 280).maximum).toBe(448);
    expect(dragged(600, widthLimits('inspector', 1280, 280))).toEqual({ hidden: false, width: 448 });
  });

  it('dragging the explorer’s gap to 130 px from the rail hides it, and it comes back 200 px wide', () => {
    expect(dragged(130, explorer)).toEqual({ hidden: true });
    expect(dragged(150, explorer)).toEqual({ hidden: false, width: 200 });
    const outcome = plan(context({}, 'nav.resize'), { args: { island: 'explorer', width: 130 } });
    expect(outcome).toMatchObject({
      plan: {
        steps: [
          { text: 'set the width of the explorer to 200 px', args: { explorer: 200 } },
          { text: 'hide the explorer', action: 'nav.set-explorer', args: { hidden: true } },
        ],
      },
    });
  });

  it('a double click on the inspector’s gap gives it 360 px', () => {
    expect(keyWidth('Enter', 500, widthLimits('inspector', 1440), 1)).toBe(360);
  });

  it('with the focus on the explorer’s gap, Right twice widens the explorer by 32 px', () => {
    const once = keyWidth('ArrowRight', 280, explorer, 1) ?? 0;
    expect(keyWidth('ArrowRight', once, explorer, 1)).toBe(312);
    expect(keyWidth('Home', 300, explorer, 1)).toBe(200);
    expect(keyWidth('End', 300, explorer, 1)).toBe(explorer.maximum);
  });

  it('Reset island widths gives 280 px and 360 px', () => {
    expect(plan(context({}, 'nav.resize'), { args: { reset: true } })).toMatchObject({
      plan: {
        title: 'Reset island widths',
        steps: [
          { text: 'set the width of the explorer to 280 px', args: { explorer: 280 } },
          { text: 'set the width of the inspector island to 360 px', args: { inspector: 360 } },
        ],
      },
    });
  });
});
