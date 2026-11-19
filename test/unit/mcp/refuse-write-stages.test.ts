import { describe, expect, it } from 'vitest';
import { readPipeline } from '../../../src/features/mcp/refuse-write-stages';
import { drive, failed, failureOf } from './harness';

const refusal = (stage: string): string => `${stage} writes to the database: Datardo's MCP server only reads.`;

describe('mcp.refuse-write-stages', () => {
  it('refuses $out', () => {
    expect(readPipeline('[ { $match: {} }, { $out: "copy" } ]')).toEqual({ ok: false, message: refusal('$out') });
  });

  it('refuses $merge, and no tab opens', () => {
    const driven = drive('open_aggregation', {
      connection: 'Local',
      database: 'shop',
      collection: 'orders',
      pipeline: '[ { $merge: { into: "x" } } ]',
    });
    expect(failureOf(driven)).toBe(refusal('$merge'));
    expect(driven.apps.filter((each) => each.action === 'mcp.open-tab')).toEqual([]);
    expect(driven.sent).toEqual([]);
  });

  it('refuses a stage named $out with spaces around it', () => {
    expect(readPipeline('[ { " $out ": "copy" } ]')).toEqual({ ok: false, message: refusal('$out') });
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

  it("gives the server's refusal of a $merge inside a $lookup as the tool's failure", () => {
    const driven = drive(
      'aggregate',
      {
        connection: 'Local',
        database: 'shop',
        collection: 'orders',
        pipeline: '[ { $lookup: { from: "x", pipeline: [ { $merge: { into: "y" } } ], as: "z" } } ]',
      },
      {
        mongo: (request) =>
          request.method === 'listCollections'
            ? [{ name: 'orders', type: 'collection' }]
            : failed('$merge is not allowed within a $lookup', 51047),
      },
    );
    expect(failureOf(driven)).toContain('$merge is not allowed within a $lookup');
  });
});
