import { describe, expect, it } from 'vitest';
import { explainSummary } from '../../../src/features/explain/summary';
import type { Json } from '../../../src/shared/engine-request';
import { findSortedInMemory, findWithoutIndex, treeText } from './examples';
import { explainReply, int } from './replies';

const slotBased: Json = {
  queryPlanner: {
    winningPlan: {
      queryPlan: { stage: 'FETCH', inputStage: { stage: 'IXSCAN', indexName: 'x_1' } },
      slotBasedPlan: { stages: '[1] ixseek' },
    },
  },
  executionStats: { nReturned: int(1), executionStages: { stage: 'nlj', nReturned: int(1) } },
};

const aggregate: Json = {
  stages: [
    {
      $cursor: {
        queryPlanner: { winningPlan: { stage: 'IXSCAN', indexName: 'status_1' } },
        executionStats: { nReturned: int(10), totalKeysExamined: int(10), totalDocsExamined: int(10) },
      },
      nReturned: int(10),
    },
    { $group: { _id: '$customer' }, nReturned: int(4), executionTimeMillisEstimate: int(2) },
    { $sort: { sortKey: { _id: int(1) } }, nReturned: int(4) },
  ],
};

const twoInputs: Json = {
  queryPlanner: {
    winningPlan: {
      stage: 'SORT',
      inputStage: {
        stage: 'FETCH',
        inputStage: {
          stage: 'OR',
          inputStages: [
            { stage: 'IXSCAN', indexName: 'a_1' },
            { stage: 'IXSCAN', indexName: 'c_1' },
          ],
        },
      },
    },
  },
};

function nested(levels: number): Json {
  let value: Json = { queryPlanner: { winningPlan: { stage: 'COLLSCAN' } } };
  for (let level = 0; level < levels; level += 1) {
    value = { inner: value };
  }
  return value;
}

describe('explain.summary', () => {
  it('sums up a find with no index: COLLSCAN, the four numbers and a tree of one node', () => {
    const summary = explainSummary(findWithoutIndex);
    expect(summary).toMatchObject({ collscan: true, indexes: [], inMemorySort: false, rejectedPlans: 0 });
    expect(summary.numbers).toEqual({ returned: 3, keysExamined: 0, docsExamined: 1000, milliseconds: 7 });
    expect(treeText(summary.tree)).toEqual([
      'COLLSCAN 3 out 1000 docs | filter: { status: { $eq: "paid" } }  direction: "forward"',
    ]);
  });

  it('sums up a find served by an index and sorted in memory, the details in the order of rule 4', () => {
    const summary = explainSummary(findSortedInMemory);
    expect(summary).toMatchObject({ collscan: false, indexes: ['status_1'], inMemorySort: true, rejectedPlans: 1 });
    expect(summary.numbers).toEqual({ returned: 120, keysExamined: 120, docsExamined: 120, milliseconds: 4 });
    expect(treeText(summary.tree)).toEqual([
      'SORT 120 out | sortPattern: { createdAt: -1 }',
      '  FETCH 120 out 120 docs',
      '    IXSCAN 120 out 120 keys | indexName: "status_1"  keyPattern: { status: 1 }  indexBounds: { status: ["[\\"paid\\", \\"paid\\"]"] }  direction: "forward"  isMultiKey: false',
    ]);
  });

  it('makes the tree of the slot-based engine from the queryPlan, without numbers on its nodes', () => {
    const summary = explainSummary(slotBased);
    expect(treeText(summary.tree)).toEqual(['FETCH', '  IXSCAN | indexName: "x_1"']);
    expect(summary.indexes).toEqual(['x_1']);
    expect(summary.numbers).toEqual({ returned: 1 });
  });

  it('sums up an aggregate: the numbers of the query and the stages after it', () => {
    const summary = explainSummary(aggregate);
    expect(summary.indexes).toEqual(['status_1']);
    expect(summary.numbers).toEqual({ returned: 10, keysExamined: 10, docsExamined: 10 });
    expect(summary.stagesAfterQuery).toEqual([
      { name: '$group', returned: 4, milliseconds: 2 },
      { name: '$sort', returned: 4 },
    ]);
  });

  it('gives a stage with two inputs its two children', () => {
    const summary = explainSummary(twoInputs);
    expect(summary.indexes).toEqual(['a_1', 'c_1']);
    expect(summary.inMemorySort).toBe(true);
    expect(treeText(summary.tree)).toEqual([
      'SORT',
      '  FETCH',
      '    OR',
      '      IXSCAN | indexName: "a_1"',
      '      IXSCAN | indexName: "c_1"',
    ]);
  });

  it.each([null, 42, 'x', {}, { ok: 1 }] as const)('gives an empty summary for %j and never fails', (output) => {
    expect(explainSummary(output)).toEqual({
      indexes: [],
      collscan: false,
      inMemorySort: false,
      numbers: {},
      rejectedPlans: 0,
      stagesAfterQuery: [],
    });
  });

  it('lists an index used by two stages once', () => {
    const output: Json = {
      queryPlanner: {
        winningPlan: {
          stage: 'OR',
          inputStages: [
            { stage: 'IXSCAN', indexName: 'a_1' },
            { stage: 'IXSCAN', indexName: 'a_1' },
          ],
        },
      },
    };
    expect(explainSummary(output).indexes).toEqual(['a_1']);
  });

  it('counts only a stage named SORT as an in-memory sort', () => {
    const plan = (stage: string): Json => ({ queryPlanner: { winningPlan: { stage } } });
    expect(explainSummary(plan('SORT_KEY_GENERATOR')).inMemorySort).toBe(false);
    expect(explainSummary(plan('SORT_MERGE')).inMemorySort).toBe(false);
    expect(explainSummary(plan('SORT')).inMemorySort).toBe(true);
  });

  it('treats a queryPlanner nested in nine objects as none, and finds it in eight', () => {
    expect(explainSummary(nested(9)).tree).toBeUndefined();
    expect(explainSummary(nested(8)).tree?.stage).toBe('COLLSCAN');
  });

  it('leaves out a number given as a Long rather than showing it as 0', () => {
    const output: Json = {
      queryPlanner: { winningPlan: { stage: 'COLLSCAN' } },
      executionStats: {
        nReturned: { $numberLong: '3' },
        totalDocsExamined: int(9),
        executionStages: { stage: 'COLLSCAN', nReturned: { $numberLong: '3' }, docsExamined: int(9) },
      },
    };
    const summary = explainSummary(output);
    expect(summary.numbers).toEqual({ docsExamined: 9 });
    expect(summary.tree?.returned).toBeUndefined();
    expect(summary.tree?.docsExamined).toBe(9);
  });

  it('reads a recorded COLLSCAN of MongoDB 8.2', () => {
    const summary = explainSummary(explainReply('find-collscan'));
    expect(summary).toMatchObject({ collscan: true, indexes: [], inMemorySort: false, rejectedPlans: 0 });
    expect(summary.numbers).toMatchObject({ returned: 3, keysExamined: 0, docsExamined: 1000 });
    expect(treeText(summary.tree)).toEqual([
      'COLLSCAN 3 out 1000 docs | filter: { status: { $eq: "paid" } }  direction: "forward"',
    ]);
  });

  it('reads a recorded IXSCAN sorted in memory, with its rejected plan', () => {
    const summary = explainSummary(explainReply('find-ixscan-sort'));
    expect(summary).toMatchObject({ collscan: false, indexes: ['status_1'], inMemorySort: true, rejectedPlans: 1 });
    expect(summary.numbers).toMatchObject({ returned: 120, keysExamined: 120, docsExamined: 120 });
    expect(treeText(summary.tree).map((line) => line.split(' |')[0])).toEqual([
      'SORT 120 out',
      '  FETCH 120 out 120 docs',
      '    IXSCAN 120 out 120 keys',
    ]);
  });

  it('reads a recorded plan with two inputs under SUBPLAN', () => {
    const summary = explainSummary(explainReply('find-or'));
    expect(summary.indexes).toEqual(['a_1', 'c_1']);
    expect(summary.inMemorySort).toBe(true);
    expect(treeText(summary.tree).map((line) => line.split(/ \d| \|/u)[0])).toEqual([
      'SUBPLAN',
      '  SORT',
      '    FETCH',
      '      OR',
      '        IXSCAN',
      '        IXSCAN',
    ]);
  });

  it('reads a recorded find by _id served by the express path', () => {
    const summary = explainSummary(explainReply('find-id'));
    expect(summary.tree?.stage).toBe('EXPRESS_IXSCAN');
    expect(summary.indexes).toEqual(['_id_']);
    expect(summary.collscan).toBe(false);
  });

  it('reads a recorded aggregate whose $group runs in the slot-based engine', () => {
    const summary = explainSummary(explainReply('aggregate-group'));
    expect(treeText(summary.tree).map((line) => line.split(' |')[0])).toEqual(['GROUP', '  FETCH', '    IXSCAN']);
    expect(summary.indexes).toEqual(['status_1']);
    expect(summary.numbers).toMatchObject({ returned: 4, keysExamined: 120, docsExamined: 120 });
    expect(summary.stagesAfterQuery.map((stage) => stage.name)).toEqual(['$sort']);
  });

  it('reads a recorded aggregate whose later stages run outside the query', () => {
    const summary = explainSummary(explainReply('aggregate-cursor'));
    expect(summary.collscan).toBe(true);
    expect(summary.stagesAfterQuery.map((stage) => stage.name)).toEqual(['$addFields', '$sort']);
    expect(summary.stagesAfterQuery[0]?.returned).toBe(3);
  });
});
