import { describe, expect, it } from 'vitest';
import type { Json } from '../../../src/shared/engine-request';
import { connectionId, tabId } from '../../../src/shared/ids';
import {
  relaxedText,
  resultCell,
  resultTable,
  resultValue,
  summaryOf,
  view,
  type ResultsView,
} from '../../../src/features/playground/results';
import { endedResult, errorMessage, scriptLine } from '../../../src/features/playground/results/ending';
import { printedLine } from '../../../src/features/playground/runtime';
import type { PlaygroundRun, RunResult } from '../../../src/features/playground/types';

const run: PlaygroundRun = {
  tab: tabId('t1'),
  title: 'Playground 1',
  connection: connectionId('c-local'),
  connectionName: 'Local',
  database: 'shop',
  startedAt: 1000,
  firstLine: 1,
};

function result(overrides: Partial<RunResult>): RunResult {
  return {
    title: 'Playground 1',
    connectionName: 'Local',
    database: 'shop',
    durationMs: 38,
    value: { kind: 'none' },
    output: [],
    ...overrides,
  };
}

function done(shown: ResultsView): Extract<ResultsView, { state: 'done' }> {
  if (shown.state !== 'done') {
    throw new Error(`Expected a result, got ${shown.state}`);
  }
  return shown;
}

function order(n: number): Json {
  return { _id: { $numberInt: String(n) }, item: 'pen' };
}

describe('playground.results', () => {
  it('shows the first 200 documents of a cursor of 201, and says there are others', () => {
    const value = resultValue({ kind: 'cursor', documents: Array.from({ length: 201 }, (_, n) => order(n)) });
    expect(value).toMatchObject({ kind: 'documents', more: true });
    expect(value.kind === 'documents' ? value.documents : []).toHaveLength(200);
    expect(summaryOf(result({ value }))).toBe(
      'Playground 1 · Local › shop · 38 ms · 200 documents (first 200; add .limit() or .toArray() for others)',
    );
  });

  it('summarizes a run of 38 ms that returned 2 documents, and 1 document for one', () => {
    const two = resultValue({ kind: 'value', value: [order(1), order(2)] });
    expect(summaryOf(result({ value: two }))).toBe('Playground 1 · Local › shop · 38 ms · 2 documents');
    expect(summaryOf(result({ value: resultValue({ kind: 'cursor', documents: [order(1)] }) }))).toBe(
      'Playground 1 · Local › shop · 38 ms · 1 document',
    );
  });

  it('puts #, then _id, then the fields as first met, and leaves a missing field empty', () => {
    const table = resultTable([
      { item: 'pen', _id: 1 },
      { _id: 2, total: 5 },
    ]);
    expect(table.columns).toEqual(['#', '_id', 'item', 'total']);
    expect(table.rows[0]?.cells[2]).toEqual({ kind: 'empty' });
    expect(table.rows[1]?.number).toBe(2);
  });

  it('shows 1,000 documents of a longer array and says so', () => {
    const table = resultTable(Array.from({ length: 1500 }, (_, n) => order(n)));
    expect(table.rows).toHaveLength(1000);
    expect(table.note).toBe('Showing 1000 of 1500 documents.');
  });

  it('cuts a cell at 160 characters, with the whole value as its tooltip after 40', () => {
    const long = 'x'.repeat(300);
    const cell = resultCell(long);
    expect(cell.kind === 'value' ? Array.from(cell.text).length : 0).toBe(161);
    expect(cell.kind === 'value' ? cell.text.endsWith('…') : false).toBe(true);
    expect(cell.kind === 'value' ? cell.tooltip : undefined).toBe(`"${long}"`);
    expect(resultCell('short')).not.toHaveProperty('tooltip');
    expect(resultCell({ $oid: '64b7f0c2a1b2c3d4e5f60718' })).toMatchObject({ type: 'objectId' });
  });

  it('shows the documents as mongosh text with JSON, and copies them as relaxed Extended JSON', () => {
    const value = resultValue({ kind: 'cursor', documents: [{ _id: { $oid: '64b7f0c2a1b2c3d4e5f60718' } }] });
    const shown = done(view({ result: result({ value }), readOnly: false, layout: 'json' }));
    expect(shown.value.kind).toBe('text');
    expect(shown.value.kind === 'text' ? shown.value.text : '').toContain('ObjectId("64b7f0c2a1b2c3d4e5f60718")');
    expect(shown.copyJsonText).toBe(relaxedText([{ _id: { $oid: '64b7f0c2a1b2c3d4e5f60718' } }]));
    expect(relaxedText({ n: { $numberInt: '5' } })).toBe('{\n  "n": 5\n}');
    expect(shown.toolbar.json.pressed).toBe(true);
    expect(shown.toolbar.copy.disabled).toBe(false);
  });

  it('shows a value as text, with Table disabled', () => {
    const shown = done(
      view({
        result: result({ value: resultValue({ kind: 'value', value: 1204 }) }),
        readOnly: false,
        layout: 'table',
      }),
    );
    expect(shown.value).toEqual({ kind: 'text', text: '1204' });
    expect(shown.toolbar.table.disabled).toBe(true);
  });

  it('shows a value that cannot be BSON as its text', () => {
    const value = resultValue({ kind: 'text', text: '[Function total]' });
    expect(done(view({ result: result({ value }), readOnly: false, layout: 'table' })).value).toEqual({
      kind: 'text',
      text: '[Function total]',
    });
    expect(printedLine([{ kind: 'function', name: '' }], 'line')).toBe('[Function anonymous]');
  });

  it('disables both copies when there is no value, and says the script has no value', () => {
    const shown = done(view({ result: result({}), readOnly: false, layout: 'table' }));
    expect(shown.value).toEqual({ kind: 'message', text: 'The script ran; its last statement has no value.' });
    expect(shown.toolbar.copy.disabled).toBe(true);
    expect(shown.toolbar.copyJson.disabled).toBe(true);
    expect(done(view({ result: result({ output: ['a'] }), readOnly: false, layout: 'table' })).value).toEqual({
      kind: 'none',
    });
  });

  it('says No documents. for an empty cursor', () => {
    const value = resultValue({ kind: 'cursor', documents: [] });
    expect(done(view({ result: result({ value }), readOnly: false, layout: 'table' })).value).toEqual({
      kind: 'message',
      text: 'No documents.',
    });
  });

  it('shows the printed lines under Output, printjson on its own lines', () => {
    const lines = ['a', printedLine([{ kind: 'value', value: { b: { $numberInt: '1' } } }], 'pretty')];
    const shown = done(view({ result: result({ output: lines }), readOnly: false, layout: 'table' }));
    expect(shown.output).toEqual({ title: 'Output', lines: ['a', '{ b: 1 }'] });
  });

  it('shows an error with the link to its line in the script', () => {
    const shown = done(
      view({
        result: result({ error: { message: 'boom', line: scriptLine(2, 3) ?? 0 }, output: ['before'] }),
        readOnly: false,
        layout: 'table',
      }),
    );
    expect(shown.error).toEqual({
      message: 'boom',
      line: { label: 'line 4', name: 'Show the line in the playground', line: 4, element: 'playground.results@list' },
    });
    expect(shown.value).toEqual({ kind: 'none' });
    expect(shown.output?.lines).toEqual(['before']);
  });

  it('starts an error with its name unless it is a plain Error', () => {
    expect(errorMessage('TypeError', 'u is null')).toBe('TypeError: u is null');
    expect(errorMessage('Error', 'boom')).toBe('boom');
    expect(errorMessage('SyntaxError', 'SyntaxError: Unexpected token')).toBe('SyntaxError: Unexpected token');
  });

  it('says what a playground does before the first run, or that the connection is read-only', () => {
    expect(view({ readOnly: false, layout: 'table' })).toEqual({
      state: 'before',
      lines: [
        'Run a playground with Ctrl+Enter.',
        'A playground runs what its script says. Dropping a collection or a database is confirmed first; every other write runs as written. Nothing a playground does is recorded in the undo history.',
      ],
    });
    const readOnly = view({ readOnly: true, layout: 'table' });
    expect(readOnly.state === 'before' ? readOnly.lines[1] : '').toBe(
      'The connection is read-only: the script can read, and every write it makes is refused.',
    );
  });

  it('keeps the results before, dimmed, while running', () => {
    const shown = view({ run, result: result({}), readOnly: false, layout: 'table' });
    expect(shown).toMatchObject({ state: 'running', running: 'Running Playground 1 on Local › shop…' });
    expect(shown.state === 'running' ? shown.before?.summary : '').toBe('Playground 1 · Local › shop · 38 ms');
  });

  it('ends a run with the database current at the end, and the notes after the output', () => {
    const ended = endedResult({
      run,
      endedAt: 1038,
      output: ['a'],
      notes: ['Note: a session left open was ended.'],
      end: { kind: 'done', value: { kind: 'value', value: 3 }, database: 'archive' },
    });
    expect(ended).toEqual(
      result({
        database: 'archive',
        value: { kind: 'value', value: 3 },
        output: ['a', 'Note: a session left open was ended.'],
      }),
    );
  });

  it('says the process ended before the script when it is gone', () => {
    const ended = endedResult({ run, endedAt: 2000, output: [], notes: [], end: { kind: 'process-ended' } });
    expect(ended.error?.message).toBe(
      "The playground's process ended before the script did: it may have run out of memory.",
    );
  });
});
