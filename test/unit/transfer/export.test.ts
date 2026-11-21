import { describe, expect, it } from 'vitest';
import {
  csvExport,
  exportEnd,
  exportPieces,
  exportMessage,
  exportRequest,
  plan,
  relaxed,
  type ExportWriterArgs,
} from '../../../src/features/transfer/export';
import { parseImport } from '../../../src/features/transfer/import-files';
import type { Answers, FileStep } from '../../../src/shared/feature';
import { contextOn, local, next, ordersOn, planOf, production } from './harness';

function exporting(answers: Answers, on = local) {
  return plan(contextOn(ordersOn(on), 'transfer.export'), answers);
}

const writerArgs: ExportWriterArgs = {
  task: null,
  connection: local.id,
  database: 'shop',
  collection: 'orders',
  format: 'jsonl',
  filter: '',
  projection: '',
  batchSize: 1000,
};

describe('transfer.export', () => {
  it('lists the three formats with their descriptions', () => {
    const outcome = exporting({});
    expect(outcome.kind === 'ask' && outcome.question).toMatchObject({
      title: 'Export orders',
      fields: [
        {
          kind: 'pick-one',
          key: 'format',
          choices: [
            { value: 'json', label: 'JSON', description: 'Array of documents, readable (relaxed Extended JSON)' },
            {
              value: 'jsonl',
              label: 'JSON Lines',
              description: 'One document per line, canonical Extended JSON: keeps every type, re-importable',
            },
            {
              value: 'csv',
              label: 'CSV',
              description: 'The columns shown in the table; expanded arrays give one row per element',
            },
          ],
        },
      ],
    });
  });

  it('offers all results or the current page from the toolbar, and exports exactly that page', () => {
    const args = { filter: '{ status: "active" }', page: { first: 101, last: 150 }, count: 1234 };
    const outcome = exporting({ args, format: 'json' });
    expect(outcome.kind === 'ask' && outcome.question.fields[0]).toMatchObject({
      key: 'scope',
      choices: [
        { value: 'all', label: 'All results (1,234 documents)' },
        { value: 'page', label: 'Current page (101–150)' },
      ],
    });
    const file = planOf(exporting({ args, format: 'json', scope: 'page', file: 'D:\\orders.json' }))
      .steps[0] as FileStep;
    const written = file.content?.args as unknown as ExportWriterArgs;
    expect(written).toMatchObject({
      format: 'json',
      filter: '{ status: "active" }',
      skip: 100,
      limit: 50,
      batchSize: 1000,
    });
    expect(exportRequest(written)).toEqual({
      engine: 'mongodb',
      database: 'shop',
      collection: 'orders',
      method: 'find',
      arguments: [{ status: 'active' }, { skip: { $numberInt: '100' }, limit: { $numberInt: '50' } }],
    });
  });

  it('exports a view from the tree without asking which results', () => {
    const outcome = exporting({ format: 'jsonl' });
    expect(outcome.kind === 'read' && outcome.need).toMatchObject({
      key: 'file',
      read: 'transfer.export:file',
      args: { mode: 'save', title: 'Export orders', button: 'Export', name: 'orders.jsonl' },
    });
    expect(planOf(exporting({ format: 'jsonl', file: null })).steps).toEqual([]);
    const step = planOf(exporting({ format: 'jsonl', file: 'D:\\orders.jsonl' })).steps[0] as FileStep;
    expect(step).toMatchObject({
      kind: 'file',
      action: 'write',
      path: 'D:\\orders.jsonl',
      text: 'write D:\\orders.jsonl',
    });
    expect(step.content).toEqual({ writer: 'transfer.export', args: writerArgs });
  });

  it('writes no documents as JSON as [] and a new line', () => {
    expect(exportEnd('json', 0)).toBe('[]\n');
    expect(exportPieces('json', [{ a: { $numberInt: '1' } }], 0) + exportEnd('json', 1)).toBe(
      '[\n  {\n    "a": 1\n  }\n]\n',
    );
  });

  it('writes JSON Lines in canonical Extended JSON', () => {
    const document = {
      i: { $numberInt: '42' },
      d: { $numberDouble: '42.0' },
      l: { $numberLong: '7' },
      m: { $numberDecimal: '1.5' },
      at: { $date: { $numberLong: '0' } },
      _id: { $oid: '64b000000000000000000001' },
    };
    expect(exportPieces('jsonl', [document], 0)).toBe(`${JSON.stringify(document)}\n`);
    expect(exportEnd('jsonl', 1)).toBe('');
  });

  it('keeps a whole Double a Double through JSON Lines and an import, also beyond 32 bits', () => {
    const document = { a: { $numberDouble: '42.0' }, b: { $numberDouble: '5000000000.0' } };
    expect(parseImport(exportPieces('jsonl', [document], 0), 'orders.jsonl')).toEqual([document]);
  });

  it('writes JSON relaxed: numbers as numbers, dates as ISO text', () => {
    expect(
      relaxed({
        n: { $numberInt: '1' },
        at: { $date: { $numberLong: '0' } },
        big: { $numberLong: '9007199254740993' },
      }),
    ).toEqual({
      n: 1,
      at: { $date: '1970-01-01T00:00:00.000Z' },
      big: { $numberLong: '9007199254740993' },
    });
  });

  it('starts a CSV file with the bytes EF BB BF and the visible columns in their order', () => {
    const text = csvExport([{ _id: { $numberInt: '1' }, name: 'a' }], [{ path: ['name'], key: 'name', array: false }]);
    expect([...new TextEncoder().encode(text).subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(text.slice(1)).toBe('name\r\na\r\n');
  });

  it('asks nothing when the pipeline ends with $merge, and names it', () => {
    const outcome = exporting({ args: { pipeline: ['{ $match: {} }', '{ $merge: { into: "x" } }'] } });
    expect(outcome).toEqual({
      kind: 'refuse',
      code: 'transfer.export/writes',
      message:
        "Export failed: A pipeline ending with $merge writes to the database and can't be exported. " +
        'Select an earlier stage to export its output.',
    });
  });

  it('refuses a filter that does not parse', () => {
    expect(next(exporting({ args: { filter: '{ status: ' } }))).toBe('refuse:transfer.export/invalid-query');
  });

  it('works on a read-only connection', () => {
    expect(planOf(exporting({ format: 'csv', file: 'D:\\o.csv' }, production)).steps[0]?.kind).toBe('file');
  });

  it('reads a pipeline up to the stage shown, and a selection by its _ids', () => {
    const args = { ...writerArgs, pipeline: ['{ $match: { a: 1 } }'], ids: [{ $numberInt: '7' }], skip: 0, limit: 10 };
    expect(exportRequest(args).arguments).toEqual([
      [
        { $match: { a: { $numberInt: '1' } } },
        { $match: { _id: { $in: [{ $numberInt: '7' }] } } },
        { $skip: { $numberInt: '0' } },
        { $limit: { $numberInt: '10' } },
      ],
      { allowDiskUse: true },
    ]);
  });

  it('ends with Exported <n> documents to <file name>, with Open and Reveal, which start the export on that file', () => {
    const done = exportMessage(writerArgs, { kind: 'done', documents: 1200, path: 'D:\\out\\orders.jsonl' });
    expect(done).toMatchObject({ level: 'success', text: 'Exported 1,200 documents to orders.jsonl.' });
    expect(done.actions?.map((action) => [action.label, action.feature, action.args])).toEqual([
      ['Open', 'transfer.export', { open: 'D:\\out\\orders.jsonl' }],
      ['Reveal', 'transfer.export', { reveal: 'D:\\out\\orders.jsonl' }],
    ]);
    const opened = planOf(exporting({ args: { reveal: 'D:\\out\\orders.jsonl' } }));
    expect(opened.steps).toEqual([
      expect.objectContaining({ kind: 'app', action: 'transfer.reveal-path', args: { path: 'D:\\out\\orders.jsonl' } }),
    ]);
    expect(exportMessage(writerArgs, { kind: 'cancelled' })).toMatchObject({
      level: 'info',
      text: 'Export cancelled.',
    });
    expect(exportMessage(writerArgs, { kind: 'failed', error: 'disk full' })).toMatchObject({
      level: 'error',
      text: 'Export failed: disk full',
    });
  });
});
