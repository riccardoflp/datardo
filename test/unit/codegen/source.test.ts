import { describe, expect, it } from 'vitest';
import { codeQuery, type CodeSource } from '../../../src/features/codegen/source';
import { generatedCode } from '../../../src/features/codegen/types';
import { chartStages } from '../../../src/features/chart/pipeline';
import type { ChartOptions, EditorStage, ParsedText } from '../../../src/features/chart/types';
import type { Json } from '../../../src/shared/engine-request';
import { findExample, int, pipelineStages } from './queries';

const on = { database: 'shop', collection: 'orders' };
const empty: ParsedText = { kind: 'empty' };

function value(json: Json): ParsedText {
  return { kind: 'value', value: json };
}

function find(filter: ParsedText, projection: ParsedText = empty, sort: ParsedText = empty): CodeSource {
  return { ...on, kind: 'find', filter, projection, sort };
}

function stages(enabled: readonly boolean[] = [true, true, true, true]): readonly EditorStage[] {
  return pipelineStages.map((stage, index) => {
    const [name, body] = Object.entries(stage as Record<string, Json>)[0] ?? ['', null];
    return { name, body: value(body), enabled: enabled[index] ?? true };
  });
}

const bar: ChartOptions = { type: 'bar', first: 'status', value: 'count', limit: 20 };
const totalAtLeast100 = { total: { $gte: int(100) } };

describe('codegen.source', () => {
  it('gives the find example as a find with its three documents, with their types', () => {
    const result = codeQuery(
      find(value(findExample.filter), value(findExample.projection ?? {}), value(findExample.sort ?? {})),
    );
    expect(result).toEqual({ kind: 'code', query: findExample, ...on, title: 'find' });
  });

  it('leaves out a sort of {} and an empty projection', () => {
    expect(codeQuery(find(value({ status: 'paid' }), empty, value({})))).toEqual({
      kind: 'code',
      query: { kind: 'find', filter: { status: 'paid' } },
      ...on,
      title: 'find',
    });
  });

  it('gives a find of {} when nothing is typed', () => {
    expect(codeQuery(find(empty))).toMatchObject({ kind: 'code', query: { kind: 'find', filter: {} } });
  });

  it('leaves out a disabled stage and counts the others in the title', () => {
    const result = codeQuery({ ...on, kind: 'aggregate', stages: stages([true, true, false, true]) });
    expect(result).toEqual({
      kind: 'code',
      query: { kind: 'aggregate', pipeline: [pipelineStages[0], pipelineStages[1], pipelineStages[3]] },
      ...on,
      title: 'aggregate (3 stages)',
    });
    const one = codeQuery({ ...on, kind: 'aggregate', stages: stages([true, false, false, false]) });
    expect(one).toMatchObject({ title: 'aggregate (1 stage)' });
  });

  it('writes every enabled stage, whatever stage is shown', () => {
    expect(codeQuery({ ...on, kind: 'aggregate', stages: stages() })).toMatchObject({
      query: { kind: 'aggregate', pipeline: pipelineStages },
      title: 'aggregate (4 stages)',
    });
  });

  it('writes a chart of the filter as its $match and the stages of the chart, titled bar chart', () => {
    const result = codeQuery({
      ...on,
      kind: 'chart',
      chart: bar,
      source: { kind: 'filter', filter: value(totalAtLeast100) },
    });
    expect(result).toEqual({
      kind: 'code',
      query: { kind: 'aggregate', pipeline: [{ $match: totalAtLeast100 }, ...chartStages(bar)] },
      ...on,
      title: 'bar chart',
    });
  });

  it('writes a chart of a pipeline shown up to its second stage with two stages before the chart', () => {
    const result = codeQuery({
      ...on,
      kind: 'chart',
      chart: bar,
      source: { kind: 'pipeline', stages: stages(), shown: 1 },
    });
    expect(result).toMatchObject({
      query: { kind: 'aggregate', pipeline: [pipelineStages[0], pipelineStages[1], ...chartStages(bar)] },
    });
    const histogram = codeQuery({
      ...on,
      kind: 'chart',
      chart: { ...bar, type: 'histogram' },
      source: { kind: 'filter', filter: empty },
    });
    expect(histogram).toMatchObject({ title: 'histogram chart' });
  });

  it('says a projection that is not a document is not an object', () => {
    expect(codeQuery(find(empty, value('total')))).toEqual({
      kind: 'invalid',
      message: 'Invalid query: Project must be an object',
    });
    expect(codeQuery(find(value([int(1)])))).toEqual({
      kind: 'invalid',
      message: 'Invalid query: Filter must be an object',
    });
    expect(codeQuery(find(empty, empty, value(int(1))))).toEqual({
      kind: 'invalid',
      message: 'Invalid query: Sort must be an object',
    });
  });

  it("says the parser's message for a filter that does not parse", () => {
    const message = 'Unexpected end of input at line 1, column 6';
    expect(codeQuery(find({ kind: 'invalid', message }))).toEqual({
      kind: 'invalid',
      message: `Invalid query: ${message}`,
    });
  });

  it('writes the name of a view of the tab', () => {
    const result = codeQuery({ ...find(empty), collection: 'paidOrders' });
    if (result.kind !== 'code') {
      throw new Error(result.message);
    }
    const code = generatedCode('nodejs', result.query, {
      database: 'shop',
      collection: result.collection,
      program: false,
    });
    expect(code).toContain('.collection("paidOrders")');
  });
});
