import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/undo/remove';
import { reduceUndo } from '../../../src/features/undo/state/history';
import { operationId } from '../../../src/features/undo/types';
import { view } from '../../../src/features/undo/show';
import { appStateWith, at, contextOf, entry, planOf, stepsOf, undoWith, withArgs } from './harness';

describe('undo.remove', () => {
  it('removes the row and its file at once, without asking', () => {
    const result = planOf(
      plan(contextOf('undo.remove', appStateWith(undoWith([entry()]))), withArgs({ operation: 'op-1' })),
    );
    expect(result.danger).toEqual({ kind: 'none' });
    expect(stepsOf({ kind: 'run', plan: result })).toEqual([
      {
        kind: 'app',
        action: 'undo.remove',
        args: { operation: 'op-1' },
        text: 'delete the operation "Update many in shop.orders" from the undo history',
      },
    ]);
  });

  it('removes the row of an undone operation the same way: the app finds no file to delete', () => {
    const undone = entry({ undone: 1, size: 0 });
    expect(
      stepsOf(plan(contextOf('undo.remove', appStateWith(undoWith([undone]))), withArgs({ operation: 'op-1' }))),
    ).toHaveLength(1);
  });

  it('closes the details of the expanded row it removes', () => {
    const undo = undoWith([entry()], { expanded: operationId('op-1') });
    const after = reduceUndo(undo, { slice: 'undo', type: 'removed', operations: [operationId('op-1')] });
    expect(after.expanded).toBeUndefined();
    expect(after.entries).toEqual([]);
  });

  it('counts one operation less and the space of its file less in the summary', () => {
    const entries = [entry(), entry({ id: operationId('op-2'), size: 1024 })];
    const settings = appStateWith().settings;
    const now = at(2026, 11, 19, 14);
    const before = view({ undo: undoWith(entries), connections: [], settings, now }).toolbar.summary.text;
    const undo = reduceUndo(undoWith(entries), { slice: 'undo', type: 'removed', operations: [operationId('op-1')] });
    const after = view({ undo, connections: [], settings, now }).toolbar.summary.text;
    expect(before).toBe('2 operations · 3.0 KB of 100 MB');
    expect(after).toBe('1 operation · 1.0 KB of 100 MB');
  });

  it('does nothing for an operation no longer in the history', () => {
    expect(stepsOf(plan(contextOf('undo.remove', appStateWith()), withArgs({ operation: 'op-9' })))).toEqual([]);
  });
});
