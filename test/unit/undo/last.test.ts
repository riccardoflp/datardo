import { describe, expect, it } from 'vitest';
import { lastOperation, plan } from '../../../src/features/undo/last';
import { operationRead } from '../../../src/features/undo/reads/operation';
import { operationId } from '../../../src/features/undo/types';
import { appStateWith, cacheConnection, contextOf, entry, keyEntry, localConnection, undoWith } from './harness';

describe('undo.last', () => {
  it('undoes the newest operation of any connection and engine that is not undone, which may be an Undo: …', () => {
    const redo = keyEntry({ id: operationId('op-3'), title: 'Undo: Delete the key orders:42' });
    const undone = entry({ id: operationId('op-2'), undone: 1, size: 0 });
    const undo = undoWith([undone, redo, entry()]);
    expect(lastOperation(undo)).toBe(redo);
    expect(plan(contextOf('undo.last', appStateWith(undo)), {})).toMatchObject({
      kind: 'read',
      need: { key: 'operation', read: operationRead, args: { operation: 'op-3' } },
    });
  });

  it('works from Go to whatever tab is active', () => {
    const context = contextOf('undo.last', appStateWith(undoWith([entry()])), undefined, {
      kind: 'connection',
      connection: cacheConnection.id,
    });
    expect(plan(context, {}).kind).toBe('read');
  });

  it('says there is nothing to undo when every operation is undone, or none', () => {
    const empty = { kind: 'refuse', code: 'undo.last/empty', message: 'Nothing to undo: the undo history is empty.' };
    expect(plan(contextOf('undo.last', appStateWith()), {})).toEqual(empty);
    expect(plan(contextOf('undo.last', appStateWith(undoWith([entry({ undone: 1 })]))), {})).toEqual(empty);
  });

  it('says the read-only message and undoes nothing on a connection made read-only since, also the next time', () => {
    const state = appStateWith(undoWith([entry()]), [{ ...localConnection, readOnly: true }, cacheConnection]);
    const refusal = {
      kind: 'refuse',
      code: 'undo.revert/read-only',
      message: 'The connection Local is read-only: nothing can be undone through it.',
    };
    expect(plan(contextOf('undo.last', state), {})).toEqual(refusal);
    expect(plan(contextOf('undo.last', state), {})).toEqual(refusal);
  });
});
