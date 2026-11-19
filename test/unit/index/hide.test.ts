import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/index/hide';
import { contextOn, engineSteps, planOf, refusalOf, started } from './harness';

describe('index.hide', () => {
  it('sends collMod with hidden: true and no confirmation', () => {
    const shown = planOf(plan(contextOn(false, 'index.hide'), started({ index: 'status_1' })));
    expect(shown.danger).toEqual({ kind: 'none' });
    const [step] = engineSteps(shown);
    expect(step?.request).toMatchObject({
      database: 'shop',
      method: 'runCommand',
      arguments: [{ collMod: 'orders', index: { name: 'status_1', hidden: true } }],
    });
    expect(shown.after).toContainEqual({ kind: 'refresh', connection: 'c-local' });
  });

  it('sends hidden: false to unhide', () => {
    const shown = planOf(plan(contextOn(false, 'index.hide'), started({ index: 'status_1', hidden: false })));
    expect(engineSteps(shown)[0]?.request.arguments).toEqual([
      { collMod: 'orders', index: { name: 'status_1', hidden: false } },
    ]);
    expect(shown.title).toBe('Unhide index status_1');
  });

  it('is refused on a read-only connection', () => {
    expect(refusalOf(plan(contextOn(true, 'index.hide'), started({ index: 'status_1' })))).toEqual({
      code: 'index.hide/read-only',
      text: 'The connection Production is read-only.',
    });
  });

  it('lets the server refuse it on MongoDB 4.2: the plan stops at its error', () => {
    const [step] = engineSteps(planOf(plan(contextOn(false, 'index.hide'), started({ index: 'status_1' }))));
    expect(step?.onFailure).toBeUndefined();
    expect(step?.writes).toBe(true);
  });
});
