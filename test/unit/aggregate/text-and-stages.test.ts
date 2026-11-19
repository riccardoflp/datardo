import { describe, expect, it } from 'vitest';
import { builtPipeline } from '../../../src/features/aggregate/build';
import { pipelineStages } from '../../../src/features/aggregate/from-text';
import { pipelineSummary, pipelineText } from '../../../src/features/aggregate/to-text';
import type { Stage } from '../../../src/features/aggregate/types';
import { off, stage, value } from './stages';

describe('aggregate.to-text', () => {
  const example = [
    stage('$match', '{ status: "paid", createdAt: { $gte: ISODate("2024-01-01") } }'),
    stage('$group', '{\n  _id: "$customer",\n  total: { $sum: "$total" }\n}'),
    off('$sort', '{ total: -1 }'),
    stage('$limit', '10'),
  ];

  it('writes the first worked example exactly, and its short form', () => {
    expect(pipelineText(example)).toBe(
      [
        '[',
        '  {',
        '    $match: {',
        '      status: "paid",',
        '      createdAt: { $gte: ISODate("2024-01-01T00:00:00.000Z") }',
        '    }',
        '  },',
        '  { $group: { _id: "$customer", total: { $sum: "$total" } } },',
        '  { $limit: 10 }',
        ']',
      ].join('\n'),
    );
    expect(pipelineSummary(example)).toBe('$match → $group → $limit');
  });

  it('writes no stages as [] and the short form empty pipeline', () => {
    expect(pipelineText([])).toBe('[]');
    expect(pipelineSummary([])).toBe('empty pipeline');
  });

  it('writes an unfinished body as it was typed', () => {
    expect(pipelineText([stage('$match', '{ status: ')])).toBe('[\n  { $match: { status: }\n]');
  });

  it('gives a text that from-text reads back to the same pipeline, with the same BSON types', () => {
    const stages = [
      stage('$match', '{ n: NumberLong("5"), d: NumberDecimal("0.10"), i: 5, f: 5.5, w: Double(5) }'),
      stage('$lookup', '{ from: "customers", localField: "customer", foreignField: "_id", as: "who" }'),
      stage('$project', '{ at: ISODate("2024-01-01"), id: ObjectId("65f1c0de9a1b2c3d4e5f6a7b"), r: /^a/i }'),
    ];
    const back = pipelineStages(pipelineText(stages));
    expect(back.ok).toBe(true);
    const sent = (list: readonly Stage[]) => builtPipeline(list, list.length - 1);
    expect(sent(back.ok ? back.stages : [])).toEqual(sent(stages));
    const built = sent(stages);
    expect(built.ok ? built.pipeline[0] : undefined).toEqual({
      $match: {
        n: { $numberLong: '5' },
        d: { $numberDecimal: '0.10' },
        i: { $numberInt: '5' },
        f: { $numberDouble: '5.5' },
        w: { $numberDouble: '5.0' },
      },
    });
  });

  it('keeps a stage of 30 characters on one line, and writes a long $lookup one option per line', () => {
    expect(pipelineText([stage('$match', '{ status: "paid" }')])).toBe('[\n  { $match: { status: "paid" } }\n]');
    const lookup = stage(
      '$lookup',
      '{ from: "customers", localField: "customerId", foreignField: "_id", as: "customerDetails" }',
    );
    expect(pipelineText([lookup])).toBe(
      [
        '[',
        '  {',
        '    $lookup: {',
        '      from: "customers",',
        '      localField: "customerId",',
        '      foreignField: "_id",',
        '      as: "customerDetails"',
        '    }',
        '  }',
        ']',
      ].join('\n'),
    );
  });

  it('leaves a disabled stage out of the text and of the short form', () => {
    const stages = [stage('$match', '{}'), off('$sort', '{ a: 1 }')];
    expect(pipelineText(stages)).not.toContain('$sort');
    expect(pipelineSummary(stages)).toBe('$match');
  });

  it('keeps ISODate() as it was typed, so that the text does not freeze a time', () => {
    expect(pipelineText([stage('$match', '{ at: { $lt: ISODate() } }')])).toBe(
      '[\n  { $match: { at: { $lt: ISODate() } } }\n]',
    );
  });
});

describe('aggregate.from-text', () => {
  it('reads the first worked example into three stages', () => {
    const read = pipelineStages(
      '[ { $match: { status: "paid" } }, { $group: { _id: "$customer", total: { $sum: "$total" }, orders: { $sum: 1 } } }, { $limit: 10 } ]',
    );
    expect(read).toEqual({
      ok: true,
      stages: [
        stage('$match', '{ status: "paid" }'),
        stage('$group', '{\n  _id: "$customer",\n  total: { $sum: "$total" },\n  orders: { $sum: 1 }\n}'),
        stage('$limit', '10'),
      ],
    });
  });

  it('reads a single object as a pipeline of one stage', () => {
    expect(pipelineStages('{ $match: { a: 1 } }')).toEqual({ ok: true, stages: [stage('$match', '{ a: 1 }')] });
  });

  it('refuses items that are not a single $operator', () => {
    for (const wrong of ['[ { a: 1 } ]', '[ { $match: {}, $sort: {} } ]', '[ 5 ]']) {
      expect(pipelineStages(wrong)).toEqual({
        ok: false,
        message: 'Stage 1 must be an object with a single $operator key',
      });
    }
  });

  it("gives the parser's message for a text it cannot read", () => {
    expect(pipelineStages('{ $match: ')).toEqual({ ok: false, message: 'JSON5: invalid end of input at 1:11' });
  });

  it('reads the empty text as no stages', () => {
    expect(pipelineStages('')).toEqual({ ok: true, stages: [] });
    expect(pipelineStages('   \n ')).toEqual({ ok: true, stages: [] });
  });

  it('writes a body longer than 36 columns on three lines', () => {
    expect(pipelineStages('[ { $match: { _id: ObjectId("65f1c0de9a1b2c3d4e5f6a7b") } } ]')).toEqual({
      ok: true,
      stages: [stage('$match', '{\n  _id: ObjectId("65f1c0de9a1b2c3d4e5f6a7b")\n}')],
    });
  });

  it('reads a text with a // comment line between two stages', () => {
    const read = pipelineStages('[\n  { $match: { a: 1 } },\n  // then sort\n  { $sort: { a: -1 } }\n]');
    expect(read).toEqual({ ok: true, stages: [stage('$match', '{ a: 1 }'), stage('$sort', '{ a: -1 }')] });
  });

  it('reports the second item of [ { $match: {} }, { limit: 5 } ]', () => {
    expect(pipelineStages('[ { $match: {} }, { limit: 5 } ]')).toEqual({
      ok: false,
      message: 'Stage 2 must be an object with a single $operator key',
    });
  });
});

describe('aggregate.build', () => {
  const three = [
    stage('$match', '{ status: "paid" }'),
    stage('$group', '{ _id: "$customer", n: { $sum: 1 } }'),
    stage('$sort', '{ n: -1 }'),
  ];

  it('builds the nine worked examples', () => {
    expect(builtPipeline(three, 2)).toEqual({
      ok: true,
      pipeline: [
        value('{ $match: { status: "paid" } }'),
        value('{ $group: { _id: "$customer", n: { $sum: 1 } } }'),
        value('{ $sort: { n: -1 } }'),
      ],
    });
    expect(builtPipeline(three, 1)).toEqual({
      ok: true,
      pipeline: [value('{ $match: { status: "paid" } }'), value('{ $group: { _id: "$customer", n: { $sum: 1 } } }')],
    });
    const firstOff = [off('$match', '{ status: "paid" }'), ...three.slice(1)];
    expect(builtPipeline(firstOff, 2)).toEqual({
      ok: true,
      pipeline: [value('{ $group: { _id: "$customer", n: { $sum: 1 } } }'), value('{ $sort: { n: -1 } }')],
    });
    const out = [stage('$match', '{ a: 1 }'), stage('$out', '"copy"')];
    expect(builtPipeline(out, 1)).toEqual({
      ok: true,
      pipeline: [value('{ $match: { a: 1 } }'), { $out: 'copy' }],
      writes: { index: 1, name: '$out', body: 'copy' },
    });
    expect(builtPipeline(out, 0)).toEqual({ ok: true, pipeline: [value('{ $match: { a: 1 } }')] });
    expect(builtPipeline([stage('$out', '"copy"'), stage('$match', '{ a: 1 }')], 1)).toEqual({
      ok: false,
      message: '$out must be the last stage of the pipeline',
      stage: 0,
    });
    const search = stage('$search', '{ index: "default", text: { query: "x", path: "name" } }');
    expect(builtPipeline([stage('$match', '{ a: 1 }'), search], 1)).toEqual({
      ok: false,
      message: '$search must be the first stage of the pipeline',
      stage: 1,
    });
    expect(builtPipeline([off('$match', '{}'), stage('$group', '{ _id: ')], 1)).toEqual({
      ok: false,
      message: 'Stage 2 ($group): JSON5: invalid end of input at 1:8',
      stage: 1,
    });
    expect(builtPipeline([], -1)).toEqual({ ok: true, pipeline: [] });
  });

  it('never parses a disabled stage', () => {
    expect(builtPipeline([off('$match', '{{{'), stage('$limit', '5')], 1).ok).toBe(true);
  });

  it('never parses a stage after the stage shown', () => {
    expect(builtPipeline([stage('$match', '{}'), stage('$sort', '{ a: 1 }'), stage('$limit', '{{{')], 0).ok).toBe(true);
  });

  it('names the number the stage has in the editor', () => {
    const built = builtPipeline([off('$match', '{}'), stage('$sort', '{ a: ')], 1);
    expect(built.ok ? '' : built.message).toMatch(/^Stage 2 \(\$sort\): /u);
  });

  it('sends NumberLong("9007199254740993") as an Int64 of that exact value', () => {
    const built = builtPipeline([stage('$match', '{ n: NumberLong("9007199254740993") }')], 0);
    expect(built).toEqual({ ok: true, pipeline: [{ $match: { n: { $numberLong: '9007199254740993' } } }] });
  });

  it('gives no error for a disabled $out in the middle, and the pipeline does not write', () => {
    const built = builtPipeline([stage('$match', '{}'), off('$out', '"x"'), stage('$limit', '5')], 2);
    expect(built.ok && built.writes === undefined).toBe(true);
  });

  it('refuses a name that is not a stage operator, and an empty body', () => {
    expect(builtPipeline([stage('$match', '{}'), stage('match', '{}')], 1)).toEqual({
      ok: false,
      message: 'Stage 2 (match): "match" is not a stage operator (e.g. $match)',
      stage: 1,
    });
    expect(builtPipeline([stage('$match', '{}'), stage('$match', '  ')], 1)).toEqual({
      ok: false,
      message: 'Stage 2 ($match): The stage body is empty',
      stage: 1,
    });
  });

  it('sends 5 as an Int32, 5.5 as a Double and NumberDecimal("0.10") as a Decimal128', () => {
    const built = builtPipeline([stage('$match', '{ a: 5, b: 5.5, c: NumberDecimal("0.10") }')], 0);
    expect(built.ok ? built.pipeline : []).toEqual([
      { $match: { a: { $numberInt: '5' }, b: { $numberDouble: '5.5' }, c: { $numberDecimal: '0.10' } } },
    ]);
  });
});
