import { describe, expect, it } from 'vitest';
import { plan, quitWaitMs } from '../../../src/features/window/quit';
import { featureId, type WorkId } from '../../../src/shared/ids';
import type { Work } from '../../../src/shared/state/runner';
import { contextFor, planOf, startedWith, stepTexts } from './context';

function work(id: string, title: string, started: number): Work {
  return { id: id as WorkId, feature: featureId('transfer.export'), title, started };
}

describe('window.quit', () => {
  it('with nothing in progress, quits at once, with no question', () => {
    const result = planOf(plan(contextFor('window.quit'), startedWith(null)));
    expect(result.steps.map((step) => step.text)).toEqual(['quit Datardo']);
    expect(result.danger).toEqual({ kind: 'none' });
  });

  it('with an export of shop.orders in progress, confirms Quit Datardo? with its steps and the button Quit', () => {
    const context = contextFor('window.quit', { runner: { work: [work('w1', 'Export shop.orders', 10)] } });
    const result = planOf(plan(context, startedWith(null)));
    expect(result.title).toBe('Quit Datardo?');
    expect(result.steps.map((step) => step.text)).toEqual(['cancel Export shop.orders', 'quit Datardo']);
    expect(result.danger).toEqual({
      kind: 'confirm',
      text: 'Work that is cancelled stops where it is: what it has already written stays.',
      button: 'Quit',
    });
    expect('cannot' in result.undo).toBe(true);
  });

  it('cancels the work in the order it started, and waits for it up to 5 seconds', () => {
    const context = contextFor('window.quit', {
      runner: { work: [work('late', 'Backup shop', 30), work('early', 'Export shop.orders', 10)] },
    });
    const result = planOf(plan(context, startedWith(null)));
    expect(result.steps.map((step) => step.text)).toEqual([
      'cancel Export shop.orders',
      'cancel Backup shop',
      'quit Datardo',
    ]);
    expect(result.steps[0]).toMatchObject({ action: 'runner.cancel-work', args: { work: 'early' } });
    expect(result.steps[2]).toMatchObject({ action: 'window.quit', args: { waitMs: quitWaitMs } });
    expect(quitWaitMs).toBe(5000);
  });

  it('does not count the quit itself as work to cancel', () => {
    const quitting: Work = { id: 'q' as WorkId, feature: featureId('window.quit'), title: 'Quit Datardo', started: 1 };
    expect(stepTexts(plan(contextFor('window.quit', { runner: { work: [quitting] } }), startedWith(null)))).toEqual([
      'quit Datardo',
    ]);
  });
});
