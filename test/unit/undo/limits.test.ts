import { describe, expect, it } from 'vitest';
import type { AppStep, Outcome } from '../../../src/shared/feature';
import { plan } from '../../../src/features/undo/limits';
import { dayMs } from '../../../src/features/undo/prune-order';
import { megabyte, operationId, undoSettings, type UndoEntry } from '../../../src/features/undo/types';
import { appStateWith, at, contextOf, entry, keyEntry, stepsOf, undoWith, withSettings } from './harness';

const now = at(2026, 11, 19, 14);

function operations(count: number, make: typeof entry = entry, from = 0): UndoEntry[] {
  return Array.from({ length: count }, (_, index) =>
    make({ id: operationId(`op-${String(from + index)}`), time: now - (from + index + 1) * 1000, size: 1024 }),
  );
}

function limits(
  entries: readonly UndoEntry[],
  stored: Readonly<Record<string, unknown>> = {},
  start?: unknown,
): Outcome {
  const state = withSettings(appStateWith(undoWith(entries)), stored);
  return plan(contextOf('undo.limits', state, now), start === undefined ? {} : { start });
}

/** The app steps of the plan, as `<action> <args>`. */
function actions(outcome: Outcome): readonly { readonly action: string; readonly args: unknown }[] {
  return stepsOf(outcome).map((step) => ({ action: (step as AppStep).action, args: (step as AppStep).args }));
}

describe('undo.limits', () => {
  it('drops the oldest with the 201st operation', () => {
    const all = operations(201);
    expect(actions(limits(all))).toEqual([{ action: 'undo.prune', args: { operations: ['op-200'] } }]);
  });

  it('drops an operation older than 7 days', () => {
    const old = entry({ id: operationId('op-old'), time: now - 8 * dayMs });
    expect(actions(limits([entry(), old]))).toEqual([{ action: 'undo.prune', args: { operations: ['op-old'] } }]);
  });

  it('keeps the newest 10 at once when datardo.undo.maxOperations is lowered to 10', () => {
    const all = operations(12);
    expect(actions(limits(all, { 'datardo.undo.maxOperations': 10 }))).toEqual([
      { action: 'undo.prune', args: { operations: ['op-10', 'op-11'] } },
    ]);
  });

  it('drops at start the operations whose file is missing, keeps undone ones, and deletes files with no operation', () => {
    const present = entry({ id: operationId('op-a') });
    const lost = entry({ id: operationId('op-b') });
    const undone = entry({ id: operationId('op-c'), undone: now - 10, size: 0 });
    const start = {
      index: 'current',
      damagedBefore: false,
      files: [
        { name: 'op-a.json.gz', time: now - dayMs },
        { name: 'op-z.json.gz', time: now - dayMs },
      ],
    };
    expect(actions(limits([present, lost, undone], {}, start))).toEqual([
      { action: 'undo.prune', args: { operations: ['op-b'] } },
      { action: 'undo.delete-files', args: { files: ['op-z.json.gz'] } },
    ]);
  });

  it('deletes nothing at start when the index was damaged or newer, and only old orphans after a damaged one (RS4)', () => {
    const files = [
      { name: 'op-new.json.gz', time: now - dayMs },
      { name: 'op-old.json.gz', time: now - 8 * dayMs },
    ];
    expect(stepsOf(limits([], {}, { index: 'damaged', damagedBefore: true, files }))).toEqual([]);
    expect(stepsOf(limits([entry()], {}, { index: 'newer', damagedBefore: false, files }))).toEqual([]);
    expect(actions(limits([], {}, { index: 'current', damagedBefore: true, files }))).toEqual([
      { action: 'undo.delete-files', args: { files: ['op-old.json.gz'] } },
    ]);
  });

  it('counts undone operations towards the number and the days, with no size', () => {
    const all = [...operations(199), entry({ id: operationId('op-u'), time: now - 500_000, undone: now, size: 0 })];
    const one = entry({ id: operationId('op-x'), time: now - 600_000 });
    expect(actions(limits([...all, one]))).toEqual([{ action: 'undo.prune', args: { operations: ['op-x'] } }]);
  });

  it('drops alone an operation whose file is larger than datardo.undo.maxSizeMb, and keeps the older ones', () => {
    const big = entry({ id: operationId('op-big'), time: now - 10, size: 2 * megabyte });
    const older = operations(3);
    expect(actions(limits([big, ...older], { 'datardo.undo.maxSizeMb': 1 }))).toEqual([
      { action: 'undo.prune', args: { operations: ['op-big'] } },
    ]);
  });

  it('counts datardo.undo.maxSizeMb set to -5 or to text as 100', () => {
    for (const value of [-5, 'ten']) {
      const state = withSettings(appStateWith(), { 'datardo.undo.maxSizeMb': value });
      expect(undoSettings(state.settings).maxBytes).toBe(100 * megabyte);
    }
  });

  it('shares the limits between documents and keys: 150 and 51 drop the oldest of the 201', () => {
    const all = [...operations(150), ...operations(51, keyEntry, 150)];
    expect(actions(limits(all))).toEqual([{ action: 'undo.prune', args: { operations: ['op-200'] } }]);
  });
});
