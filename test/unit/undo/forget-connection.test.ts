import { describe, expect, it } from 'vitest';
import { forgetStep, operationCount, plan } from '../../../src/features/undo/forget-connection';
import { operationId } from '../../../src/features/undo/types';
import { reduceUndo } from '../../../src/features/undo/state/history';
import {
  appStateWith,
  cacheConnection,
  contextOf,
  entry,
  keyEntry,
  localConnection,
  stepsOf,
  undoWith,
} from './harness';

const twelve = Array.from({ length: 12 }, (_, index) => entry({ id: operationId(`op-${String(index)}`) }));
const keys = keyEntry();
const state = appStateWith(undoWith([...twelve, keys]));

describe('undo.forget-connection', () => {
  it('deletes every operation of the removed connection, and keeps those of the others', () => {
    const step = forgetStep(state, localConnection.id, 'Local');
    expect(step).toEqual({
      kind: 'app',
      action: 'undo.forget-connection',
      args: { connection: localConnection.id },
      text: 'delete the 12 operations of Local from the undo history',
    });
    const left = reduceUndo(undoWith([...twelve, keys]), {
      slice: 'undo',
      type: 'removed',
      operations: twelve.map((each) => each.id),
    });
    expect(left.entries).toEqual([keys]);
  });

  it('shows the step in the confirmation of the removal', () => {
    const target = { kind: 'connection' as const, connection: localConnection.id };
    expect(
      stepsOf(plan(contextOf('undo.forget-connection', state, undefined, target), {})).map((each) => each.text),
    ).toEqual(['delete the 12 operations of Local from the undo history']);
  });

  it('deletes the operations on the keys of a linked Redis connection, not those on the documents', () => {
    expect(operationCount(state, cacheConnection.id)).toBe(1);
    expect(forgetStep(state, cacheConnection.id, 'Cache local')?.text).toBe(
      'delete the 1 operation of Cache local from the undo history',
    );
  });

  it('has no step for a connection with no operation', () => {
    expect(forgetStep(appStateWith(), localConnection.id, 'Local')).toBeUndefined();
  });
});
