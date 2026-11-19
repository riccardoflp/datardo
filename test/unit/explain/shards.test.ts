/**
 * The sharded explains are written by hand from the worked examples of the card and the shapes of MongoDB's
 * documentation (`SINGLE_SHARD`, `SHARD_MERGE`, a shard run by the slot-based engine): no sharded cluster is started
 * to record them.
 */
import { describe, expect, it } from 'vitest';
import { shardNodes } from '../../../src/features/explain/shards';
import { explainSummary } from '../../../src/features/explain/summary';
import type { JsonDocument } from '../../../src/features/explain/types';
import { view } from '../../../src/features/explain/show';
import type { Json } from '../../../src/shared/engine-request';
import { treeText } from './examples';
import { explainReply, int } from './replies';

const oneShard: Json = {
  queryPlanner: {
    winningPlan: { stage: 'SINGLE_SHARD', shards: [{ shardName: 'rs0', winningPlan: { stage: 'COLLSCAN' } }] },
  },
};

const twoShards: Json = {
  queryPlanner: {
    winningPlan: {
      stage: 'SHARD_MERGE',
      shards: [
        {
          shardName: 'sh1',
          winningPlan: { stage: 'FETCH', inputStage: { stage: 'IXSCAN', indexName: 'a_1' } },
          rejectedPlans: [{ stage: 'COLLSCAN' }],
        },
        { shardName: 'sh2', winningPlan: { stage: 'COLLSCAN' }, rejectedPlans: [] },
      ],
    },
  },
  executionStats: {
    nReturned: int(5),
    totalDocsExamined: int(40),
    executionStages: {
      stage: 'SHARD_MERGE',
      nReturned: int(5),
      shards: [
        {
          shardName: 'sh1',
          nReturned: int(2),
          totalKeysExamined: int(2),
          totalDocsExamined: int(2),
          executionStages: {
            stage: 'FETCH',
            nReturned: int(2),
            inputStage: { stage: 'IXSCAN', indexName: 'a_1', keysExamined: int(2) },
          },
        },
        { shardName: 'sh2', nReturned: int(3), totalDocsExamined: int(38), executionStages: { stage: 'filter' } },
      ],
    },
  },
};

describe('explain.shards', () => {
  it('gives one shard without statistics its plan under a SHARD node', () => {
    const summary = explainSummary(oneShard);
    expect(treeText(summary.tree)).toEqual(['SINGLE_SHARD', '  SHARD | shardName: "rs0"', '    COLLSCAN']);
    expect(summary.collscan).toBe(true);
  });

  it('gives each of two shards its numbers and its plan, the second taken from the query planner', () => {
    const summary = explainSummary(twoShards);
    expect(treeText(summary.tree)).toEqual([
      'SHARD_MERGE 5 out',
      '  SHARD 2 out 2 keys 2 docs | shardName: "sh1"',
      '    FETCH 2 out',
      '      IXSCAN 2 keys | indexName: "a_1"',
      '  SHARD 3 out 38 docs | shardName: "sh2"',
      '    COLLSCAN',
    ]);
    expect(summary).toMatchObject({ indexes: ['a_1'], collscan: true, rejectedPlans: 1 });
    expect(summary.numbers).toEqual({ returned: 5, docsExamined: 40 });
  });

  it('shows COLLSCAN, index a_1 and 1 rejected plan, and the rows of each shard', () => {
    const shown = view({
      kind: 'find',
      running: false,
      cancelled: false,
      raw: false,
      toggled: [],
      readOnly: false,
      view: false,
      result: { kind: 'find', output: twoShards, summary: explainSummary(twoShards) },
    });
    expect(shown.summary?.verdict.map((mark) => mark.text)).toEqual(['COLLSCAN', 'index a_1', '1 rejected plan']);
    const rows = shown.summary?.winningPlan?.rows ?? [];
    expect(rows.map((row) => [row.depth, row.stage, row.details])).toEqual([
      [0, 'SHARD_MERGE', ''],
      [1, '└ SHARD', 'shardName: "sh1"'],
      [2, '└ FETCH', ''],
      [3, '└ IXSCAN', 'indexName: "a_1"'],
      [1, '└ SHARD', 'shardName: "sh2"'],
      [2, '└ COLLSCAN', ''],
    ]);
  });

  it('gives a shard with neither stages nor a plan a SHARD node with its name and no child', () => {
    const stage: JsonDocument = { stage: 'SHARD_MERGE', shards: [{ shardName: 'sh3', nReturned: int(0) }] };
    const [node] = shardNodes(stage, new Map());
    expect(node).toEqual({
      stage: 'SHARD',
      details: [{ name: 'shardName', value: 'sh3' }],
      children: [],
      returned: 0,
    });
  });

  it('gives a shard without shardName a SHARD node without details', () => {
    const stage: JsonDocument = { stage: 'SINGLE_SHARD', shards: [{ winningPlan: { stage: 'COLLSCAN' } }] };
    const [node] = shardNodes(stage, new Map());
    expect(node?.details).toEqual([]);
    expect(node?.children.map((child) => child.stage)).toEqual(['COLLSCAN']);
  });

  it('gives no SHARD node on a collection that is not sharded', () => {
    for (const name of ['find-collscan', 'find-ixscan-sort', 'find-or', 'aggregate-group']) {
      const lines = treeText(explainSummary(explainReply(name)).tree);
      expect(lines.some((line) => line.trim().startsWith('SHARD'))).toBe(false);
    }
  });
});
