import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/undo/clear';
import { operationId } from '../../../src/features/undo/types';
import { appStateWith, contextOf, entry, planOf, stepTexts, undoWith } from './harness';

describe('undo.clear', () => {
  it('counts the operations already undone in its confirmation', () => {
    const entries = [entry(), entry({ id: operationId('op-2'), undone: 1, size: 0 })];
    const result = planOf(plan(contextOf('undo.clear', appStateWith(undoWith(entries))), {}));
    expect(result.title).toBe('Clear the undo history?');
    expect(result.danger).toEqual({
      kind: 'confirm',
      text: '2 operations can then no longer be undone.',
      button: 'Clear history',
    });
    expect(stepTexts(plan(contextOf('undo.clear', appStateWith(undoWith(entries))), {}))).toEqual([
      'delete the 2 operations of the undo history',
    ]);
  });

  it('says 1 operation in the singular', () => {
    const result = planOf(plan(contextOf('undo.clear', appStateWith(undoWith([entry()]))), {}));
    expect(result.danger).toMatchObject({ text: '1 operation can then no longer be undone.' });
  });

  it('works from Go to whatever tab is active: it needs no target', () => {
    const context = { ...contextOf('undo.clear', appStateWith(undoWith([entry()]))), startedBy: 'user' as const };
    expect(plan(context, {}).kind).toBe('run');
  });

  it('has nothing to clear in an empty history', () => {
    expect(plan(contextOf('undo.clear', appStateWith()), {})).toMatchObject({
      kind: 'refuse',
      code: 'undo.clear/empty',
    });
  });
});
