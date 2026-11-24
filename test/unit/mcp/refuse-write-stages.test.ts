import { describe, expect, it } from 'vitest';
import { notPlainReadStages, readPipeline } from '../../../src/features/mcp/refuse-write-stages';
import { drive, failed, failureOf, mcpState } from './harness';

const refusal = (stage: string): string => `${stage} writes to the database: Datardo's MCP server only reads.`;

const notPlain = (stage: string): string =>
  `${stage} is refused: Datardo's MCP server runs only pipelines that read the collection (watch_changes follows the changes, current_operations lists the operations, slow_queries gives the query shapes).`;

const reads = (collection: string): string =>
  `The pipeline reads ${collection}: Datardo's MCP server doesn't read the system.* collections (users, profiler, views…).`;

const orders = { connection: 'Local', database: 'shop', collection: 'orders' };

/** The tools that take a pipeline, each with the arguments it needs besides it. */
const pipelineTools = ['aggregate', 'explain_query', 'open_aggregation', 'open_explain'];

function refusedEverywhere(pipeline: string, sentence: string): void {
  for (const tool of pipelineTools) {
    for (const readData of [true, false]) {
      const state = mcpState({ settings: { 'datardo.mcp.readData': readData } });
      const driven = drive(tool, { ...orders, pipeline }, { mongo: () => [{ name: 'orders' }] }, state);
      expect(failureOf(driven), `${tool} ${pipeline}`).toBe(sentence);
      expect(driven.sent, tool).toEqual([]);
      expect(driven.apps, tool).toEqual([]);
    }
  }
}

describe('mcp.refuse-write-stages', () => {
  it('refuses $out', () => {
    expect(readPipeline('[ { $match: {} }, { $out: "copy" } ]')).toEqual({ ok: false, message: refusal('$out') });
  });

  it('refuses $merge, and no tab opens', () => {
    const driven = drive('open_aggregation', { ...orders, pipeline: '[ { $merge: { into: "x" } } ]' });
    expect(failureOf(driven)).toBe(refusal('$merge'));
    expect(driven.apps.filter((each) => each.action === 'mcp.open-tab')).toEqual([]);
    expect(driven.sent).toEqual([]);
  });

  it('refuses a stage named $out with spaces around it', () => {
    expect(readPipeline('[ { " $out ": "copy" } ]')).toEqual({ ok: false, message: refusal('$out') });
    expect(readPipeline('[ { $facet: { a: [ { " $merge ": { into: "x" } } ] } } ]')).toEqual({
      ok: false,
      message: refusal('$merge'),
    });
  });

  it('refuses an empty pipeline and text it cannot read', () => {
    expect(readPipeline('[]')).toEqual({ ok: false, message: 'The pipeline is empty.' });
    const unreadable = readPipeline('[ { $match: ');
    expect(unreadable.ok).toBe(false);
    expect(unreadable.ok ? '' : unreadable.message).toMatch(/^Pipeline: /u);
  });

  it('reads the stages of a pipeline', () => {
    const read = readPipeline('[ { $match: { status: "paid" } }, { $group: { _id: "$city", n: { $sum: 1 } } } ]');
    expect(read.ok).toBe(true);
    expect(read.ok ? read.names : []).toEqual(['$match', '$group']);
  });

  it('refuses $out and $merge at any depth: in a $facet, a $lookup and a $unionWith', () => {
    expect(readPipeline('[ { $facet: { a: [ { $out: "copy" } ] } } ]')).toEqual({
      ok: false,
      message: refusal('$out'),
    });
    expect(
      readPipeline(
        '[ { $lookup: { from: "x", as: "y", pipeline: [ { $unionWith: { coll: "z", pipeline: [ { $merge: { into: "w" } } ] } } ] } } ]',
      ),
    ).toEqual({ ok: false, message: refusal('$merge') });
  });

  it('refuses every stage that is not a plain read of the collection, at any depth', () => {
    expect(readPipeline('[ { $currentOp: { allUsers: true } } ]')).toEqual({
      ok: false,
      message: notPlain('$currentOp'),
    });
    for (const stage of notPlainReadStages.filter((name) => name !== '$out' && name !== '$merge')) {
      expect(readPipeline(`[ { ${stage}: {} } ]`)).toEqual({ ok: false, message: notPlain(stage) });
      expect(readPipeline(`[ { $facet: { a: [ { ${stage}: {} } ] } } ]`)).toEqual({
        ok: false,
        message: notPlain(stage),
      });
    }
  });

  it('refuses a $lookup, a $graphLookup or a $unionWith that reads a system.* collection, at any depth', () => {
    expect(
      readPipeline('[ { $lookup: { from: "system.users", localField: "a", foreignField: "user", as: "u" } } ]'),
    ).toEqual({ ok: false, message: reads('system.users') });
    expect(readPipeline('[ { $unionWith: "system.profile" } ]')).toEqual({
      ok: false,
      message: reads('system.profile'),
    });
    expect(
      readPipeline(
        '[ { $graphLookup: { from: "system.views", startWith: "$a", connectFromField: "a", connectToField: "b", as: "c" } } ]',
      ),
    ).toEqual({ ok: false, message: reads('system.views') });
    expect(readPipeline('[ { $facet: { a: [ { $unionWith: { coll: "system.js", pipeline: [] } } ] } } ]')).toEqual({
      ok: false,
      message: reads('system.js'),
    });
  });

  it('refuses a pipeline nested deeper than 20', () => {
    const nested = (depth: number): string =>
      depth === 0 ? '[ { $match: {} } ]' : `[ { $facet: { a: ${nested(depth - 1)} } } ]`;
    expect(readPipeline(nested(20)).ok).toBe(true);
    expect(readPipeline(nested(21))).toEqual({ ok: false, message: 'Pipeline: The pipeline is nested too deeply' });
  });

  it('each refused worked example sends nothing and opens no tab, from every tool that takes a pipeline', () => {
    refusedEverywhere('[ { $match: {} }, { $out: "copy" } ]', refusal('$out'));
    refusedEverywhere('[ { $facet: { a: [ { $out: "copy" } ] } } ]', refusal('$out'));
    refusedEverywhere('[ { $currentOp: { allUsers: true } } ]', notPlain('$currentOp'));
    refusedEverywhere(
      '[ { $lookup: { from: "system.users", localField: "a", foreignField: "user", as: "u" } } ]',
      reads('system.users'),
    );
    refusedEverywhere('[ { $unionWith: "system.profile" } ]', reads('system.profile'));
  });

  it("gives the server's refusal of a pipeline it reads as the tool's failure", () => {
    const driven = drive(
      'aggregate',
      { ...orders, pipeline: '[ { $match: { $where: "1" } } ]' },
      {
        mongo: (request) =>
          request.method === 'listCollections'
            ? [{ name: 'orders', type: 'collection' }]
            : failed('$where is not allowed in this context', 2),
      },
    );
    expect(failureOf(driven)).toContain('$where is not allowed in this context');
  });
});
