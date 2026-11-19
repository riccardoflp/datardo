import { describe, expect, it } from 'vitest';
import { editorJson, type Stage } from '../../../src/features/aggregate/types';
import { explainTimeLimitMs, parse, readQuery, request } from '../../../src/features/explain/run';
import type { Json, MongoRequest } from '../../../src/shared/engine-request';
import type { Outcome, ReadRequest } from '../../../src/shared/feature';
import { mongoshValue } from '../../../src/shared/mongosh-value';
import { contextOn, explainReply, int } from './replies';

function requestOf(result: ReadRequest | Outcome): MongoRequest {
  if (result.kind !== 'engine' || result.requests.length !== 1 || result.requests[0]?.request.engine !== 'mongodb') {
    throw new Error(`Expected one request to MongoDB, got ${JSON.stringify(result)}`);
  }
  return result.requests[0].request;
}

function refusalOf(result: ReadRequest | Outcome): string {
  return result.kind === 'refuse' ? result.code : `not refused: ${result.kind}`;
}

function sentText(result: ReadRequest | Outcome): string {
  return mongoshValue(requestOf(result).arguments[0] ?? null);
}

const stage = (name: string, body: string, enabled = true): Stage => ({ name, body, enabled });

const threeStages = [
  stage('$match', '{ status: "paid" }'),
  stage('$group', '{ _id: "$customer" }'),
  stage('$sort', '{ _id: 1 }'),
];

describe('explain.run', () => {
  it('sends the explain of a find with the filter and the sort, executionStats and 60 seconds, without skip or limit', () => {
    const args = { mode: 'find', query: { filter: '{ status: "paid" }', sort: '{ createdAt: -1 }', projection: '' } };
    const sent = requestOf(request(contextOn('explain.run'), args));
    expect(sent).toMatchObject({ database: 'shop', method: 'runCommand', timeLimitMs: explainTimeLimitMs });
    expect(mongoshValue(sent.arguments[0] ?? null)).toBe(
      '{ explain: { find: "orders", filter: { status: "paid" }, sort: { createdAt: -1 } }, verbosity: "executionStats", maxTimeMS: 60000 }',
    );
    expect(sentText(request(contextOn('explain.run'), args))).not.toMatch(/skip|limit:/u);
  });

  it('explains the filter as typed, run or not, with the projection when there is one', () => {
    const args = { mode: 'find', query: { filter: '{ qty: NumberLong(5) }', projection: '{ total: 1 }' } };
    expect(sentText(request(contextOn('explain.run'), args))).toBe(
      '{ explain: { find: "orders", filter: { qty: Long("5") }, projection: { total: 1 } }, verbosity: "executionStats", maxTimeMS: 60000 }',
    );
  });

  it('explains the pipeline up to the stage shown, without a disabled stage', () => {
    const editor = { stages: threeStages, shown: 1 };
    const sent = sentText(request(contextOn('explain.run'), { mode: 'aggregate', pipeline: editorJson(editor) }));
    expect(sent).toBe(
      '{ explain: { aggregate: "orders", pipeline: [{ $match: { status: "paid" } }, { $group: { _id: "$customer" } }], cursor: {}, allowDiskUse: true }, verbosity: "executionStats", maxTimeMS: 60000 }',
    );
    const disabled = { stages: [threeStages[0], stage('$limit', '5', false), threeStages[2]] as Stage[] };
    expect(
      sentText(request(contextOn('explain.run'), { mode: 'aggregate', pipeline: editorJson(disabled) })),
    ).toContain('pipeline: [{ $match: { status: "paid" } }, { $sort: { _id: 1 } }]');
  });

  it('sends nothing for a pipeline shown up to $out, and says why', () => {
    const editor = { stages: [threeStages[0], stage('$out', '"archive"')] as Stage[] };
    const result = request(contextOn('explain.run'), { mode: 'aggregate', pipeline: editorJson(editor) });
    expect(result).toEqual({
      kind: 'refuse',
      code: 'explain.run/writes',
      message: "A pipeline ending with $out can't be explained here: select an earlier stage.",
    });
    const merged = { stages: [stage('$merge', '{ into: "archive" }')] };
    expect(refusalOf(request(contextOn('explain.run'), { mode: 'aggregate', pipeline: editorJson(merged) }))).toBe(
      'explain.run/writes',
    );
  });

  it('sends nothing for a sort that is not valid, and marks the sort', () => {
    const texts = { filter: '{ status: "paid" }', sort: '{ createdAt: ' };
    const result = request(contextOn('explain.run'), { mode: 'find', query: texts });
    expect(result).toMatchObject({ kind: 'refuse', code: 'explain.run/invalid-query' });
    expect(result.kind === 'refuse' ? result.message : '').toBe('Invalid query syntax — check the highlighted field.');
    expect(readQuery(texts, { now: 0 })).toMatchObject({ ok: false, field: 'sort' });
    expect(readQuery({ projection: '[1]' }, { now: 0 })).toMatchObject({ ok: false, field: 'projection' });
  });

  it('refuses a stage that is not valid as aggregate.run refuses it', () => {
    const editor = { stages: [stage('$match', '{ status: ')] };
    expect(refusalOf(request(contextOn('explain.run'), { mode: 'aggregate', pipeline: editorJson(editor) }))).toBe(
      'explain.run/invalid-stage',
    );
  });

  it('runs on a read-only connection, for a find and for a pipeline without a stage that writes', () => {
    const find = request(contextOn('explain.run', true), { mode: 'find', query: { filter: '{}' } });
    expect(requestOf(find).method).toBe('runCommand');
    const pipeline = { stages: threeStages };
    const aggregate = request(contextOn('explain.run', true), { mode: 'aggregate', pipeline: editorJson(pipeline) });
    expect(requestOf(aggregate).method).toBe('runCommand');
  });

  it('keeps the output whole with its types, and gives its summary', () => {
    const output = explainReply('find-collscan');
    const result = parse([output], { mode: 'find', query: { filter: '{ status: "paid" }' } });
    expect(result.output).toBe(output);
    expect(result.kind).toBe('find');
    expect(result.summary.collscan).toBe(true);
    expect(result.failure).toBeUndefined();
    expect(parse([explainReply('aggregate-cursor')], { mode: 'aggregate' }).kind).toBe('pipeline');
  });

  it('gives the server error of a query stopped at the time limit', () => {
    // Written by hand from the shape MongoDB 8.2 gave on a standalone server; on the replica set the server failed the
    // whole command instead, which the runner shows as any error of the server.
    const stopped: Json = {
      queryPlanner: { winningPlan: { stage: 'COLLSCAN' }, rejectedPlans: [] },
      executionStats: {
        executionSuccess: false,
        errorMessage: 'operation exceeded time limit',
        errorCode: int(50),
        nReturned: int(7),
        executionStages: { stage: 'COLLSCAN', nReturned: int(7) },
      },
      ok: { $numberDouble: '1.0' },
    };
    expect(parse([stopped], { mode: 'find' }).failure).toBe('operation exceeded time limit');
  });
});
