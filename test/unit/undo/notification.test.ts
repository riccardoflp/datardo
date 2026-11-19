import { describe, expect, it } from 'vitest';
import { view } from '../../../src/features/undo/notification';
import { entry, revert } from './harness';

describe('undo.notification', () => {
  it('shows Undo for a write that recorded an operation, and none for one that recorded nothing', () => {
    const shown = view({ level: 'success', text: 'Updated 3 documents.', recorded: entry() });
    expect(shown.actions).toEqual([
      {
        label: 'Undo',
        element: 'undo.revert@notification',
        feature: 'undo.revert',
        target: { kind: 'collection', connection: 'c-local', database: 'shop', collection: 'orders' },
        args: { operation: 'op-1' },
      },
    ]);
    expect(shown.element).toBe('undo.notification@notification');
    const nothing = view({ level: 'success', text: 'Nothing changed.' });
    expect(nothing.actions).toEqual([]);
    expect(nothing.element).toBeUndefined();
  });

  it('starts undo.revert on that operation, which asks what that card asks', () => {
    expect(revert(entry(), {}, 'notification')).toMatchObject({ kind: 'read', need: { key: 'operation' } });
  });

  it('shows no Undo for a restore of several collections, and says where to undo it', () => {
    const shown = view({
      level: 'success',
      text: 'Restored 3 collections.',
      recorded: entry(),
      severalOperations: true,
    });
    expect(shown.actions).toEqual([]);
    expect(shown.text).toContain('Undo from the Undo history, one operation per collection');
  });

  it('says the operation is no longer in the undo history when it was removed in the meantime', () => {
    expect(revert(undefined, {}, 'notification')).toEqual({
      kind: 'refuse',
      code: 'undo.revert/gone',
      message: 'This operation is no longer in the undo history.',
    });
  });
});
