/**
 * The worked examples of `explain.summary` that several tests of the explain area use, written by hand from the card,
 * and a node of the winning plan as lines of text, for comparing trees.
 */
import { formattedValue } from '../../../src/features/aggregate/mongosh/format';
import type { WinningPlanNode } from '../../../src/features/explain/types';
import type { Json } from '../../../src/shared/engine-request';
import { int } from './replies';

/** A node as a line of text: its stage, its numbers and its details, then its children indented. */
export function treeText(node: WinningPlanNode | undefined, depth = 0): readonly string[] {
  if (node === undefined) {
    return [];
  }
  const numbers = [
    node.returned === undefined ? '' : ` ${String(node.returned)} out`,
    node.keysExamined === undefined ? '' : ` ${String(node.keysExamined)} keys`,
    node.docsExamined === undefined ? '' : ` ${String(node.docsExamined)} docs`,
  ].join('');
  const details = node.details.map((detail) => `${detail.name}: ${formattedValue(detail.value, { kind: 'one-line' })}`);
  const line = `${'  '.repeat(depth)}${node.stage}${numbers}${details.length > 0 ? ` | ${details.join('  ')}` : ''}`;
  return [line, ...node.children.flatMap((child) => treeText(child, depth + 1))];
}

/** The first worked example: a find with no index. */
export const findWithoutIndex: Json = {
  queryPlanner: {
    winningPlan: { stage: 'COLLSCAN', filter: { status: { $eq: 'paid' } }, direction: 'forward' },
    rejectedPlans: [],
  },
  executionStats: {
    nReturned: int(3),
    executionTimeMillis: int(7),
    totalKeysExamined: int(0),
    totalDocsExamined: int(1000),
    executionStages: {
      stage: 'COLLSCAN',
      filter: { status: { $eq: 'paid' } },
      nReturned: int(3),
      executionTimeMillisEstimate: int(5),
      direction: 'forward',
      docsExamined: int(1000),
    },
  },
};

/** The second worked example: a find served by an index and sorted in memory, its details out of order. */
export const findSortedInMemory: Json = {
  queryPlanner: { winningPlan: { stage: 'SORT' }, rejectedPlans: [{ stage: 'FETCH' }] },
  executionStats: {
    nReturned: int(120),
    executionTimeMillis: int(4),
    totalKeysExamined: int(120),
    totalDocsExamined: int(120),
    executionStages: {
      stage: 'SORT',
      nReturned: int(120),
      sortPattern: { createdAt: int(-1) },
      inputStage: {
        stage: 'FETCH',
        nReturned: int(120),
        docsExamined: int(120),
        inputStage: {
          stage: 'IXSCAN',
          nReturned: int(120),
          keysExamined: int(120),
          direction: 'forward',
          isMultiKey: false,
          indexBounds: { status: ['["paid", "paid"]'] },
          keyPattern: { status: int(1) },
          indexName: 'status_1',
        },
      },
    },
  },
};
