import { describe, expect, it } from 'vitest';
import { rawPath, view, type RawRow } from '../../../src/features/explain/raw';
import type { Json } from '../../../src/shared/engine-request';
import { explainReply, int } from './replies';

type OpenRow = Extract<RawRow, { kind: 'open' }>;

function rowAt(rows: readonly RawRow[], keys: readonly string[]): RawRow | undefined {
  const path = rawPath(keys);
  return rows.find((row) => row.kind === 'open' && row.path === path);
}

function openAt(rows: readonly RawRow[], keys: readonly string[]): OpenRow {
  const row = rowAt(rows, keys);
  if (row?.kind !== 'open') {
    throw new Error(`No row opens at ${rawPath(keys)}`);
  }
  return row;
}

function keysAtDepth(rows: readonly RawRow[], depth: number): readonly string[] {
  return rows.flatMap((row) => (row.kind !== 'close' && row.depth === depth ? [row.key ?? ''] : []));
}

describe('explain.raw', () => {
  it('shows the fields of the output at the first level, in the order of the server', () => {
    const output = explainReply('find-ixscan');
    const keys = keysAtDepth(view({ output, toggled: [] }).rows, 1);
    expect(keys).toEqual(Object.keys(output as object));
    expect(keys.slice(0, 3)).toEqual(['explainVersion', 'queryPlanner', 'executionStats']);
    expect(keys).toContain('serverInfo');
  });

  it('starts the inputStage of executionStages folded, reading its number of fields, and unfolds it on a click', () => {
    const output = explainReply('find-ixscan');
    const inputStage = ['executionStats', 'executionStages', 'inputStage'];
    const rows = view({ output, toggled: [] }).rows;
    expect(openAt(rows, ['executionStats', 'executionStages']).folded).toBe(false);
    const folded = openAt(rows, inputStage);
    expect(folded).toMatchObject({ folded: true, size: '24 fields', bracket: '{' });
    expect(rows.some((row) => row.kind === 'value' && row.key === 'keysExamined')).toBe(false);
    const unfolded = view({ output, toggled: folded.next }).rows;
    expect(openAt(unfolded, inputStage).folded).toBe(false);
    expect(unfolded.some((row) => row.kind === 'value' && row.key === 'keysExamined' && row.depth === 4)).toBe(true);
    expect(openAt(unfolded, inputStage).next).toEqual([]);
  });

  it('folds a level that starts unfolded on a click, and closes each row it opens', () => {
    const output = explainReply('find-collscan');
    const rows = view({ output, toggled: [] }).rows;
    const planner = openAt(rows, ['queryPlanner']);
    const folded = view({ output, toggled: planner.next }).rows;
    expect(openAt(folded, ['queryPlanner'])).toMatchObject({ folded: true });
    expect(folded.length).toBeLessThan(rows.length);
    const opened = rows.filter((row) => row.kind === 'open' && !row.folded).length;
    expect(rows.filter((row) => row.kind === 'close').length).toBe(opened);
    expect(rows.at(-1)).toEqual({ kind: 'close', depth: 0, bracket: '}' });
  });

  it('gives the rejected plans that the summary only counts, whole', () => {
    const output = explainReply('find-ixscan-sort');
    const rejected = ['queryPlanner', 'rejectedPlans'];
    const rows = view({ output, toggled: [] }).rows;
    expect(openAt(rows, rejected)).toMatchObject({ bracket: '[', size: '1 item' });
    const plan = openAt(rows, [...rejected, '0']);
    expect(plan.folded).toBe(true);
    const whole = view({ output, toggled: [...plan.next, rawPath([...rejected, '0', 'inputStage'])] }).rows;
    const values = whole.filter((row) => row.kind === 'value');
    expect(values.some((row) => row.key === 'indexName' && row.text === '"createdAt_-1"')).toBe(true);
  });

  it('shows the Timestamp and the binary signature of $clusterTime with their types', () => {
    const rows = view({ output: explainReply('find-collscan'), toggled: [] }).rows;
    const clusterTime = rows.find((row) => row.kind === 'value' && row.key === 'clusterTime');
    expect(clusterTime).toMatchObject({ type: 'timestamp', depth: 2 });
    expect(clusterTime?.kind === 'value' ? clusterTime.text : '').toMatch(/^Timestamp\(\{ t: \d+, i: \d+ \}\)$/u);
    expect(openAt(rows, ['$clusterTime', 'signature']).folded).toBe(false);
    expect(rows.find((row) => row.kind === 'value' && row.key === 'hash')).toMatchObject({ type: 'binData' });
    expect(rows.find((row) => row.kind === 'value' && row.key === 'keyId')).toMatchObject({ type: 'int' });
  });

  it('writes each value in mongosh syntax with its type, a Long staying a Long, nothing cut', () => {
    const long = 'x'.repeat(5000);
    const output: Json = {
      n: { $numberLong: '1200' },
      at: { $date: { $numberLong: '1709288430123' } },
      d: { $numberDouble: '1.5' },
      i: int(3),
      text: long,
      none: null,
      empty: {},
      list: [],
    };
    const values = view({ output, toggled: [] }).rows.filter((row) => row.kind === 'value');
    expect(values.map((row) => [row.key, row.type])).toEqual([
      ['n', 'long'],
      ['at', 'date'],
      ['d', 'double'],
      ['i', 'int'],
      ['text', 'string'],
      ['none', 'null'],
      ['empty', 'object'],
      ['list', 'array'],
    ]);
    expect(values[0]?.text).toMatch(/1200/u);
    expect(values[0]?.text).not.toBe('1200');
    expect(values[1]?.text).toBe('ISODate("2024-03-01T10:20:30.123Z")');
    expect(values[4]?.text).toBe(JSON.stringify(long));
  });

  it('draws an output that is not a document as one value', () => {
    expect(view({ output: 'nothing', toggled: [] }).rows).toEqual([
      { kind: 'value', depth: 0, text: '"nothing"', type: 'string' },
    ]);
  });
});
