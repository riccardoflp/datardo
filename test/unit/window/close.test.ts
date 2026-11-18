import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/window/close';
import { plan as quitPlan } from '../../../src/features/window/quit';
import { featureId, type WorkId } from '../../../src/shared/ids';
import { contextFor, planOf, startedWith, stepTexts } from './context';

describe('window.close', () => {
  it('with task.tray keeping Datardo running, hides the window and shows the tray icon, asking nothing', () => {
    const result = planOf(plan(contextFor('window.close', { window: { closeKeepsRunning: true } }), startedWith(null)));
    expect(result.steps.map((step) => step.text)).toEqual(['hide the window', 'show the tray icon']);
    expect(result.danger).toEqual({ kind: 'none' });
  });

  it('without it, does exactly what Quit Datardo does', () => {
    expect(stepTexts(plan(contextFor('window.close'), startedWith(null)))).toEqual(['quit Datardo']);
    const busy = {
      runner: {
        work: [{ id: 'w' as WorkId, feature: featureId('transfer.export'), title: 'Export shop.orders', started: 1 }],
      },
    };
    expect(plan(contextFor('window.close', busy), startedWith(null))).toEqual(
      quitPlan(contextFor('window.quit', busy), startedWith(null)),
    );
  });

  it('quits on macOS too when no scheduled task keeps Datardo running', () => {
    expect(stepTexts(plan(contextFor('window.close', { platform: 'macos' }), startedWith(null)))).toEqual([
      'quit Datardo',
    ]);
  });
});
